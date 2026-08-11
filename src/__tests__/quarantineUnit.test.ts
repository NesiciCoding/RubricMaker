import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { UnitQuarantineEntry } from '../test-utils/quarantine';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Ids are passed to `vitest run -t <id>` (a regexp) and must be substrings of
// the quarantined test's title, so restrict them to regex-safe characters.
const ID_PATTERN = /^[A-Za-z0-9 _-]+$/;

describe('unit-test quarantine list (quarantine-unit.json)', () => {
    const entries = JSON.parse(
        readFileSync(path.join(repoRoot, 'quarantine-unit.json'), 'utf8')
    ) as UnitQuarantineEntry[];

    it('has no duplicate ids', () => {
        const ids = entries.map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('every entry names an existing test file under src/', () => {
        for (const entry of entries) {
            expect(entry.file, `entry without file: ${JSON.stringify(entry)}`).toMatch(/^src\/.+\.test\.(ts|tsx)$/);
            expect(existsSync(path.join(repoRoot, entry.file)), `file not found: ${entry.file}`).toBe(true);
        }
    });

    it('every entry has a reason and a regex-safe id', () => {
        for (const entry of entries) {
            expect(entry.reason?.trim().length ?? 0, `entry without reason: ${entry.id}`).toBeGreaterThan(0);
            expect(entry.id, `id must match ${ID_PATTERN}: ${entry.id}`).toMatch(ID_PATTERN);
        }
    });

    it('every entry records a valid quarantine date (since)', () => {
        const today = new Date().toISOString().slice(0, 10);
        for (const entry of entries) {
            expect(entry.since, `entry without since: ${entry.id}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(entry.since! <= today, `since in the future for ${entry.id}`).toBe(true);
        }
    });

    it('every id is wired into its file via isQuarantined() and matches the test title', () => {
        for (const entry of entries) {
            const text = readFileSync(path.join(repoRoot, entry.file), 'utf8');
            // Convention: the skip marker and title live on one line so this
            // guard can verify the wiring and the title/id relationship.
            // The `)\+` matches both the isQuarantined() and the skipIf()
            // closing parens before the title (`skipIf(isQuarantined('id'))('title'`),
            // and requiring `skipIf(` guarantees the marker actually skips.
            const marker = new RegExp(
                `skipIf\\(\\s*isQuarantined\\(\\s*['"]${entry.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*\\)+\\s*\\(\\s*['"]([^'"]+)['"]`
            );
            const match = text.match(marker);
            expect(
                match,
                `skipIf(isQuarantined('${entry.id}'))('title', fn) not found in ${entry.file} — the marker must ` +
                    `actually skip (it.skipIf/describe.skipIf) with the title in the same call`
            ).toBeTruthy();
            expect(
                /import\s*\{[^}]*\bisQuarantined\b[^}]*\}\s*from/.test(text),
                `${entry.file} uses isQuarantined() but does not import it`
            ).toBe(true);
            const title = match![1];
            expect(
                title.includes(entry.id),
                `id '${entry.id}' must be a substring of the test title '${title}' in ${entry.file} ` +
                    `(the weekly re-check runs vitest -t <id>)`
            ).toBe(true);
        }
    });
});
