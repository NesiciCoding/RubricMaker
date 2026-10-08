import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isMetadataOnlyRow, isPurgeableRow } from '../../supabase/functions/_shared/attachmentPurgeGuard';

const OWNER = '123e4567-e89b-42d3-a456-426614174000';
const OTHER = '99999999-e89b-42d3-a456-426614174000';

describe('isPurgeableRow', () => {
    it('accepts a normal row: the path is <owner>/<id-like name>, optionally with one extension', () => {
        expect(isPurgeableRow({ id: 'abc_DEF-123', owner_id: OWNER, storage_path: `${OWNER}/abc_DEF-123` })).toBe(true);
        expect(isPurgeableRow({ id: 'abc', owner_id: OWNER, storage_path: `${OWNER}/abc.pdf` })).toBe(true);
    });

    it('rejects ids with quotes, separators or control characters', () => {
        for (const id of ["x'); DROP TABLE attachments;--", 'a|b', 'a\nb', 'a b', '', 'x'.repeat(65)]) {
            expect(isPurgeableRow({ id, owner_id: OWNER, storage_path: `${OWNER}/ok` })).toBe(false);
        }
    });

    it("rejects paths that leave the owner's folder or are not plain names", () => {
        for (const storage_path of [
            `${OWNER}/../backups/file`,
            `${OWNER}/a/b`,
            `/${OWNER}/a`,
            `${OTHER}/a`,
            `${OWNER}/a%2e%2e`,
            `${OWNER}/a..b`,
            `${OWNER}/.hidden`,
            `${OWNER}/a.`,
            `${OWNER}/`,
            `backups/${OWNER}/a`,
        ]) {
            expect(isPurgeableRow({ id: 'ok', owner_id: OWNER, storage_path })).toBe(false);
        }
    });

    it('rejects a row without a stored file', () => {
        expect(isPurgeableRow({ id: 'ok', owner_id: OWNER, storage_path: null })).toBe(false);
    });
});

describe('isMetadataOnlyRow', () => {
    it('accepts a row with no stored file and a plain id', () => {
        expect(isMetadataOnlyRow({ id: 'scan_1', owner_id: OWNER, storage_path: null })).toBe(true);
    });

    it('rejects rows that have a file or an unsafe id or owner', () => {
        expect(isMetadataOnlyRow({ id: 'scan_1', owner_id: OWNER, storage_path: `${OWNER}/scan_1` })).toBe(false);
        expect(isMetadataOnlyRow({ id: "x');--", owner_id: OWNER, storage_path: null })).toBe(false);
        expect(isMetadataOnlyRow({ id: 'scan_1', owner_id: 'not-a-uuid', storage_path: null })).toBe(false);
    });
});

