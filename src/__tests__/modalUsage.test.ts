import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
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
 * Remaining hand-rolled dialogs, by batch. Delete entries as each batch migrates; never add one.
 * Batch 1 (done): pages/StudentsPage.tsx — six dialogs.
 */
const PENDING_MIGRATION = new Set([
    // Batch 2 — lists and the dashboard.
    'pages/RubricList.tsx', // differentiate + delete
    'pages/ActivityDashboardPage.tsx', // assign grading task
    // Batch 3 — builders.
    'pages/RubricBuilder.tsx', // preview, standards picker, sync dialog
    'components/Tests/QuestionEditor.tsx', // standards picker
]);

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
            return entry === '__tests__' || entry === 'node_modules' ? [] : sourceFiles(path);
        }
        return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
    });
}

function offenders(): string[] {
    return sourceFiles(srcRoot)
        .map((path) => ({ source: readFileSync(path, 'utf8'), rel: relative(srcRoot, path) }))
        .filter(({ source, rel }) => {
            if (PRIMITIVES.has(rel) || PENDING_MIGRATION.has(rel)) return false;
            const rawOverlay = /className="modal-overlay"/.test(source);
            const rawDialogRole = /role="dialog"|aria-modal=/.test(source);
            return rawOverlay || rawDialogRole;
        })
        .map(({ rel }) => rel);
}

describe('modal usage', () => {
    it('does not hand-roll a dialog outside the two Radix primitives', () => {
        expect(offenders()).toEqual([]);
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
