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
        expect(Object.keys(services).sort()).toEqual(['auth', 'functions', 'mail-templates']);
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
});
