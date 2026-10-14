import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/089_client_logs_bounds.sql'), 'utf8');

describe('migration 089 (#638)', () => {
    it('rejects oversized client_logs rows without revalidating existing ones', () => {
        expect(sql).toContain('ADD CONSTRAINT client_logs_bounded CHECK');
        expect(sql).toContain('pg_column_size(meta) <= 16384');
        expect(sql).toMatch(/\) NOT VALID;/);
    });

    it('allows at least 4x the client logger character limits in bytes', () => {
        const limit = (column: string) => Number(new RegExp(`octet_length\\(${column}\\) <= (\\d+)`).exec(sql)?.[1]);
        expect(limit('name')).toBeGreaterThanOrEqual(128 * 4);
        expect(limit('path')).toBeGreaterThanOrEqual(512 * 4);
        expect(limit('role')).toBeGreaterThanOrEqual(32 * 4);
        expect(limit('school_id')).toBeGreaterThanOrEqual(64 * 4);
    });

    it('purges rows older than 30 days nightly', () => {
        expect(sql).toMatch(/cron\.schedule\(\s*'client-logs-cleanup'/);
        expect(sql).toContain("created_at < now() - interval '30 days'");
    });
});
