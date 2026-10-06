import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const backup = readFileSync(resolve(__dirname, '../../scripts/backup.sh'), 'utf8');
const restore = readFileSync(resolve(__dirname, '../../scripts/restore.sh'), 'utf8');

// #637: a whole-database --no-acl dump replayed without ON_ERROR_STOP dropped every GRANT and
// reported success after half-restoring. Keep the data-only, all-or-nothing design.
describe('backup/restore scripts', () => {
    it('backs up rows only, so grants, policies and triggers stay with the migrations', () => {
        expect(backup).toMatch(/pg_dump[^\n]*--data-only/);
        expect(backup).not.toContain('--no-acl');
        expect(backup).toContain('migrations.txt');
    });

    it('restores in one transaction that stops on the first error', () => {
        expect(restore).toContain('ON_ERROR_STOP=1');
        expect(restore).toContain('--single-transaction');
        expect(restore).toMatch(/set -euo pipefail/);
    });

    it('never drops a schema and refuses a backup taken on newer migrations', () => {
        expect(restore).not.toMatch(/DROP SCHEMA/i);
        expect(restore).toContain('missing migrations');
    });
});
