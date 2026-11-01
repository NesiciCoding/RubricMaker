import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Dialogs have one owner: `components/ui/Modal.tsx` (Radix) and its sibling `ConfirmDialog.tsx`.
 *
 * Hand-rolled `role="dialog"` overlays repeatedly shipped without a focus trap, Escape-to-close or
 * focus restoration (#533). The migration is complete — every page renders the shared primitive —
 * so this guard has no allowlist left: a raw overlay anywhere else fails the build.
 */
const srcRoot = resolve(__dirname, '..');

/** The two Radix-backed primitives — they are where `.modal-overlay` is supposed to appear. */
const PRIMITIVES = new Set(['components/ui/Modal.tsx', 'components/ui/ConfirmDialog.tsx']);

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
            return entry === '__tests__' || entry === 'node_modules' ? [] : sourceFiles(path);
        }
        return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
    });
}

function sourceText(rel: string): string {
    return readFileSync(resolve(srcRoot, rel), 'utf8');
}

/** The `titleId` of every `<Modal>`, reading each opening tag brace- and quote-aware so that a
 *  `=>` inside `onClose` does not end the tag early. */
function titleIds(source: string): string[] {
    const ids: string[] = [];
    for (let at = source.indexOf('<Modal'); at !== -1; at = source.indexOf('<Modal', at + 6)) {
        let depth = 0;
        let quote: string | null = null;
        let end = at + 6;
        for (; end < source.length; end += 1) {
            const ch = source[end];
            if (quote) {
                if (ch === quote) quote = null;
            } else if (ch === '"' || ch === "'") quote = ch;
            else if (ch === '{') depth += 1;
            else if (ch === '}') depth -= 1;
            else if (ch === '>' && depth === 0) break;
        }
        const id = /\btitleId="([^"]+)"/.exec(source.slice(at, end));
        if (id) ids.push(id[1]);
    }
    return ids;
}

/**
 * A raw overlay: the hand-rolled markup `ui/Modal` and `ui/ConfirmDialog` replaced. Matches the
 * attribute whether it is a plain string (`role="dialog"`) or an expression holding one
 * (`role={'dialog'}`, `className={open ? 'modal-overlay' : ''}`, a template literal).
 */
const ATTRIBUTE_VALUE = String.raw`(?:"[^"]*"|\{[^}]*\})`;
const RAW_OVERLAY = new RegExp(String.raw`className=${ATTRIBUTE_VALUE}`, 'g');
const RAW_ROLE = new RegExp(String.raw`\brole=(?:"dialog"|\{[^}]*['"\x60]dialog['"\x60][^}]*\})`);

function hasRawDialog(source: string): boolean {
    const overlay = (source.match(RAW_OVERLAY) ?? []).some((attr) =>
        /(^|[\s'"\x60{])modal-overlay($|[\s'"\x60}])/.test(attr)
    );
    return overlay || RAW_ROLE.test(source) || /\baria-modal=/.test(source);
}

/** `/`-separated, so the allowlist matches on Windows too, where `relative` joins with `\`. */
function relPath(path: string): string {
    return relative(srcRoot, path).split(sep).join('/');
}

function offenders(): string[] {
    return sourceFiles(srcRoot)
        .map((path) => ({ source: readFileSync(path, 'utf8'), rel: relPath(path) }))
        .filter(({ source, rel }) => !PRIMITIVES.has(rel) && hasRawDialog(source))
        .map(({ rel }) => rel);
}

describe('modal usage', () => {
    it('does not hand-roll a dialog outside the two Radix primitives', () => {
        expect(offenders()).toEqual([]);
    });

    it.each([
        ['<div className="modal-overlay">', true],
        ['<div className="modal-overlay compact">', true],
        ["<div className={open ? 'modal-overlay' : ''}>", true],
        ['<div className={`modal-overlay ${extra}`}>', true],
        ['<div role="dialog">', true],
        ["<div role={'dialog'}>", true],
        ['<div aria-modal="true">', true],
        ['<div className="modal-overlay-hint">', false],
        ["<div role={'alertdialog-ish'} className={'card'}>", false],
        ['<Modal titleId="x" onClose={close}>', false],
    ])('reads %s as a raw dialog: %s', (markup, expected) => {
        expect(hasRawDialog(markup)).toBe(expected);
    });

    it.each([
        // Batch 1 (#533): six raw overlays became <Modal>, which is what gives them the focus
        // trap, Escape and focus restoration they never had.
        ['pages/StudentsPage.tsx', 7], // add-student + the six migrated dialogs
        // Batch 2: differentiate + share on the rubric list, assign on the dashboard.
        ['pages/RubricList.tsx', 4],
        ['pages/ActivityDashboardPage.tsx', 1],
        // Batch 3: preview, standards picker and sync on the builder, standards on the question editor.
        ['pages/RubricBuilder.tsx', 5],
        ['components/Tests/QuestionEditor.tsx', 1],
    ])('keeps %s on the shared primitive', (rel, minimum) => {
        const page = sourceText(rel);
        expect(page).not.toContain('className="modal-overlay"');
        expect(page.match(/<Modal\b/g)?.length ?? 0).toBeGreaterThanOrEqual(minimum);
    });

    it('names every dialog with the heading ui/Modal points aria-labelledby at', () => {
        // A `<Modal titleId="x">` whose content has no `id="x"` leaves the dialog unnamed.
        const nameless: string[] = [];
        for (const { rel, source } of sourceFiles(srcRoot).map((path) => ({
            rel: relPath(path),
            source: readFileSync(path, 'utf8'),
        }))) {
            for (const id of titleIds(source)) {
                if (!source.includes(`id="${id}"`)) nameless.push(`${rel}: ${id}`);
            }
        }
        expect(nameless).toEqual([]);
    });
});
