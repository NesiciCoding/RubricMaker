import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const scriptsDir = resolve(root, 'scripts');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const PASSPHRASE = 'unit-test-passphrase-0123456789';

// An rclone stand-in whose "bucket" is a local directory: it records every invocation and fails
// unless the vault password arrived through the environment, the only way the scripts may pass it.
const STUB_RCLONE = `#!/bin/bash
printf '%s\\n' "$*" >> "$STUB_LOG"
if [[ "$1" == obscure ]]; then cat > /dev/null; echo OBSCURED; exit 0; fi
[[ "$1" == --config ]] && shift 2
[[ "\${RCLONE_CONFIG_VAULT_PASSWORD:-}" == OBSCURED ]] || { echo "vault password missing" >&2; exit 9; }
remote() { printf '%s/%s' "$REMOTE_ROOT" "\${1#vault:}"; }
case "$1" in
    copy)
        src="$2"; dst="$3"
        [[ "$src" == vault:* ]] && src="$(remote "$src")"
        [[ "$dst" == vault:* ]] && dst="$(remote "$dst")"
        [[ -d "$src" ]] || exit 3
        mkdir -p "$dst" && cp -R "$src"/. "$dst"/ ;;
    cryptcheck) diff -r "$2" "$(remote "$3")" ;;
    lsf) ls -1 "$REMOTE_ROOT" | sed 's:$:/:' ;;
    purge) rm -rf "$(remote "$2")" ;;
    *) exit 2 ;;
esac
`;

let dir: string;
let remoteRoot: string;
let log: string;
let envFile: string;

function writeEnv(extra: Record<string, string> = {}) {
    const values: Record<string, string> = {
        OFFSITE_S3_ENDPOINT: 'https://s3.example.test',
        OFFSITE_S3_BUCKET: 'bucket',
        OFFSITE_S3_ACCESS_KEY_ID: 'key-id',
        OFFSITE_S3_SECRET_ACCESS_KEY: 'key-secret',
        BACKUP_ENCRYPTION_PASSPHRASE: PASSPHRASE,
        ...extra,
    };
    writeFileSync(
        envFile,
        Object.entries(values)
            .map(([k, v]) => `${k}=${v}`)
            .join('\n')
    );
}

function makeBackup(parent: string, name: string, sums = true) {
    const b = join(parent, name);
    mkdirSync(b, { recursive: true });
    writeFileSync(join(b, 'FORMAT'), '2\n');
    writeFileSync(join(b, 'data.sql'), 'COPY public.rubrics (id) FROM stdin;\n1\n\\.\n');
    writeFileSync(join(b, 'migrations.txt'), '001_init.sql\n');
    writeFileSync(join(b, 'storage.tar.gz'), 'not really gzip');
    if (sums) {
        const out = spawnSync('sha256sum', ['FORMAT', 'data.sql', 'migrations.txt', 'storage.tar.gz'], {
            cwd: b,
            encoding: 'utf8',
        });
        writeFileSync(join(b, 'SHA256SUMS'), out.stdout);
    }
    return b;
}

function run(script: string, args: string[], env: Record<string, string> = {}) {
    return spawnSync('bash', [join(scriptsDir, script), ...args], {
        cwd: dir,
        encoding: 'utf8',
        env: {
            ...process.env,
            BACKUP_ENV_FILE: envFile,
            OFFSITE_RCLONE: join(dir, 'rclone'),
            REMOTE_ROOT: remoteRoot,
            STUB_LOG: log,
            ...env,
        },
    });
}

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rm-offsite-'));
    remoteRoot = join(dir, 'remote');
    mkdirSync(remoteRoot);
    log = join(dir, 'rclone.log');
    envFile = join(dir, '.env.backup');
    writeFileSync(join(dir, 'rclone'), STUB_RCLONE, { mode: 0o755 });
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

