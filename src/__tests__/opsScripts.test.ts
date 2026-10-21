import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const libDir = resolve(root, 'scripts', 'lib');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const compose = read('docker-compose.yml');
const scripts = [
    'backup.sh',
    'restore.sh',
    'delete-old-attachments.sh',
    'import-cloud.sh',
    'offsite-backup.sh',
    'scheduled-backup.sh',
    'restore-drill.sh',
].map((name) => ({
    name,
    body: read(`scripts/${name}`),
}));

// service → { dependency: condition }, read from the two-space-indented services block.
function dependsOn(): Record<string, Record<string, string>> {
    const deps: Record<string, Record<string, string>> = {};
    let service = '';
    let inDeps = false;
    let dep = '';
    for (const line of compose.split('\n')) {
        const svc = /^ {2}([a-z_]+):\s*$/.exec(line);
        if (svc) {
            service = svc[1];
            deps[service] = {};
            inDeps = false;
            continue;
        }
        if (/^\S/.test(line)) service = '';
        if (!service || /^\s*#/.test(line)) continue;
        if (/^ {4}depends_on:\s*$/.test(line)) {
            inDeps = true;
            continue;
        }
        if (/^ {4}\S/.test(line)) inDeps = false;
        if (!inDeps) continue;
        const name = /^ {6}([a-z_]+):\s*$/.exec(line);
        if (name) dep = name[1];
        const cond = /^ {8}condition:\s*(\S+)/.exec(line);
        if (cond && dep) deps[service][dep] = cond[1];
    }
    return deps;
}

// #645: ops scripts that silently purged/restored nothing, and a stack that served before migrating.
describe('ops scripts', () => {
    it('work with Compose v2 and v1 instead of hard-coding docker-compose', () => {
        for (const { name, body } of scripts) {
            expect(body, name).toContain('lib/compose.sh');
            expect(body, name).not.toMatch(/^[^#\n]*docker-compose (exec|run|-f)/m);
        }
        expect(read('scripts/lib/compose.sh')).toContain('docker compose version');
    });

    it('derive the uploads volume from the effective Compose project', () => {
        for (const { name, body } of scripts) {
            expect(body, name).not.toContain('-v rubricmaker_storage-data');
        }
        const volume = (env: Record<string, string>) => {
            const out = spawnSync('bash', ['-c', 'source ./compose.sh; printf %s "$STORAGE_VOLUME"'], {
                cwd: libDir,
                encoding: 'utf8',
                env: { ...process.env, ...env },
            });
            expect(out.status, out.stderr).toBe(0);
            return out.stdout;
        };
        // docker-compose.yml pins `name: rubricmaker`.
        expect(volume({})).toBe('rubricmaker_storage-data');
        expect(volume({ COMPOSE_PROJECT_NAME: 'school' })).toBe('school_storage-data');
        // The -p/--project-name flag outranks the environment — missing it is what let backup.sh
        // archive an empty, differently-named volume while the stack ran elsewhere.
        expect(volume({ COMPOSE: 'docker compose -p school', COMPOSE_PROJECT_NAME: 'ignored' })).toBe(
            'school_storage-data'
        );
        expect(volume({ COMPOSE: 'docker-compose --project-name=other' })).toBe('other_storage-data');
        expect(volume({ STORAGE_VOLUME: 'custom-vol' })).toBe('custom-vol');
    });

    it('read COMPOSE_PROJECT_NAME from the project .env Compose itself loads', () => {
        const dir = mkdtempSync(join(tmpdir(), 'rm-compose-'));
        writeFileSync(join(dir, 'docker-compose.yml'), 'name: pinned\nservices: {}\n');
        writeFileSync(join(dir, '.env'), 'COMPOSE_PROJECT_NAME=fromenv\n');
        const composeFile = join(dir, 'docker-compose.yml');
        try {
            const out = spawnSync('bash', ['-c', 'source ./compose.sh; printf %s "$STORAGE_VOLUME"'], {
                cwd: libDir,
                encoding: 'utf8',
                env: { ...process.env, COMPOSE_FILE: composeFile },
            });
            expect(out.status, out.stderr).toBe(0);
            expect(out.stdout).toBe('fromenv_storage-data');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('refuse a backup whose uploads volume is missing instead of archiving an empty one', () => {
        const dir = mkdtempSync(join(tmpdir(), 'rm-backup-'));
        const bin = join(dir, 'bin');
        mkdirSync(bin);
        // A docker that answers `compose version` but reports the named volume as absent.
        writeFileSync(join(bin, 'docker'), '#!/bin/bash\n[[ "$1" == volume && "$2" == inspect ]] && exit 1\nexit 0\n', {
            mode: 0o755,
        });
        try {
            const out = spawnSync('bash', [resolve(root, 'scripts', 'backup.sh'), join(dir, 'backups')], {
                cwd: dir,
                encoding: 'utf8',
                env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
            });
            expect(out.status).toBe(1);
            expect(out.stdout).toContain('does not exist');
            // It fails before writing anything, so no half-empty backup directory is left behind.
            expect(existsSync(join(dir, 'backups'))).toBe(false);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('default the storage API to the port the stack listens on', () => {
        expect(compose).toContain('"8080:80"');
        for (const name of ['delete-old-attachments.sh', 'import-cloud.sh']) {
            const body = read(`scripts/${name}`);
            expect(body, name).toContain('http://localhost:8080');
            expect(body, name).not.toContain('localhost:8000');
        }
    });

    it('exit non-zero when a storage delete fails', () => {
        const body = read('scripts/delete-old-attachments.sh');
        expect(body).toMatch(/FAILED=\$\(\(FAILED \+ 1\)\)/);
        expect(body).toMatch(/if \[\[ \$FAILED -gt 0 \]\]; then[\s\S]*exit 1/);
    });

    it('unpack the uploads archive before touching the database or the live files', () => {
        const body = read('scripts/restore.sh');
        const staged = body.indexOf('tar xzf - -C /data/$STAGING');
        expect(staged).toBeGreaterThan(-1);
        expect(staged).toBeLessThan(body.indexOf('--single-transaction'));
        expect(body).not.toContain('rm -rf /data/* &&');
    });

    // #926: the image only accepts supabase_admin on the local socket with a password, so every
    // `exec … db psql` without PGHOST=127.0.0.1 failed with "fe_sendauth: no password supplied".
    it('reach Postgres over loopback TCP, never the password-protected socket', () => {
        const shellScripts = readdirSync(resolve(root, 'scripts'))
            .filter((name) => name.endsWith('.sh'))
            .map((name) => `scripts/${name}`);
        const files = [
            ...shellScripts,
            'README.md',
            'docs/SELF_HOSTING_OPS.md',
            'docker/db/roles.sql',
            '.env.docker.example',
        ];
        for (const file of files) {
            for (const line of read(file).split('\n')) {
                if (/\bexec\b[^|]*\bdb (psql|pg_dump)\b/.test(line)) {
                    expect(line, file).toContain('PGHOST=127.0.0.1');
                }
            }
        }
        expect(read('scripts/lib/compose.sh')).toContain('DB_EXEC_ARGS=(exec -T -e PGHOST=127.0.0.1 db)');
        expect(read('scripts/delete-old-attachments.sh')).toContain('"${DB_EXEC_ARGS[@]}" psql');
        expect(read('scripts/import-cloud.sh').match(/"\$\{DB_EXEC_ARGS\[@\]\}" psql/g)).toHaveLength(3);
    });

    it('fail the attachment cleanup with the database error in the log, not silently', () => {
        const dir = mkdtempSync(join(tmpdir(), 'rm-cleanup-'));
        const bin = join(dir, 'bin');
        mkdirSync(bin);
        // A docker whose `compose version` works but whose database refuses every connection.
        writeFileSync(
            join(bin, 'docker'),
            '#!/bin/bash\n[[ "$*" == *exec* ]] && { echo "psql: error: connection refused by stub" >&2; exit 2; }\nexit 0\n',
            { mode: 0o755 }
        );
        try {
            const out = spawnSync('bash', [resolve(root, 'scripts', 'delete-old-attachments.sh')], {
                cwd: dir,
                encoding: 'utf8',
                env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SERVICE_ROLE_KEY: 'stub-key' },
            });
            expect(out.status).not.toBe(0);
            expect(out.stderr).toContain('connection refused by stub');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('docker-compose start order', () => {
    const deps = dependsOn();

    it('runs migrations once GoTrue and storage-api have created their schemas', () => {
        expect(deps.db_migrate).toMatchObject({ auth: 'service_healthy', storage: 'service_healthy' });
    });

    it('serves the app (the only published port) only after migrations completed', () => {
        expect(deps.app.db_migrate).toBe('service_completed_successfully');
        for (const svc of ['db', 'auth', 'rest', 'storage', 'db_migrate']) {
            const block = compose.split(new RegExp(`^ {2}${svc}:\\s*$`, 'm'))[1].split(/^ {2}[a-z_]+:\s*$/m)[0];
            expect(block, svc).not.toMatch(/^ {4}ports:/m);
        }
    });

    it('has no dependency cycle', () => {
        const visiting = new Set<string>();
        const done = new Set<string>();
        const visit = (svc: string) => {
            if (done.has(svc)) return;
            expect(visiting.has(svc), `cycle through ${svc}`).toBe(false);
            visiting.add(svc);
            Object.keys(deps[svc] ?? {}).forEach(visit);
            visiting.delete(svc);
            done.add(svc);
        };
        Object.keys(deps).forEach(visit);
    });
});
