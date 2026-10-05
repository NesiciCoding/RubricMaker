import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..', '..');
const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
const envExample = fs.readFileSync(path.join(root, '.env.docker.example'), 'utf8');

const REQUIRED = ['POSTGRES_PASSWORD', 'JWT_SECRET', 'ANON_KEY', 'SERVICE_ROLE_KEY', 'JWT_JWKS'];

describe('docker-compose secrets', () => {
    it('ships no default secret or demo key', () => {
        expect(compose).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
        expect(compose).not.toContain('super-secret-jwt-token');
        for (const name of REQUIRED) {
            expect(compose, `${name} must not have a default`).not.toMatch(new RegExp(`\\$\\{${name}:-`));
        }
    });

    it('requires every secret to be set', () => {
        for (const name of REQUIRED) {
            expect(compose, `${name} must be required`).toMatch(new RegExp(`\\$\\{${name}:\\?`));
        }
    });

    it('uses the configured database password for every service role', () => {
        expect(compose).not.toMatch(/(supabase_auth_admin|authenticator|supabase_storage_admin):postgres@/);
    });

    it('keeps demo keys out of the env example', () => {
        expect(envExample).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
        expect(envExample).not.toContain('super-secret-jwt-token');
        expect(envExample).not.toMatch(/^POSTGRES_PASSWORD=postgres$/m);
    });
});

describe('scripts/generate-docker-secrets.sh', () => {
    const script = path.join(root, 'scripts', 'generate-docker-secrets.sh');

    function run(envFile: string) {
        execFileSync('bash', [script], { env: { ...process.env, ENV_FILE: envFile }, stdio: 'pipe' });
        return Object.fromEntries(
            fs
                .readFileSync(envFile, 'utf8')
                .split('\n')
                .filter((l) => /^[A-Z_]+=/.test(l))
                .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
        ) as Record<string, string>;
    }

    const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

    it('fills every secret with fresh values and signs the API keys with the JWT secret', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-secrets-'));
        const envFile = path.join(dir, '.env');
        const env = run(envFile);

        for (const name of REQUIRED) expect(env[name], name).toBeTruthy();
        expect(env.JWT_SECRET).toMatch(/^[0-9a-f]{64}$/);
        expect(env.POSTGRES_PASSWORD).toMatch(/^[A-Za-z0-9]{24,}$/);

        for (const [name, role] of [
            ['ANON_KEY', 'anon'],
            ['SERVICE_ROLE_KEY', 'service_role'],
        ] as const) {
            const [h, p, s] = env[name].split('.');
            expect(JSON.parse(Buffer.from(p, 'base64url').toString()).role).toBe(role);
            const expected = crypto.createHmac('sha256', env.JWT_SECRET).update(`${h}.${p}`).digest();
            expect(s).toBe(b64url(expected));
        }
        const jwks = JSON.parse(env.JWT_JWKS.replace(/^'|'$/g, '')) as { keys: { k: string }[] };
        expect(jwks.keys[0].k).toBe(b64url(env.JWT_SECRET));
    });

    it('never overwrites values that are already set', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-secrets-'));
        const envFile = path.join(dir, '.env');
        const first = run(envFile);
        const second = run(envFile);
        expect(second).toEqual(first);
    });
});