// #872: backups lived on the same host as the database they protect.
describe('offsite-backup.sh', () => {
    it('refuses to run until every setting is configured, naming what is missing', () => {
        const out = run('offsite-backup.sh', ['list']);
        expect(out.status).toBe(1);
        expect(out.stderr).toContain('OFFSITE_S3_BUCKET');
        expect(out.stderr).toContain('BACKUP_ENCRYPTION_PASSPHRASE');
    });

    it('rejects a short encryption passphrase', () => {
        writeEnv({ BACKUP_ENCRYPTION_PASSPHRASE: 'short' });
        const out = run('offsite-backup.sh', ['list']);
        expect(out.status).toBe(1);
        expect(out.stderr).toContain('at least 20 characters');
    });

    it('uploads, verifies the upload and keeps only OFFSITE_KEEP copies, newest first', () => {
        writeEnv({ OFFSITE_KEEP: '2' });
        const local = join(dir, 'backups');
        for (const name of ['20260101_000000', '20260102_000000', '20260103_000000']) {
            const out = run('offsite-backup.sh', ['push', makeBackup(local, name)]);
            expect(out.status, out.stderr).toBe(0);
        }
        expect(readdirSync(remoteRoot).sort()).toEqual(['20260102_000000', '20260103_000000']);
        const calls = readFileSync(log, 'utf8');
        const copy = calls.indexOf('copy');
        expect(copy).toBeGreaterThan(-1);
        expect(calls.indexOf('cryptcheck')).toBeGreaterThan(copy);
        expect(calls).toContain('purge vault:20260101_000000');
        // The passphrase only ever travels through the environment.
        expect(calls).not.toContain(PASSPHRASE);
    });

    it('never prunes when OFFSITE_KEEP is 0 (the bucket lifecycle expires copies instead)', () => {
        writeEnv({ OFFSITE_KEEP: '0' });
        const local = join(dir, 'backups');
        for (const name of ['20260101_000000', '20260102_000000']) {
            expect(run('offsite-backup.sh', ['push', makeBackup(local, name)]).status).toBe(0);
        }
        expect(readdirSync(remoteRoot)).toHaveLength(2);
        expect(readFileSync(log, 'utf8')).not.toContain('purge');
    });

    it('adds checksums to an older backup that has none before uploading it', () => {
        writeEnv();
        const b = makeBackup(join(dir, 'backups'), '20260101_000000', false);
        expect(run('offsite-backup.sh', ['push', b]).status).toBe(0);
        expect(existsSync(join(remoteRoot, '20260101_000000', 'SHA256SUMS'))).toBe(true);
    });

    it('refuses to upload a backup whose files no longer match its checksums', () => {
        writeEnv();
        const b = makeBackup(join(dir, 'backups'), '20260101_000000');
        writeFileSync(join(b, 'data.sql'), 'tampered');
        const out = run('offsite-backup.sh', ['push', b]);
        expect(out.status).toBe(1);
        expect(out.stderr).toContain('checksum mismatch');
        expect(readdirSync(remoteRoot)).toHaveLength(0);
    });

    it('refuses directories that are not backups made by backup.sh', () => {
        writeEnv();
        const notNamed = makeBackup(join(dir, 'backups'), 'latest-copy');
        expect(run('offsite-backup.sh', ['push', notNamed]).status).toBe(1);
        const notFormat2 = makeBackup(join(dir, 'backups'), '20260101_000000');
        writeFileSync(join(notFormat2, 'FORMAT'), '1\n');
        expect(run('offsite-backup.sh', ['push', notFormat2]).status).toBe(1);
    });

    it('pulls the newest backup and verifies it', () => {
        writeEnv();
        makeBackup(remoteRoot, '20260101_000000');
        makeBackup(remoteRoot, '20260102_000000');
        const dest = join(dir, 'restore');
        const out = run('offsite-backup.sh', ['pull', 'latest', dest]);
        expect(out.status, out.stderr).toBe(0);
        expect(readdirSync(dest)).toEqual(['20260102_000000']);
        expect(out.stdout).toContain('checksums verified');
    });

    it('keeps nothing from a download that fails verification, so it cannot be restored or block a retry', () => {
        writeEnv();
        const remote = makeBackup(remoteRoot, '20260101_000000');
        writeFileSync(join(remote, 'storage.tar.gz'), 'bit rot');
        const dest = join(dir, 'restore');
        const out = run('offsite-backup.sh', ['pull', '20260101_000000', dest]);
        expect(out.status).toBe(1);
        expect(existsSync(join(dest, '20260101_000000'))).toBe(false);
    });
});

