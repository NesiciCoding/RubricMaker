import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const script = resolve(root, 'scripts/audit-live-stack.sh');
const body = readFileSync(script, 'utf8');

const POSTGRES_PASSWORD = 'your-super-secret-and-long-postgres-password';
const JWT_SECRET = 'x9Qm2vLr7TfPz3NcW8kHs5JdYb6GaE4u';
// {"role":"anon","iss":"supabase-demo"} — the upstream example key.
const DEMO_ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8ifQ.sig';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UifQ.sig';

const work = mkdtempSync(join(tmpdir(), 'audit-live-stack-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function stub(name: string, text: string) {
    const path = join(work, 'bin', name);
    writeFileSync(path, `#!/bin/bash\n${text}\n`);
    chmodSync(path, 0o755);
}

function setup() {
    const stack = join(work, 'supabase');
    mkdirSync(join(work, 'bin'), { recursive: true });
    mkdirSync(join(stack, 'volumes/functions'), { recursive: true });
    mkdirSync(join(stack, 'volumes/storage'), { recursive: true });
    writeFileSync(
        join(stack, '.env'),
        [
            `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
            `JWT_SECRET=${JWT_SECRET}`,
            `ANON_KEY=${DEMO_ANON_KEY}`,
            `SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}`,
            'SMTP_HOST=smtp-relay.brevo.com',
            'SITE_URL=https://app.example.test',
            'SUPABASE_PUBLIC_URL=https://api.example.test',
        ].join('\n')
    );
    chmodSync(join(stack, '.env'), 0o644);

    stub(
        'docker',
        `case "$1" in
  info) exit 0 ;;
  inspect)
    if [[ "$2" == "-f" ]]; then
      [[ "$3" == *working_dir* ]] && { echo "${stack}"; exit 0; }
      shift 3
      for c in "$@"; do case $c in id1) echo "/supabase-db|0|-800";; id2) echo "/supabase-studio|268435456|0";; esac; done
      exit 0
    fi
    [[ "$2" == supabase-db ]] ;;
  ps)
    case "$*" in
      *-q*) printf 'id1\\nid2\\n' ;;
      *'{{.Ports}}'*) printf 'supabase-db\\t5432/tcp\\nsupabase-pooler\\t0.0.0.0:6543->6543/tcp, [::]:6543->6543/tcp\\nsupabase-kong\\t127.0.0.1:8000->8000/tcp\\n' ;;
      *'{{.Image}}'*) echo 'supabase/postgres:15.8.1.060' ;;
      *) printf 'supabase-db\\nsupabase-pooler\\nsupabase-kong\\n' ;;
    esac ;;
  stats) printf '1.2GiB / 11.7GiB\\tsupabase-db\\n' ;;
  exec)
    echo "$*" >> "${join(work, 'exec.log')}"
    [[ -n "\${REQUIRE_PW:-}" && -z "\${PGPASSWORD:-}" ]] && exit 2
    sql="\${@: -1}"
    case "$sql" in
      'SELECT 1') echo 1 ;;
      *relrowsecurity*) echo 'leaky_table' ;;
      *"* 8 / 1024"*) echo 2048 ;;
      *pg_stat_activity*) echo '12|100' ;;
      *) echo '' ;;
    esac ;;
esac`
    );
    stub(
        'curl',
        `case "$*" in
  *-sI*) printf 'HTTP/2 200\\r\\npermissions-policy: geolocation=(), camera=(), payment=()\\r\\nstrict-transport-security: max-age=31536000\\r\\ncontent-security-policy: default-src self\\r\\n' ;;
  *redirect_url*) echo '301 https://app.example.test/' ;;
  *http_code*) echo 401 ;;
