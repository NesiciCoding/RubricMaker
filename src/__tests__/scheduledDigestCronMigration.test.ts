import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = resolve(__dirname, '../../supabase/migrations');
const bootstrap = readFileSync(resolve(__dirname, '../../supabase/bootstrap.sql'), 'utf8');

// cron.schedule() upserts on the job name, so the last migration that schedules
// teacher-email-digest is the command that actually runs. Migration 106 set its pg_net
// budget and added the config guard; a later reschedule must not drop them again.
const schedules = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .flatMap((file) => {
        const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
        return [...sql.matchAll(/cron\.schedule\(\s*'teacher-email-digest'/g)].map((match) => ({
            file,
            statement: sql.slice(match.index ?? 0).trim(),
        }));
    });

const effective = schedules[schedules.length - 1];

describe('teacher-email-digest cron schedule', () => {
    it('is scheduled by a migration', () => {
        expect(effective, 'no migration schedules teacher-email-digest').toBeDefined();
    });

    it('gives net.http_post at least the two-minute pg_net budget', () => {
        expect(effective.statement).toMatch(/net\.http_post\(/);
        const timeout = /timeout_milliseconds\s*:=\s*(\d+)/.exec(effective.statement);
        expect(timeout, `${effective.file} schedules the digest without timeout_milliseconds`).not.toBeNull();
        // pg_net cancels the request at timeout_milliseconds (default 5000) and records a
        // timed_out failure, while the function keeps sending mail — the false alert this
        // guard exists to prevent.
        expect(Number(timeout![1])).toBeGreaterThanOrEqual(120000);
    });

    it('fails loudly on missing app.settings instead of posting with a blank URL or bearer token', () => {
        expect(effective.statement).toContain("current_setting('app.settings.project_url', true)");
        expect(effective.statement).toContain("current_setting('app.settings.service_role_key', true)");
        expect(effective.statement).toMatch(/raise exception 'teacher-email-digest/);
        expect(effective.statement.indexOf('raise exception')).toBeLessThan(
            effective.statement.indexOf('net.http_post(')
        );
    });

    it('ships the guarded schedule in the generated bootstrap schema', () => {
        expect(bootstrap).toContain(effective.statement);
    });
});
