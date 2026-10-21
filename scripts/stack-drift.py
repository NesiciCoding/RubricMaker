#!/usr/bin/env python3
"""Compare a self-hosted Supabase stack with this repository: migrations and edge functions.

The official Supabase Docker stack keeps no record of which migration files were applied, so this
tool works it out from the database itself. It reads every migration in order, collects what each
one leaves behind (tables, columns, indexes, views, types, functions with their exact body, policies,
triggers, pg_cron jobs, storage buckets; later drops, renames and redefinitions taken into account),
and looks for those objects in the live catalog.

    check      (default, read-only) per-migration status and edge-function drift
    baseline   record the migrations that are already applied in public._migrations, the table
               docker/migrate.sh uses, so later runs can tell applied from pending exactly
    apply      run pending migrations in order, each in one transaction with its record row

Usage (on the server, as root or a docker-group user):

    python3 scripts/stack-drift.py [check|baseline|apply] [--supabase-dir DIR] [--repo-dir DIR]
                                   [--verbose] [--yes] [--accept NAME ...]

Exit status: 0 nothing pending or drifting, 1 drift or pending migrations, 2 error.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import subprocess
import sys
from collections import OrderedDict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DB_CONTAINER = os.environ.get("DB_CONTAINER", "supabase-db")
FUNCTIONS_CONTAINER = os.environ.get("FUNCTIONS_CONTAINER", "supabase-edge-functions")
SYSTEM_SCHEMAS = "('pg_catalog','information_schema','pg_toast')"

# ── SQL scanning ────────────────────────────────────────────────────────────────────────────────


def split_sql(sql: str) -> tuple[list[str], list[str]]:
    """Statements with comments removed and every dollar-quoted body replaced by $BODYn$."""
    statements: list[str] = []
    bodies: list[str] = []
    buf: list[str] = []
    i, n = 0, len(sql)
    while i < n:
        c = sql[i]
        if c == "-" and sql.startswith("--", i):
            j = sql.find("\n", i)
            i = n if j < 0 else j
            continue
        if c == "/" and sql.startswith("/*", i):
            j = sql.find("*/", i + 2)
            i = n if j < 0 else j + 2
            buf.append(" ")
            continue
        if c in ("'", '"'):
            j = i + 1
            while j < n:
                if sql[j] == c:
                    if j + 1 < n and sql[j + 1] == c:
                        j += 2
                        continue
                    break
                j += 1
            buf.append(sql[i : j + 1])
            i = j + 1
            continue
        if c == "$":
            m = re.match(r"\$([A-Za-z_][A-Za-z0-9_]*)?\$", sql[i:])
            if m:
                tag = m.group(0)
                end = sql.find(tag, i + len(tag))
                end = n if end < 0 else end
                bodies.append(sql[i + len(tag) : end])
                buf.append(f"$BODY{len(bodies) - 1}$")
                i = end + len(tag)
                continue
        if c == ";":
            statements.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(c)
        i += 1
    if "".join(buf).strip():
        statements.append("".join(buf))
    return [re.sub(r"\s+", " ", s).strip() for s in statements if s.strip()], bodies


IDENT = r'(?:"[^"]+"|[A-Za-z_][\w$]*)'
NAME = rf"({IDENT}(?:\s*\.\s*{IDENT})?)"


def norm_ident(part: str) -> str:
    part = part.strip()
    return part[1:-1] if part.startswith('"') else part.lower()


def qualify(name: str, default_schema: str = "public") -> str:
    parts = [norm_ident(p) for p in re.split(r'\s*\.\s*(?=(?:[^"]*"[^"]*")*[^"]*$)', name)]
    return ".".join(parts) if len(parts) == 2 else f"{default_schema}.{parts[0]}"


def norm_body(body: str) -> str:
    return hashlib.md5(re.sub(r"\s+", " ", body.strip()).encode()).hexdigest()


def split_top_level(text: str, sep: str = ",") -> list[str]:
    parts, depth, cur, quote = [], 0, [], ""
    for ch in text:
        if quote:
            cur.append(ch)
            if ch == quote:
                quote = ""
            continue
        if ch in ("'", '"'):
            quote = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == sep and depth == 0:
            parts.append("".join(cur))
            cur = []
            continue
        cur.append(ch)
    parts.append("".join(cur))
    return [p.strip() for p in parts if p.strip()]


class Ledger:
    """Which migration last created each object that should still exist."""

    def __init__(self) -> None:
        self.owner: dict[tuple[str, str], tuple[str, str | None]] = {}

    def create(self, kind: str, key: str, migration: str, detail: str | None = None) -> None:
        self.owner[(kind, key)] = (migration, detail)

    def drop(self, kind: str, key: str) -> None:
        self.owner.pop((kind, key), None)

    def drop_under_table(self, table: str) -> None:
        for kind, key in list(self.owner):
            if kind in ("col", "pol", "trg") and key.startswith(table + "."):
                del self.owner[(kind, key)]

    def rename_table(self, old: str, new: str) -> None:
        for (kind, key), value in list(self.owner.items()):
            if kind == "rel" and key == old:
                del self.owner[(kind, key)]
                self.owner[("rel", new)] = value
            elif kind in ("col", "pol", "trg") and key.startswith(old + "."):
                del self.owner[(kind, key)]
                self.owner[(kind, new + key[len(old) :])] = value

    def expected(self) -> dict[str, list[tuple[str, str, str | None]]]:
        out: dict[str, list[tuple[str, str, str | None]]] = {}
        for (kind, key), (mig, detail) in self.owner.items():
            out.setdefault(mig, []).append((kind, key, detail))
        return out


F = re.IGNORECASE


def scan_statements(sql: str, mig: str, ledger: Ledger) -> None:
    statements, bodies = split_sql(sql)

    def body_of(stmt: str) -> str | None:
        m = re.search(r"\$BODY(\d+)\$", stmt)
        return bodies[int(m.group(1))] if m else None

    for stmt in statements:
        if re.match(r"DO\b", stmt, F):
            body = body_of(stmt)
            if body is not None:
                scan_statements(body, mig, ledger)
            continue
        handle_statement(stmt, mig, ledger, body_of)


def handle_statement(stmt: str, mig: str, ledger: Ledger, body_of) -> None:
    for m in re.finditer(rf"CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+{NAME}\s*\(", stmt, F):
        body = body_of(stmt[m.end() :])
        ledger.create("fn", qualify(m.group(1)), mig, norm_body(body) if body is not None else None)
    for m in re.finditer(rf"DROP\s+(?:FUNCTION|PROCEDURE)\s+(?:IF\s+EXISTS\s+)?{NAME}", stmt, F):
        ledger.drop("fn", qualify(m.group(1)))
    for m in re.finditer(rf"ALTER\s+FUNCTION\s+{NAME}\s*\([^)]*\)\s+RENAME\s+TO\s+({IDENT})", stmt, F):
        old = qualify(m.group(1))
        ledger.drop("fn", old)

    for m in re.finditer(rf"CREATE\s+(?:(?:GLOBAL\s+|LOCAL\s+)?(?:TEMP|TEMPORARY|UNLOGGED)\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?{NAME}", stmt, F):
        ledger.create("rel", qualify(m.group(1)), mig)
    for m in re.finditer(rf"CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?{NAME}", stmt, F):
        ledger.create("rel", qualify(m.group(1)), mig)
    for m in re.finditer(rf"CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?({IDENT})\s+ON\s+(?:ONLY\s+)?{NAME}", stmt, F):
        schema = qualify(m.group(2)).split(".")[0]
        ledger.create("rel", f"{schema}.{norm_ident(m.group(1))}", mig)
    for m in re.finditer(rf"CREATE\s+TYPE\s+{NAME}", stmt, F):
        ledger.create("typ", qualify(m.group(1)), mig)
    for m in re.finditer(rf"CREATE\s+POLICY\s+({IDENT})\s+ON\s+{NAME}", stmt, F):
        ledger.create("pol", f"{qualify(m.group(2))}.{norm_ident(m.group(1))}", mig)
    for m in re.finditer(rf"DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?({IDENT})\s+ON\s+{NAME}", stmt, F):
        ledger.drop("pol", f"{qualify(m.group(2))}.{norm_ident(m.group(1))}")
    for m in re.finditer(rf"ALTER\s+POLICY\s+({IDENT})\s+ON\s+{NAME}\s+RENAME\s+TO\s+({IDENT})", stmt, F):
        table = qualify(m.group(2))
        ledger.drop("pol", f"{table}.{norm_ident(m.group(1))}")
        ledger.create("pol", f"{table}.{norm_ident(m.group(3))}", mig)
    for m in re.finditer(
        rf"CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+({IDENT})\s+(?:BEFORE|AFTER|INSTEAD\s+OF)\s+[\w\s,\"]+?\s+ON\s+{NAME}",
        stmt,
        F,
    ):
        ledger.create("trg", f"{qualify(m.group(2))}.{norm_ident(m.group(1))}", mig)
    for m in re.finditer(rf"DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?({IDENT})\s+ON\s+{NAME}", stmt, F):
        ledger.drop("trg", f"{qualify(m.group(2))}.{norm_ident(m.group(1))}")

    # search, not match: inside a DO block a statement often starts with IF … THEN.
    m = re.search(r"\bDROP\s+(TABLE|VIEW|MATERIALIZED\s+VIEW|INDEX|TYPE)\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?(.*)$", stmt, F)
    if m:
        kind = "typ" if m.group(1).upper() == "TYPE" else "rel"
        names = re.sub(r"\s+(CASCADE|RESTRICT)\s*$", "", m.group(2), flags=F)
        for name in split_top_level(names):
            key = qualify(name)
            ledger.drop(kind, key)
            if m.group(1).upper() == "TABLE":
                ledger.drop_under_table(key)

    m = re.search(rf"\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?{NAME}\s+(.*)$", stmt, F)
    if m:
        table = qualify(m.group(1))
        for action in split_top_level(m.group(2)):
            a = re.match(rf"ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?({IDENT})", action, F)
            if a and a.group(1).upper() not in ("CONSTRAINT", "PRIMARY", "FOREIGN", "UNIQUE", "CHECK", "EXCLUDE"):
                ledger.create("col", f"{table}.{norm_ident(a.group(1))}", mig)
                continue
            d = re.match(rf"DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?({IDENT})", action, F)
            if d and d.group(1).upper() != "CONSTRAINT":
                ledger.drop("col", f"{table}.{norm_ident(d.group(1))}")
                continue
            r = re.match(rf"RENAME\s+(?:COLUMN\s+)?({IDENT})\s+TO\s+({IDENT})", action, F)
            if r and r.group(1).upper() != "CONSTRAINT":
                ledger.drop("col", f"{table}.{norm_ident(r.group(1))}")
                ledger.create("col", f"{table}.{norm_ident(r.group(2))}", mig)
                continue
            t = re.match(rf"RENAME\s+TO\s+({IDENT})", action, F)
            if t:
                ledger.rename_table(table, f"{table.split('.')[0]}.{norm_ident(t.group(1))}")

    # Columns declared inside CREATE TABLE ( … ) — so a later DROP COLUMN or a missing table is visible.
    m = re.search(rf"\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?{NAME}\s*\((.*)\)", stmt, F)
    if m:
        table = qualify(m.group(1))
        for col in split_top_level(m.group(2)):
            c = re.match(rf"({IDENT})\s+\S", col)
            if c and c.group(1).upper() not in ("CONSTRAINT", "PRIMARY", "FOREIGN", "UNIQUE", "CHECK", "EXCLUDE", "LIKE"):
                ledger.create("col", f"{table}.{norm_ident(c.group(1))}", mig)

    for m in re.finditer(r"cron\.schedule\s*\(\s*'([^']+)'\s*,\s*'", stmt, F):
        ledger.create("cron", m.group(1), mig)
    for m in re.finditer(r"cron\.unschedule\s*\(\s*'([^']+)'", stmt, F):
        ledger.drop("cron", m.group(1))

    m = re.search(r"INSERT\s+INTO\s+storage\.buckets\b[^)]*\)\s*VALUES\s*(.*)$", stmt, F)
    if m:
        for b in re.finditer(r"\(\s*'([^']+)'", m.group(1)):
            ledger.create("bucket", b.group(1), mig)


def migration_files(repo: Path) -> list[Path]:
    return sorted((repo / "supabase" / "migrations").glob("*.sql"), key=lambda p: p.name.encode())


def build_ledger(files: list[Path]) -> Ledger:
    ledger = Ledger()
    for f in files:
        scan_statements(f.read_text(encoding="utf-8"), f.name, ledger)
    return ledger


# ── Database access ─────────────────────────────────────────────────────────────────────────────


def env_value(env_file: Path, key: str) -> str:
    try:
        lines = env_file.read_text(encoding="utf-8").splitlines()
    except OSError:
        return ""
    value = ""
    for line in lines:
        m = re.match(rf"\s*{re.escape(key)}=(.*)$", line)
        if m:
            value = m.group(1).strip().strip("'\"")
    return value


class Db:
    def __init__(self, env_file: Path | None) -> None:
        self.user = "supabase_admin"
        self.password = ""
        if self._ok():
            return
        self.password = env_value(env_file, "POSTGRES_PASSWORD") if env_file else ""
        for user in ("supabase_admin", "postgres"):
            self.user = user
            if self.password and self._ok():
                return
        raise RuntimeError(f"cannot query Postgres in {DB_CONTAINER} (tried supabase_admin and postgres)")

    def _cmd(self, interactive: bool) -> list[str]:
        cmd = ["docker", "exec"] + (["-i"] if interactive else []) + ["-e", "PGHOST=127.0.0.1"]
        if self.password:
            cmd += ["-e", "PGPASSWORD"]
        return cmd + [DB_CONTAINER, "psql", "-w", "-U", self.user, "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1"]

    def _env(self) -> dict[str, str]:
        env = dict(os.environ)
        if self.password:
            env["PGPASSWORD"] = self.password
        return env

    def _ok(self) -> bool:
        try:
            return self.rows("SELECT 1") == [["1"]]
        except (RuntimeError, subprocess.TimeoutExpired, OSError):
            return False

    def rows(self, sql: str) -> list[list[str]]:
        # A password, when needed, travels through the environment, never on the command line; -w makes
        # psql fail instead of waiting on a prompt.
        res = subprocess.run(
            self._cmd(False) + ["-Atq", "-F", "\t", "-c", sql],
            env=self._env(),
            capture_output=True,
            text=True,
            timeout=120,
        )
        if res.returncode != 0:
            raise RuntimeError(res.stderr.strip() or f"psql exited {res.returncode}")
        return [line.split("\t") for line in res.stdout.splitlines() if line]

    def run_script(self, sql: str, single_transaction: bool) -> int:
        cmd = self._cmd(True) + (["--single-transaction"] if single_transaction else []) + ["-q", "-f", "-"]
        return subprocess.run(cmd, input=sql, env=self._env(), text=True, timeout=1800).returncode

    def scalar_exists(self, sql: str) -> bool:
        return self.rows(sql)[0][0] == "t"


CATALOG_SQL = f"""
SELECT 'rel', n.nspname || '.' || c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN {SYSTEM_SCHEMAS}
UNION ALL SELECT 'col', table_schema || '.' || table_name || '.' || column_name FROM information_schema.columns
  WHERE table_schema NOT IN {SYSTEM_SCHEMAS}