esac`
    );
    for (const name of ['openssl', 'sshd', 'apt-get', 'systemctl', 'journalctl', 'dmesg', 'crontab', 'ss']) {
        stub(name, 'exit 0');
    }
    return stack;
}

function run(extraEnv: Record<string, string> = {}) {
    const stack = setup();
    rmSync(join(work, 'exec.log'), { force: true });
    return spawnSync('bash', [script, '--supabase-dir', stack], {
        encoding: 'utf8',
        env: {
            ...process.env,
            PATH: `${join(work, 'bin')}:${process.env.PATH}`,
            AUDIT_CPU_SAMPLE_SECONDS: '0',
            ...extraEnv,
        },
        timeout: 60_000,
    });
}

describe('scripts/audit-live-stack.sh', () => {
    const result = run();
    const out = result.stdout;

    it('reports the hardening gaps it is meant to find', () => {
        expect(out).toMatch(/\[FAIL\] supabase-pooler publishes port 6543 on all interfaces/);
        expect(out).not.toMatch(/supabase-kong publishes/);
        expect(out).toMatch(/\[FAIL\] .*\.env is world-readable/);
        expect(out).toMatch(/\[FAIL\] Upstream example values still in use: POSTGRES_PASSWORD/);
        expect(out).toMatch(/\[FAIL\] ANON_KEY is the public demo key/);
        expect(out).toMatch(/\[PASS\] SERVICE_ROLE_KEY is not the demo key/);
        expect(out).toMatch(/\[FAIL\] Permissions-Policy blocks the camera/);
        expect(out).toMatch(
            /\[WARN\] https:\/\/api\.example\.test\/mcp is reachable from the internet behind basic auth/
        );
        expect(out).toMatch(/\[FAIL\] Public tables without row-level security .*: leaky_table/);
        expect(out).toMatch(/\[PASS\] supabase-db has oom_score_adj -800/);
        expect(out).toMatch(/\[PASS\] shared_buffers is 2048 MB/);
        expect(out).toMatch(/\[PASS\] Connections: 12 of 100/);
    });

    it('exits non-zero when something fails', () => {
        expect(result.status).toBe(1);
        expect(out).toMatch(/Summary: .*FAIL/);
    });

    it('never prints secret values', () => {
        for (const secret of [POSTGRES_PASSWORD, JWT_SECRET, DEMO_ANON_KEY, SERVICE_ROLE_KEY]) {
            expect(out).not.toContain(secret);
            expect(result.stderr).not.toContain(secret);
        }
    });

    it('only reads: SELECT/SHOW queries and read-only docker subcommands', () => {
        const queries = [...body.matchAll(/psql_q "([^"]*)"/g), ...body.matchAll(/psql_q '([^']*)'/g)].map((m) =>
            m[1].trim()
        );
        expect(queries.length).toBeGreaterThan(10);
        for (const q of queries) expect(q).toMatch(/^(SELECT|SHOW)\b/);

        // Advice printed to the operator ("systemctl disable --now vsftpd") is text, not a command run.
        const code = body.replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => (m.includes('$(') ? m : '""'));
        const dockerCalls = [...code.matchAll(/\bdocker\s+([a-z]+)/g)].map((m) => m[1]);
        for (const sub of dockerCalls) expect(['info', 'inspect', 'ps', 'stats', 'exec', 'group']).toContain(sub);
        expect(code).not.toMatch(/systemctl\s+(stop|start|restart|disable|enable|mask)\b/);
    });
});

describe('scripts/audit-live-stack.sh when Postgres needs a password', () => {
    // The supabase_admin login over loopback asked for a password on a real stack; psql's hidden
    // prompt then hung the run. It must fail fast and retry with POSTGRES_PASSWORD from .env.
    const result = run({ REQUIRE_PW: '1' });
    const execLog = readFileSync(join(work, 'exec.log'), 'utf8');

    it('finishes and runs the database checks with the password', () => {
        expect(result.error).toBeUndefined();
        expect(result.stdout).toMatch(/\[PASS\] shared_buffers is 2048 MB/);
        expect(result.stdout).not.toMatch(/Could not query Postgres/);
    });

    it('never lets psql prompt or read stdin', () => {
        const calls = execLog.trim().split('\n');
        expect(calls.length).toBeGreaterThan(5);
        for (const call of calls) {
            expect(call).toMatch(/\bpsql -w\b/);
            expect(call).not.toMatch(/(^|\s)-i(\s|$)/);
        }
    });

    it('passes the password through the environment, not the command line', () => {
        expect(execLog).not.toContain(POSTGRES_PASSWORD);
    });
});