describe('scripts/delete-old-attachments.sh', () => {
    const script = path.resolve(__dirname, '..', '..', 'scripts', 'delete-old-attachments.sh');

    function runScript(rows: string, scanRows = '', scanRowsWithoutFile = '') {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-purge-'));
        const log = path.join(dir, 'calls.log');
        const bin = path.join(dir, 'bin');
        fs.mkdirSync(bin);
        fs.writeFileSync(
            path.join(bin, 'docker-compose'),
            `#!/bin/bash
printf 'DC %s\\n' "$*" >> "${log}"
if [[ "$*" == *"SELECT id, storage_path"*"get_overdue_attachments"* ]]; then printf '%s' "$STUB_ROWS"; fi
if [[ "$*" == *"SELECT id, storage_path"*"get_overdue_scans"* ]]; then printf '%s' "$STUB_SCAN_ROWS"; fi
if [[ "$*" == *"SELECT id FROM"*"get_overdue_scans"*"storage_path IS NULL"* ]]; then printf '%s' "$STUB_SCAN_NO_FILE"; fi
`,
            { mode: 0o755 }
        );
        fs.writeFileSync(
            path.join(bin, 'curl'),
            `#!/bin/bash
printf 'CURL %s\\n' "$*" >> "${log}"
printf '200'
`,
            { mode: 0o755 }
        );
        execFileSync('bash', [script], {
            env: {
                ...process.env,
                PATH: `${bin}:${process.env.PATH}`,
                SERVICE_ROLE_KEY: 'test-key',
                SITE_URL: 'http://stub.local',
                STUB_ROWS: rows,
                STUB_SCAN_ROWS: scanRows,
                STUB_SCAN_NO_FILE: scanRowsWithoutFile,
            },
            stdio: 'pipe',
        });
        return fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
    }

    it('selects only rows that pass the same validation in SQL, so odd values never reach the shell', () => {
        const calls = runScript('');
        expect(calls).toContain('split_part(storage_path');
        expect(calls).toContain('^[A-Za-z0-9_-]{1,64}$');
    });

    it('deletes a valid row through the storage API and then the database', () => {
        const calls = runScript(`good_1|${OWNER}/good_1|${OWNER}\n`);
        expect(calls).toContain(`/storage/v1/object/attachments/${OWNER}/good_1`);
        expect(calls).toContain("DELETE FROM public.attachments WHERE id IN ('good_1')");
    });

    it('purges a file stored with an extension', () => {
        const calls = runScript(`doc_1|${OWNER}/doc_1.pdf|${OWNER}\n`);
        expect(calls).toContain(`/storage/v1/object/attachments/${OWNER}/doc_1.pdf`);
    });

    it('skips a row whose id or path is unsafe even if the database returns it', () => {
        const calls = runScript(
            [
                `x');DROP TABLE a;--|${OWNER}/y|${OWNER}`,
                `evil|${OWNER}/../backups/x|${OWNER}`,
                `ok|${OWNER}/ok|${OWNER}`,
            ].join('\n') + '\n'
        );
        const storageCalls = calls.split('\n').filter((line) => line.startsWith('CURL'));
        expect(calls).not.toContain('DROP TABLE');
        expect(storageCalls).toHaveLength(1);
        expect(storageCalls[0]).not.toContain('..');
        expect(calls).toContain("WHERE id IN ('ok')");
    });

    it('also purges overdue scans from the scans bucket and scan_metadata', () => {
        const calls = runScript('', `scan_1|${OWNER}/scan_1.jpg|${OWNER}\n`);
        expect(calls).toContain('get_overdue_scans(');
        expect(calls).toContain(`/storage/v1/object/scans/${OWNER}/scan_1.jpg`);
        expect(calls).toContain("DELETE FROM public.scan_metadata WHERE id IN ('scan_1')");
        expect(calls).not.toContain('DELETE FROM public.attachments');
    });

    it('deletes the row of an overdue text-only scan without calling the storage API', () => {
        const calls = runScript('', '', 'scan_txt\n');
        expect(calls).toContain("DELETE FROM public.scan_metadata WHERE id IN ('scan_txt')");
        expect(calls).not.toContain('CURL');
    });

    it('deletes file-backed and text-only scans in one statement', () => {
        const calls = runScript('', `scan_1|${OWNER}/scan_1.jpg|${OWNER}\n`, 'scan_txt\n');
        expect(calls).toContain(`/storage/v1/object/scans/${OWNER}/scan_1.jpg`);
        expect(calls).toContain("DELETE FROM public.scan_metadata WHERE id IN ('scan_txt','scan_1')");
    });

    it('skips a text-only row whose id is unsafe even if the database returns it', () => {
        const calls = runScript('', '', "x');DROP TABLE a;--\n");
        expect(calls).not.toContain('DROP TABLE');
        expect(calls).not.toContain('DELETE FROM public.scan_metadata');
    });

    it('runs each sweep independently and skips an unsafe scan row', () => {
        const calls = runScript(`good_1|${OWNER}/good_1|${OWNER}\n`, `scan_2|${OTHER}/../x|${OTHER}\n`);
        expect(calls).toContain("DELETE FROM public.attachments WHERE id IN ('good_1')");
        expect(calls).not.toContain('DELETE FROM public.scan_metadata');
    });
});
