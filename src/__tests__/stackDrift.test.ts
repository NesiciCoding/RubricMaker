import { createHash } from 'node:crypto';
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const drift = resolve(root, 'scripts/stack-drift.py');
const deploy = resolve(root, 'scripts/deploy-edge-functions.sh');

const work = mkdtempSync(join(tmpdir(), 'stack-drift-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const md5 = (s: string) => createHash('md5').update(s.replace(/\s+/g, ' ').trim()).digest('hex');

function write(path: string, text: string, mode?: number) {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, text);
    if (mode) chmodSync(path, mode);
}

// A repository with six migrations covering the cases the checker must tell apart.
const repo = join(work, 'repo');
const MIGRATIONS: Record<string, string> = {
    '001_init.sql': `
        -- a comment with CREATE TABLE ghost (x int);
        create table public.a (id uuid primary key, name text);
        create policy "read a" on public.a for select using (true);
        create or replace function public.f() returns int language sql as $$ select 1 $$;`,
    '002_add.sql': `alter table public.a add column note text;
        create index a_note_idx on public.a (note);`,
    '003_replace_fn.sql': `create or replace function public.f() returns int language sql as $$
        select 2
    $$;`,
    '004_cron.sql': `select cron.schedule('nightly', '0 3 * * *', $$select 1$$);`,
    '005_policy_v2.sql': `drop policy if exists "read a" on public.a;
        DO $do$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'read a v2') THEN
            CREATE POLICY "read a v2" ON public.a FOR SELECT USING (true);
          END IF;
        END $do$;`,
    '006_grants.sql': `grant select on public.a to anon;`,
};
for (const [name, sql] of Object.entries(MIGRATIONS)) write(join(repo, 'supabase/migrations', name), sql);
write(join(repo, 'supabase/functions/_shared/util.ts'), 'export const x = 2;\n');
write(join(repo, 'supabase/functions/alpha/index.ts'), "Deno.env.get('SUPABASE_URL');\n// v2\n");
write(join(repo, 'supabase/functions/beta/index.ts'), "Deno.env.get('MAIL_TOKEN');\n");
write(join(repo, 'supabase/functions/beta/index.test.ts'), 'test file, never deployed\n');

// Production: 001, 002 and 004 applied; 003's new body and 005's policy never reached it.
const CATALOG = [
    'rel\tpublic.a',
    'rel\tpublic.a_note_idx',
    'col\tpublic.a.id',
    'col\tpublic.a.name',
    'col\tpublic.a.note',
    `fn\tpublic.f\t${md5('select 1')}`,
    'pol\tpublic.a.read a',
].join('\\n');

function stack(name: string) {
    const dir = join(work, name);
    rmSync(dir, { recursive: true, force: true });
    write(join(dir, '.env'), 'POSTGRES_PASSWORD=pw-not-printed\nANON_KEY=anon-key\n');
    write(join(dir, 'volumes/functions/_shared/util.ts'), 'export const x = 1;\n');
    write(join(dir, 'volumes/functions/alpha/index.ts'), "Deno.env.get('SUPABASE_URL');\n// v1\n");
    write(join(dir, 'volumes/functions/main/index.ts'), 'router\n');
    return dir;
}

function stubs(binDir: string, opts: { migrationsTable?: boolean; failProbe?: string; driftExit?: number } = {}) {
    rmSync(binDir, { recursive: true, force: true });
    mkdirSync(binDir, { recursive: true });
    const log = join(binDir, 'calls.log');
    write(
        join(binDir, 'docker'),
        `#!/bin/bash
echo "docker $*" >> "${log}"
case "$1" in
  inspect)
    case "$*" in
      *Config.Env*) printf 'SUPABASE_URL=http://kong:8000\\nSUPABASE_SERVICE_ROLE_KEY=x\\n' ;;
      *State.Running*) echo true ;;
      *) exit 1 ;;
    esac ;;
  restart) echo "$2" ;;
  exec)
    if [[ "$*" == *" -f -"* ]]; then cat >> "${join(binDir, 'scripts.sql')}"; exit 0; fi
    sql="\${@: -1}"
    case "$sql" in
      'SELECT 1') echo 1 ;;
      *"to_regclass('cron.job')"*) echo t ;;
      *"to_regclass('public._migrations')"*) ${opts.migrationsTable ? 'echo t' : 'echo f'} ;;
      *"FROM public._migrations"*) printf '001_init.sql\\n002_add.sql\\n' ;;
      *"FROM cron.job"*) echo nightly ;;
      *information_schema.columns*) printf '${CATALOG}\\n' ;;
      *) echo "unexpected sql: $sql" >&2; exit 3 ;;
    esac ;;
esac`,
        0o755
    );
    write(
        join(binDir, 'curl'),
        `#!/bin/bash
echo "curl $*" >> "${log}"
case "$*" in *${opts.failProbe ?? '__none__'}*) echo 503 ;; *) echo 204 ;; esac`,
        0o755
    );
    if (opts.driftExit !== undefined) {
        write(join(binDir, 'python3'), `#!/bin/bash\nexit ${opts.driftExit}\n`, 0o755);
    }
    return { log, scripts: join(binDir, 'scripts.sql') };
}

function run(cmd: string, args: string[], binDir: string, input = '') {
    return spawnSync(cmd, args, {
        encoding: 'utf8',
        input,
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}`, PROBE_DELAY_SECONDS: '0' },
        timeout: 60_000,
    });
}

describe('scripts/stack-drift.py check', () => {
    const dir = stack('check');
    const bin = join(work, 'bin-check');
    stubs(bin);
    const result = run('python3', [drift, 'check', '--supabase-dir', dir, '--repo-dir', repo, '--verbose'], bin);
    const out = result.stdout;

    it('infers each migration from the objects it leaves behind', () => {
        expect(result.stderr).toBe('');
        expect(out).toMatch(/applied\s+001_init\.sql/);
        expect(out).toMatch(/applied\s+002_add\.sql/);
        expect(out).toMatch(/missing\s+003_replace_fn\.sql/);
        expect(out).toMatch(/function public\.f \(exists, but with a different body\)/);
        expect(out).toMatch(/applied\s+004_cron\.sql/);
        expect(out).toMatch(/missing\s+005_policy_v2\.sql[\s\S]*policy public\.a\.read a v2/);
        expect(out).toMatch(/unknown\s+006_grants\.sql/);
        expect(out).not.toMatch(/ghost/);
    });

    it('reports edge-function drift, new functions and missing environment variables', () => {
        expect(out).toMatch(/differs\s+_shared/);
        expect(out).toMatch(/differs\s+alpha/);
        expect(out).toMatch(/missing\s+beta/);
        expect(out).toMatch(/left alone by deploys\): main/);
        expect(out).toMatch(/lacks environment variables the functions read: MAIL_TOKEN/);
    });

    it('exits 1 on drift and never prints the database password', () => {
        expect(result.status).toBe(1);
        expect(out + result.stderr).not.toContain('pw-not-printed');
    });
});

describe('scripts/stack-drift.py baseline', () => {
    const dir = stack('baseline');
    const bin = join(work, 'bin-baseline');

    it('refuses while an earlier migration looks missing', () => {
        const { scripts } = stubs(bin);
        const r = run('python3', [drift, 'baseline', '--supabase-dir', dir, '--repo-dir', repo, '--yes'], bin);
        expect(r.status).toBe(1);
        expect(r.stdout).toMatch(/look missing or partial:\s+003_replace_fn\.sql/);
        expect(existsSync(scripts)).toBe(false);
    });

    it('records everything up to the newest applied migration once the gap is accepted', () => {
        const { scripts } = stubs(bin);
        const r = run(
            'python3',
            [drift, 'baseline', '--supabase-dir', dir, '--repo-dir', repo, '--yes', '--accept', '003_replace_fn.sql'],
            bin
        );
        expect(r.status).toBe(0);
        const sql = readFileSync(scripts, 'utf8');
        expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\._migrations/);
        expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
        for (const name of ['001_init.sql', '002_add.sql', '003_replace_fn.sql', '004_cron.sql']) {
            expect(sql).toContain(`('${name}')`);
        }
        expect(sql).not.toContain('005_policy_v2.sql');
        expect(r.stdout).toMatch(/Left pending \(not recorded\): 005_policy_v2\.sql, 006_grants\.sql/);
    });
});

describe('scripts/stack-drift.py apply', () => {
    const dir = stack('apply');
    const bin = join(work, 'bin-apply');

    it('refuses without a bookkeeping table', () => {
        const { scripts } = stubs(bin);
        const r = run('python3', [drift, 'apply', '--supabase-dir', dir, '--repo-dir', repo, '--yes'], bin);
        expect(r.status).toBe(2);
        expect(r.stdout).toMatch(/Run `baseline` first/);
        expect(existsSync(scripts)).toBe(false);
    });

    it('runs each pending migration with its record row, in order', () => {
        const { scripts } = stubs(bin, { migrationsTable: true });
        const r = run('python3', [drift, 'apply', '--supabase-dir', dir, '--repo-dir', repo, '--yes'], bin);
        expect(r.status).toBe(0);
        const sql = readFileSync(scripts, 'utf8');
        const order = ['003_replace_fn.sql', '004_cron.sql', '005_policy_v2.sql', '006_grants.sql'].map((n) =>
            sql.indexOf(`INSERT INTO public._migrations (name) VALUES ('${n}')`)
        );
        expect(order.every((i) => i >= 0)).toBe(true);
        expect([...order].sort((x, y) => x - y)).toEqual(order);
        expect(sql).not.toContain("VALUES ('001_init.sql')");
        expect(sql).toContain('select 2');
    });

    it('asks before writing and changes nothing on no', () => {
        const { scripts } = stubs(bin, { migrationsTable: true });
        const r = run('python3', [drift, 'apply', '--supabase-dir', dir, '--repo-dir', repo], bin, 'n\n');
        expect(r.status).toBe(1);
        expect(existsSync(scripts)).toBe(false);
    });
});

describe('scripts/deploy-edge-functions.sh', () => {
    it('updates repository functions, keeps server-only ones, backs up, restarts and probes', () => {
        const dir = stack('deploy');
        const bin = join(work, 'bin-deploy');
        const { log } = stubs(bin);
        const r = run('bash', [deploy, '--supabase-dir', dir, '--repo-dir', repo, '--yes', '--force'], bin);
        expect(r.stderr).toBe('');
        expect(r.status).toBe(0);
        const fns = join(dir, 'volumes/functions');
        expect(readFileSync(join(fns, 'alpha/index.ts'), 'utf8')).toContain('v2');
        expect(readFileSync(join(fns, '_shared/util.ts'), 'utf8')).toContain('x = 2');
        expect(existsSync(join(fns, 'beta/index.ts'))).toBe(true);
        expect(existsSync(join(fns, 'beta/index.test.ts'))).toBe(false);
        expect(readFileSync(join(fns, 'main/index.ts'), 'utf8')).toBe('router\n');
        const backups = readdirSync(join(dir, 'volumes')).filter((n) => n.startsWith('functions.bak-'));
        expect(backups).toHaveLength(1);
        expect(readFileSync(join(dir, 'volumes', backups[0], 'alpha/index.ts'), 'utf8')).toContain('v1');
        const calls = readFileSync(log, 'utf8');
        expect(calls).toMatch(/docker restart supabase-edge-functions/);
        expect(calls).toMatch(/curl .*-X OPTIONS .*\/functions\/v1\/alpha/);
        expect(calls).toMatch(/\/functions\/v1\/beta/);
        expect(calls).not.toMatch(/\/functions\/v1\/_shared/);
        expect(r.stdout).toMatch(/Left alone \(not in the repository\): main/);
    });

    it('reports a function that does not boot and how to restore', () => {
        const dir = stack('deploy-fail');
        const bin = join(work, 'bin-deploy-fail');
        stubs(bin, { failProbe: '/functions/v1/beta' });
        const r = run('bash', [deploy, '--supabase-dir', dir, '--repo-dir', repo, '--yes', '--force'], bin);
        expect(r.status).toBe(2);
        expect(r.stdout).toMatch(/✗ beta: HTTP 503/);
        expect(r.stderr).toMatch(/To restore the previous functions:[\s\S]*functions\.bak-/);
    });

    it('refuses while migrations are pending, without touching anything', () => {
        const dir = stack('deploy-refuse');
        const bin = join(work, 'bin-deploy-refuse');
        const { log } = stubs(bin, { driftExit: 1 });
        const r = run('bash', [deploy, '--supabase-dir', dir, '--repo-dir', repo, '--yes'], bin);
        expect(r.status).toBe(1);
        expect(r.stdout).toMatch(/Refusing: the database is missing migrations/);
        expect(readFileSync(join(dir, 'volumes/functions/alpha/index.ts'), 'utf8')).toContain('v1');
        expect(existsSync(log) ? readFileSync(log, 'utf8') : '').not.toMatch(/docker restart/);
    });

    it('does nothing when every function already matches', () => {
        const dir = stack('deploy-noop');
        const bin = join(work, 'bin-deploy-noop');
        stubs(bin);
        run('bash', [deploy, '--supabase-dir', dir, '--repo-dir', repo, '--yes', '--force'], bin);
        const { log } = stubs(bin);
        const r = run('bash', [deploy, '--supabase-dir', dir, '--repo-dir', repo, '--yes', '--force'], bin);
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/Nothing to do/);
        expect(existsSync(log) ? readFileSync(log, 'utf8') : '').not.toMatch(/docker restart/);
    });
});
