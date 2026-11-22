import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDocument } from 'yaml';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const COMPOSE_FILES = [
    'docker-compose.yml',
    'docker-compose.observability.yml',
    'deploy/supabase/docker-compose.override.yml',
];

function load(file: string) {
    const doc = parseDocument(readFileSync(resolve(root, file), 'utf8'));
    return { errors: doc.errors.map((e) => e.message), value: doc.toJS() as Record<string, unknown> };
}

describe('compose files', () => {
    it.each(COMPOSE_FILES)('%s is valid YAML', (file) => {
        expect(load(file).errors).toEqual([]);
    });

    it('the official-stack override wires mail into auth and the edge functions', () => {
        const services = load('deploy/supabase/docker-compose.override.yml').value.services as Record<
            string,
            { environment?: Record<string, string> }
        >;
        expect(Object.keys(services).sort()).toEqual([
            'api-gw',
            'auth',
            'db',
            'functions',
            'imgproxy',
            'mail-templates',
            'meta',
            'realtime',
            'rest',
            'storage',
            'studio',
            'supavisor',
        ]);
        expect(services.auth.environment?.GOTRUE_MAILER_TEMPLATES_MAGIC_LINK).toBe(
            'http://mail-templates/magic-link.html'
        );
        for (const name of [
            'SMTP_HOST',
            'SMTP_PORT',
            'SMTP_USER',
            'SMTP_PASS',
            'SMTP_ADMIN_EMAIL',
            'SMTP_SENDER_NAME',
            'APP_URL',
        ]) {
            expect(services.functions.environment, name).toHaveProperty(name);
        }
    });

    it('the official-stack override binds the gateway and pooler to loopback only (#930)', () => {
        const services = load('deploy/supabase/docker-compose.override.yml').value.services as Record<
            string,
            { ports?: string[] }
        >;
        for (const port of services['api-gw'].ports ?? []) {
            expect(port).toMatch(/^127\.0\.0\.1:/);
        }
        for (const port of services.supavisor.ports ?? []) {
            expect(port).toMatch(/^127\.0\.0\.1:/);
        }
        expect(services.supavisor.ports).toHaveLength(2);
    });

    it('the official-stack override guards Postgres from the OOM killer (#932)', () => {
        const services = load('deploy/supabase/docker-compose.override.yml').value.services as Record<
            string,
            { oom_score_adj?: number; mem_limit?: string }
        >;
        expect(services.db.oom_score_adj).toBe(-800);
        for (const name of Object.keys(services)) {
            if (name === 'db') continue;
            expect(services[name].mem_limit, name).toBeTruthy();
        }
    });

    it('the official-stack override raises the Realtime tenant limits that survive a restart', () => {
        const services = load('deploy/supabase/docker-compose.override.yml').value.services as Record<
            string,
            { environment?: Record<string, string> }
        >;
        // Realtime recreates its self-hosted tenant on every start from these variables, so they
        // are the only place the limits persist.
        expect(services.realtime.environment).toEqual({
            TENANT_MAX_CONCURRENT_USERS: '1000',
            TENANT_MAX_EVENTS_PER_SECOND: '1000',
            TENANT_MAX_JOINS_PER_SECOND: '500',
            TENANT_MAX_CHANNELS_PER_CLIENT: '200',
        });
    });
});
