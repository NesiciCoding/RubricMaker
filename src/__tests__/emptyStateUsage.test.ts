import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Empty states have one owner (#1011).
 *
 * `src/components/ui/EmptyState.tsx` is the only place allowed to write the `empty-state` shell class.
 * Before this guard there were ~60 hand-rolled copies that drifted on icon size, heading level,
 * description style and CTA placement; the next one should fail here instead of landing.
 */
const SRC = resolve(__dirname, '..');
const PRIMITIVE = join(SRC, 'components/ui/EmptyState.tsx');

/**
 * Any JSX `className` value that names the shell class, however it is spelled: `"empty-state"`,
 * `"empty-state compact"`, `{'empty-state'}`, `` `empty-state ${extra}` ``, or a conditional
 * expression that mentions it. A literal `className="empty-state"` check let the decorated and
 * expression forms through, which is exactly how a copy is adjusted rather than copied verbatim.
 */
const CLASS_NAME_ATTR = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;

/** `empty-state` as a whole class token: `empty-state-row` is a different class, not the shell. */
const SHELL_TOKEN = /(^|[^a-z0-9-])empty-state([^a-z0-9-]|$)/i;

function handRollsShell(source: string): boolean {
    return [...source.matchAll(CLASS_NAME_ATTR)].some((match) =>
        SHELL_TOKEN.test(match[1] ?? match[2] ?? match[3] ?? '')
    );
}

function tsxFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === '__tests__' ? [] : tsxFiles(path);
        return entry.name.endsWith('.tsx') ? [path] : [];
    });
}

describe('empty-state usage', () => {
    const offenders = tsxFiles(SRC).filter((file) => file !== PRIMITIVE && handRollsShell(readFileSync(file, 'utf8')));

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

    it('recognises the shell however the class is written', () => {
        expect(handRollsShell('<div className="empty-state">')).toBe(true);
        expect(handRollsShell('<div className="empty-state compact">')).toBe(true);
        expect(handRollsShell("<div className={'empty-state'}>")).toBe(true);
        expect(handRollsShell('<div className={`empty-state ${extra}`}>')).toBe(true);
        expect(handRollsShell('<div className={empty ? "empty-state" : "card"}>')).toBe(true);
    });

    it('ignores the component, unrelated classes and other empty-state tokens', () => {
        expect(handRollsShell('<EmptyState description="Nothing yet" />')).toBe(false);
        expect(handRollsShell('<div className="card no-print">')).toBe(false);
        expect(handRollsShell('<div className="empty-state-row">')).toBe(false);
        expect(handRollsShell('// the empty-state block, documented in prose')).toBe(false);
    });
});

describe('empty-state styling', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8');

    it('dims only the shell icon, so the CTA keeps its own button colour', () => {
        expect(css).toMatch(/\.empty-state > svg \{[^}]*color: var\(--text-dim\)/);
        // A descendant selector also colours the glyph inside `.btn-primary`, which muted the "New …"
        // action on every list that passes `action.icon`.
        expect(css).not.toMatch(/\.empty-state(?!\s*>)[^{]*\ssvg\s*\{/);
    });
});
