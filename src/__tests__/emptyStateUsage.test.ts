import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Empty states have one owner (#1011).
 *
 * `src/components/ui/EmptyState.tsx` is the only place allowed to write `className="empty-state"`.
 * Before this guard there were ~60 hand-rolled copies that drifted on icon size, heading level,
 * description style and CTA placement; the next one should fail here instead of landing.
 */
const SRC = resolve(__dirname, '..');
const PRIMITIVE = join(SRC, 'components/ui/EmptyState.tsx');

function tsxFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === '__tests__' ? [] : tsxFiles(path);
        return entry.name.endsWith('.tsx') ? [path] : [];
    });
}

describe('empty-state usage', () => {
    const offenders = tsxFiles(SRC).filter(
        (file) => file !== PRIMITIVE && /className="empty-state"/.test(readFileSync(file, 'utf8'))
    );

    it('does not hand-roll the shell anywhere outside the primitive', () => {
        expect(offenders.map((file) => file.slice(SRC.length + 1))).toEqual([]);
    });

    it('is what the lists actually render when they are empty', () => {
        // A primitive nobody imports is the state this issue started from: 34 hand-rolled copies
        // and a component with zero importers.
        for (const page of ['pages/RubricList.tsx', 'pages/TestListPage.tsx', 'pages/EssayListPage.tsx']) {
            expect(readFileSync(join(SRC, page), 'utf8'), page).toContain("from '../components/ui/EmptyState'");
        }
    });
});
