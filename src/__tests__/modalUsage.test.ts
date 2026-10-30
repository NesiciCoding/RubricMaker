import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Dialogs have one owner: `components/ui/Modal.tsx` (Radix) and its sibling `ConfirmDialog.tsx`.
 *
 * Hand-rolled `role="dialog"` overlays repeatedly shipped without a focus trap, Escape-to-close or
 * focus restoration (#533), so this guard keeps the migration a ratchet: the files below still hold
 * raw overlays and are scheduled in batches, and no *new* one can land.
 */
const srcRoot = resolve(__dirname, '..');

/** The two Radix-backed primitives — they are where `.modal-overlay` is supposed to appear. */
const PRIMITIVES = new Set(['components/ui/Modal.tsx', 'components/ui/ConfirmDialog.tsx']);

/**
 * Remaining hand-rolled dialogs, by batch: file → the raw overlays it holds today. Delete entries
 * as each batch migrates and lower a count as its dialogs convert; never raise one. Exempting the
 * whole file would let a second hand-rolled dialog land beside the recorded one.
 * Batch 1 (done): pages/StudentsPage.tsx — six dialogs.
 */
const PENDING_MIGRATION = new Map([
    // Batch 2 — lists and the dashboard.
    ['pages/RubricList.tsx', 2], // differentiate + delete
    ['pages/ActivityDashboardPage.tsx', 1], // assign grading task
    // Batch 3 — builders.
    ['pages/RubricBuilder.tsx', 3], // preview, standards picker, sync dialog
    ['components/Tests/QuestionEditor.tsx', 1], // standards picker
]);

/** A raw overlay: the hand-rolled markup `ui/Modal` and `ui/ConfirmDialog` replaced. */
const RAW_DIALOG = /className="modal-overlay"|role="dialog"|aria-modal=/g;

function rawDialogs(source: string): number {
    return source.match(RAW_DIALOG)?.length ?? 0;
}

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
            return entry === '__tests__' || entry === 'node_modules' ? [] : sourceFiles(path);
        }
        return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
    });
}

/**
 * Paths are compared against allowlists written with `/`, so normalize `relative`'s output —
 * Windows joins with `\` and would otherwise flag the primitives themselves.
 */
function scanned(): { rel: string; dialogs: number }[] {
    return sourceFiles(srcRoot).map((path) => ({
        rel: relative(srcRoot, path).split(sep).join('/'),
        dialogs: rawDialogs(readFileSync(path, 'utf8')),
    }));
}

function offenders(): string[] {
    return scanned()
        .filter(({ rel, dialogs }) => !PRIMITIVES.has(rel) && !PENDING_MIGRATION.has(rel) && dialogs > 0)
        .map(({ rel }) => rel);
}

describe('modal usage', () => {
    it('does not hand-roll a dialog outside the two Radix primitives', () => {
        expect(offenders()).toEqual([]);
    });

    it('holds each pending file to the dialogs it already had', () => {
        // The allowlist is a ratchet, not an exemption: a fifth overlay added to a file that is
        // still pending fails here instead of slipping through a whole-file skip.
        const counts = new Map(scanned().map(({ rel, dialogs }) => [rel, dialogs]));
        for (const [rel, allowed] of PENDING_MIGRATION) {
            expect(counts.get(rel), rel).toBeLessThanOrEqual(allowed);
        }
    });

    it('keeps the students page on the shared primitive', () => {
        // Batch 1 (#533): six raw overlays became <Modal>, which is what gives them the focus
        // trap, Escape and focus restoration they never had.
        const page = readFileSync(resolve(srcRoot, 'pages/StudentsPage.tsx'), 'utf8');
        expect(page).not.toContain('className="modal-overlay"');
        const opened = page.match(/<Modal\b/g) ?? [];
        expect(opened.length).toBeGreaterThanOrEqual(7); // add-student + the six migrated dialogs
    });

    it('names the dialog with the heading ui/Modal points aria-labelledby at', () => {
        // A `<Modal titleId="x">` whose content has no `id="x"` leaves the dialog unnamed.
        const page = readFileSync(resolve(srcRoot, 'pages/StudentsPage.tsx'), 'utf8');
        const titleIds = [...page.matchAll(/<Modal[\s\S]*?titleId="([^"]+)"/g)].map(([, id]) => id);
        expect(titleIds.length).toBeGreaterThanOrEqual(7);
        for (const id of titleIds) {
            expect(page, id).toContain(`id="${id}"`);
        }
    });
});