describe('restore drill', () => {
    // A docker that answers `compose version` and records everything else it is asked to do.
    function stubDocker() {
        const bin = join(dir, 'bin');
        mkdirSync(bin);
        writeFileSync(join(bin, 'docker'), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${log}.docker"\nexit 0\n`, {
            mode: 0o755,
        });
        return { PATH: `${bin}:${process.env.PATH}` };
    }

    it('refuses to run as the live Compose project', () => {
        writeEnv();
        const out = run('restore-drill.sh', [], { ...stubDocker(), RESTORE_DRILL_PROJECT: 'rubricmaker' });
        expect(out.status).toBe(1);
        expect(out.stderr).toContain('is the live project');
        expect(existsSync(`${log}.docker`) ? readFileSync(`${log}.docker`, 'utf8') : '').not.toMatch(/ up |down/);
    });

    it('refuses a COMPOSE command that already picks a project', () => {
        writeEnv();
        const out = run('restore-drill.sh', [], { ...stubDocker(), COMPOSE: 'docker compose -p rubricmaker' });
        expect(out.status).toBe(1);
        expect(out.stderr).toContain('must not set a project');
    });

    it('points every restore step at the scratch project, never at an exported live setting', () => {
        const drill = read('scripts/restore-drill.sh');
        expect(drill).toMatch(/DB_EXEC="\$DRILL_DB_EXEC" STORAGE_VOLUME="\$DRILL_VOLUME"[\s\S]*restore\.sh" --yes/);
        expect(drill).toContain('trap teardown EXIT');
        expect(drill).toContain('down -v --remove-orphans');
    });

    it('counts the rows of every table in a dump, including empty ones and escaped newlines', () => {
        const dump = join(dir, 'data.sql');
        writeFileSync(
            dump,
            [
                'SET statement_timeout = 0;',
                'COPY public.rubrics (id, data) FROM stdin;',
                'a\t{"note": "line1\\nline2"}',
                'b\t{}',
                '\\.',
                'COPY auth.users (id) FROM stdin;',
                '\\.',
                "SELECT pg_catalog.setval('public.seq', 1, true);",
            ].join('\n') + '\n'
        );
        const out = spawnSync('bash', ['-c', `source ./compose.sh; source ./offsite.sh; dump_row_counts '${dump}'`], {
            cwd: join(scriptsDir, 'lib'),
            encoding: 'utf8',
        });
        expect(out.status, out.stderr).toBe(0);
        expect(out.stdout).toBe('auth.users\t0\npublic.rubrics\t2\n');
    });
});

describe('backup scripts', () => {
    it('reach Postgres over loopback TCP, which the image trusts, not the password-protected socket', () => {
        expect(read('scripts/lib/compose.sh')).toContain('exec -T -e PGHOST=127.0.0.1 db');
        for (const name of ['backup.sh', 'restore.sh']) {
            const body = read(`scripts/${name}`);
            expect(body, name).toContain('DB_EXEC="$(db_exec_default)"');
            expect(body, name).not.toContain('exec -T db"');
        }
    });

    it('write checksums with every backup and check them before a restore changes anything', () => {
        expect(read('scripts/backup.sh')).toContain('write_checksums "$OUT"');
        const restore = read('scripts/restore.sh');
        const check = restore.indexOf('verify_checksums "$BACKUP_DIR"');
        expect(check).toBeGreaterThan(-1);
        expect(check).toBeLessThan(restore.indexOf('tar xzf - -C /data/$STAGING'));
        expect(check).toBeLessThan(restore.indexOf('--single-transaction'));
    });

    it('ping the heartbeat only after the off-site copy succeeded', () => {
        const job = read('scripts/scheduled-backup.sh');
        expect(job.indexOf('require_offsite_config')).toBeLessThan(job.indexOf('/backup.sh"'));
        expect(job.indexOf('offsite-backup.sh" push')).toBeLessThan(job.indexOf('ping_heartbeat'));
        expect(job).toMatch(/set -euo pipefail/);
    });

    it('keep the off-site and observability credentials files out of git', () => {
        const ignored = read('.gitignore').split('\n');
        expect(ignored).toContain('.env.backup');
        expect(ignored).toContain('.env.observability');
        expect(read('.env.backup.example')).toContain('BACKUP_ENCRYPTION_PASSPHRASE=\n');
    });
});