UNION ALL SELECT 'fn', n.nspname || '.' || p.proname || E'\\t' || md5(btrim(regexp_replace(p.prosrc, '\\s+', ' ', 'g')))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname NOT IN {SYSTEM_SCHEMAS}
UNION ALL SELECT 'pol', schemaname || '.' || tablename || '.' || policyname FROM pg_policies
UNION ALL SELECT 'trg', n.nspname || '.' || c.relname || '.' || t.tgname FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE NOT t.tgisinternal
UNION ALL SELECT 'typ', n.nspname || '.' || t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname NOT IN {SYSTEM_SCHEMAS}
UNION ALL SELECT 'bucket', id FROM storage.buckets
"""


def load_catalog(db: Db) -> tuple[dict[str, set[str]], dict[str, set[str]], bool]:
    catalog: dict[str, set[str]] = {}
    fn_hashes: dict[str, set[str]] = {}
    for row in db.rows(CATALOG_SQL):
        if row[0] == "fn" and len(row) >= 3:
            catalog.setdefault("fn", set()).add(row[1])
            fn_hashes.setdefault(row[1], set()).add(row[2])
        elif len(row) >= 2:
            catalog.setdefault(row[0], set()).add(row[1])
    has_cron = db.scalar_exists("SELECT to_regclass('cron.job') IS NOT NULL")
    if has_cron:
        catalog["cron"] = {r[0] for r in db.rows("SELECT jobname FROM cron.job WHERE jobname IS NOT NULL")}
    return catalog, fn_hashes, has_cron


def recorded_migrations(db: Db) -> set[str] | None:
    if not db.scalar_exists("SELECT to_regclass('public._migrations') IS NOT NULL"):
        return None
    return {r[0] for r in db.rows("SELECT name FROM public._migrations")}


# ── Status ──────────────────────────────────────────────────────────────────────────────────────

LABEL = {"rel": "relation", "col": "column", "fn": "function", "pol": "policy", "trg": "trigger", "typ": "type", "cron": "cron job", "bucket": "bucket"}


def migration_status(files, ledger, catalog, fn_hashes, has_cron, recorded):
    expected = ledger.expected()
    result = OrderedDict()
    for f in files:
        objs = [o for o in expected.get(f.name, []) if o[0] != "cron" or has_cron]
        missing = []
        for kind, key, detail in objs:
            if kind == "fn":
                present = key in catalog.get("fn", set()) and (detail is None or detail in fn_hashes.get(key, set()))
                if not present and key in catalog.get("fn", set()):
                    missing.append(f"function {key} (exists, but with a different body)")
                    continue
            else:
                present = key in catalog.get(kind, set())
            if not present:
                missing.append(f"{LABEL[kind]} {key}")
        if recorded is not None and f.name in recorded:
            status = "recorded"
        elif not objs:
            status = "unknown"
        elif not missing:
            status = "applied"
        elif len(missing) == len(objs):
            status = "missing"
        else:
            status = "partial"
        result[f.name] = (status, len(objs), missing)
    return result


def colour(enabled: bool):
    codes = {"ok": "32", "warn": "33", "bad": "31", "dim": "2", "b": "1"}
    return lambda kind, text: f"\033[{codes[kind]}m{text}\033[0m" if enabled else text


def print_migrations(status, recorded, verbose, c) -> int:
    print(c("b", "== Migrations =="))
    if recorded is None:
        print("No public._migrations table: status is inferred from the objects each migration leaves behind.")
    else:
        print(f"public._migrations records {len(recorded)} migrations.")
    counts: dict[str, int] = {}
    for name, (st, n_objs, missing) in status.items():
        counts[st] = counts.get(st, 0) + 1
        if st in ("applied", "recorded") and not (st == "recorded" and missing):
            if verbose:
                print(f"  {c('ok', st.ljust(8))} {name}")
            continue
        if st == "unknown":
            if verbose:
                print(f"  {c('dim', 'unknown ')} {name} (creates nothing checkable: grants, data or settings only)")
            continue
        tag = {"missing": c("bad", "missing "), "partial": c("warn", "partial "), "recorded": c("warn", "recorded")}[st]
        extra = f"{len(missing)} of {n_objs} objects absent" if st != "recorded" else "recorded, but objects are absent"
        print(f"  {tag} {name} ({extra})")
        for item in missing[:8]:
            print(f"             - {item}")
        if len(missing) > 8:
            print(f"             … {len(missing) - 8} more")
    summary = ", ".join(f"{v} {k}" for k, v in sorted(counts.items()))
    print(f"Summary: {summary}")
    pending = [n for n, (st, _, _) in status.items() if st in ("missing", "partial")]
    return 1 if pending else 0


# ── Edge functions ──────────────────────────────────────────────────────────────────────────────


def tree(path: Path) -> dict[str, str]:
    out = {}
    for p in sorted(path.rglob("*")):
        if p.is_file() and not p.name.endswith(".test.ts") and "__tests__" not in p.parts:
            out[str(p.relative_to(path))] = hashlib.sha256(p.read_bytes()).hexdigest()
    return out


def print_functions(repo: Path, supabase_dir: Path | None, c) -> int:
    print(c("b", "\n== Edge functions =="))
    src = repo / "supabase" / "functions"
    dst = supabase_dir / "volumes" / "functions" if supabase_dir else None
    if not dst or not dst.is_dir():
        print(c("warn", f"No deployed functions directory found ({dst}); pass --supabase-dir."))
        return 1
    drift = 0
    repo_fns = sorted(p.name for p in src.iterdir() if p.is_dir())
    for name in repo_fns:
        a, b = tree(src / name), tree(dst / name) if (dst / name).is_dir() else None
        if b is None:
            print(f"  {c('bad', 'missing ')} {name}")
            drift = 1
            continue
        changed = sorted(k for k in a if k in b and a[k] != b[k])
        only_repo = sorted(k for k in a if k not in b)
        only_live = sorted(k for k in b if k not in a)
        if changed or only_repo or only_live:
            drift = 1
            parts = [f"{len(changed)} changed"] + ([f"{len(only_repo)} new"] if only_repo else []) + ([f"{len(only_live)} only deployed"] if only_live else [])
            print(f"  {c('warn', 'differs ')} {name} ({', '.join(parts)}: {', '.join((changed + only_repo + only_live)[:5])})")
        else:
            print(f"  {c('ok', 'same    ')} {name}")
    extra = sorted(p.name for p in dst.iterdir() if p.is_dir() and p.name not in repo_fns)
    if extra:
        print(f"  Deployed but not in the repository (left alone by deploys): {', '.join(extra)}")

    used = set()
    for p in src.rglob("*.ts"):
        used |= set(re.findall(r"Deno\.env\.get\(\s*['\"]([A-Z0-9_]+)['\"]", p.read_text(encoding="utf-8")))
    res = subprocess.run(
        ["docker", "inspect", "-f", "{{range .Config.Env}}{{println .}}{{end}}", FUNCTIONS_CONTAINER],
        capture_output=True,
        text=True,
    )
    if res.returncode == 0:
        have = {line.split("=", 1)[0] for line in res.stdout.splitlines() if "=" in line}
        lacking = sorted(used - have)
        if lacking:
            drift = 1
            print(c("bad", f"  {FUNCTIONS_CONTAINER} lacks environment variables the functions read: {', '.join(lacking)}"))
        else:
            print(f"  {FUNCTIONS_CONTAINER} has every environment variable the functions read ({', '.join(sorted(used))})")
    return drift


# ── Commands ────────────────────────────────────────────────────────────────────────────────────


def confirm(question: str, assume_yes: bool) -> bool:
    if assume_yes:
        return True
    try:
        return input(f"{question} [y/N] ").strip().lower() in ("y", "yes")
    except EOFError:
        return False


def detect_supabase_dir() -> Path | None:
    res = subprocess.run(
        ["docker", "inspect", "-f", '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}', DB_CONTAINER],
        capture_output=True,
        text=True,
    )
    path = res.stdout.strip()
    return Path(path) if res.returncode == 0 and path else None


def sql_literal(text: str) -> str:
    return "'" + text.replace("'", "''") + "'"


BOOKKEEPING_DDL = """
CREATE TABLE IF NOT EXISTS public._migrations (
    name        TEXT        PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public._migrations ENABLE ROW LEVEL SECURITY;
"""


def cmd_baseline(files, status, db, args, c) -> int:
    names = [f.name for f in files]
    accepted = set(args.accept or [])
    unknown_accept = accepted - set(names)
    if unknown_accept:
        print(c("bad", f"--accept names no migration file: {', '.join(sorted(unknown_accept))}"))
        return 2
    last_applied = max((i for i, n in enumerate(names) if status[n][0] in ("applied", "recorded") or n in accepted), default=-1)
    if last_applied < 0:
        print("Nothing looks applied; there is nothing to baseline.")
        return 0
    span = names[: last_applied + 1]
    blocking = [n for n in span if status[n][0] in ("missing", "partial") and n not in accepted]
    if blocking:
        print(c("bad", "These migrations come before the newest applied one but look missing or partial:"))
        for n in blocking:
            print(f"  {n}")
        print("Check each one by hand. If it is applied (objects renamed or removed later, for instance),")
        print("re-run with --accept <name> for it. If it is not, apply it first, then baseline.")
        return 1
    to_record = [n for n in span if status[n][0] != "recorded"]
    if not to_record:
        print("Every applied migration is already recorded.")
        return 0
    print(f"Will record {len(to_record)} migrations as applied in public._migrations, {to_record[0]} … {to_record[-1]}.")
    pending = names[last_applied + 1 :]
    if pending:
        print(f"Left pending (not recorded): {', '.join(pending)}")
    if not confirm("Record them?", args.yes):
        print("Nothing changed.")
        return 1
    values = ",\n".join(f"({sql_literal(n)})" for n in to_record)
    sql = BOOKKEEPING_DDL + f"INSERT INTO public._migrations (name) VALUES\n{values}\nON CONFLICT (name) DO NOTHING;\n"
    rc = db.run_script(sql, single_transaction=True)
    print(c("ok", "Recorded.") if rc == 0 else c("bad", "Failed; nothing was recorded."))
    return 0 if rc == 0 else 2


def cmd_apply(files, recorded, db, args, c) -> int:
    if recorded is None:
        print(c("bad", "public._migrations does not exist yet. Run `baseline` first, so applied migrations are not re-run."))
        return 2
    pending = [f for f in files if f.name not in recorded]
    if not pending:
        print("No pending migrations.")
        return 0
    print("Pending migrations, in order:")
    for f in pending:
        print(f"  {f.name}")
    print("Take a backup first. Each file runs in one transaction with its record row; the run stops at the first failure.")
    if not confirm(f"Apply {len(pending)} migrations now?", args.yes):
        print("Nothing changed.")
        return 1
    for f in pending:
        body = f.read_text(encoding="utf-8")
        record = f"INSERT INTO public._migrations (name) VALUES ({sql_literal(f.name)});\n"
        no_tx = "-- migrate:no-transaction" in "\n".join(body.splitlines()[:20])
        print(f"▶ {f.name}")
        if no_tx:
            rc = db.run_script(body, single_transaction=False)
            rc = rc or db.run_script(record, single_transaction=True)
        else:
            rc = db.run_script(body + "\n;\n" + record, single_transaction=True)
        if rc != 0:
            print(c("bad", f"✗ {f.name} failed{'' if no_tx else ' and was rolled back'}. Fix it and re-run apply."))
            return 2
    print(c("ok", "✓ All pending migrations applied."))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", nargs="?", default="check", choices=["check", "baseline", "apply"])
    ap.add_argument("--supabase-dir", type=Path, help="the official stack's compose directory (auto-detected)")
    ap.add_argument("--repo-dir", type=Path, default=REPO_ROOT, help="repository checkout (default: this script's)")
    ap.add_argument("--only", choices=["migrations", "functions"], help="check only one part")
    ap.add_argument("--verbose", action="store_true", help="list applied and unknown migrations too")
    ap.add_argument("--yes", action="store_true", help="don't ask before writing (baseline/apply)")
    ap.add_argument("--accept", action="append", metavar="NAME", help="treat this migration as applied (baseline)")
    args = ap.parse_args()
    c = colour(sys.stdout.isatty())

    supabase_dir = args.supabase_dir or detect_supabase_dir()
    files = migration_files(args.repo_dir)
    if not files:
        print(f"error: no migrations under {args.repo_dir}/supabase/migrations", file=sys.stderr)
        return 2

    rc = 0
    if args.command in ("baseline", "apply") or args.only != "functions":
        db = Db(supabase_dir / ".env" if supabase_dir else None)
        recorded = recorded_migrations(db)
        if args.command == "apply":
            return cmd_apply(files, recorded, db, args, c)
        catalog, fn_hashes, has_cron = load_catalog(db)
        status = migration_status(files, build_ledger(files), catalog, fn_hashes, has_cron, recorded)
        if args.command == "baseline":
            return cmd_baseline(files, status, db, args, c)
        rc |= print_migrations(status, recorded, args.verbose, c)
    if args.only != "migrations":
        rc |= print_functions(args.repo_dir, supabase_dir, c)
    return rc


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, subprocess.TimeoutExpired) as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(2)
