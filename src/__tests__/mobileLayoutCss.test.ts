import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mediaBlocks } from '../test-utils/cssRules';

// jsdom has no layout engine, so the phone-width rules are pinned at the stylesheet level (#652, #663).
const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

describe('phone-width layout rules', () => {
    const phone = mediaBlocks(css, 'max-width: 640px').join('\n');

    it('wraps topbar page actions onto their own row instead of scrolling them out of view', () => {
        expect(phone).toMatch(/\.topbar \{[^}]*flex-wrap: wrap/);
        expect(phone).toMatch(/\.topbar-actions \{[^}]*flex-wrap: wrap[^}]*overflow-x: visible/);
    });

    it('drops 4-column tiles to 2 and 2/3-column grids to 1', () => {
        expect(phone).toMatch(/\.grid-4 \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
        expect(phone).toMatch(/\.grid-2,\s*\.grid-3 \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    });

    it('reflows the rubric builder to one column with the criterion actions on their own row (#656)', () => {
        expect(phone).toMatch(/\.rubric-builder-layout \{[^}]*grid-template-columns: minmax\(0, 1fr\) !important/);
        expect(phone).toMatch(/\.criterion-meta-grid \{[^}]*grid-template-columns: minmax\(0, 1fr\) !important/);
        expect(phone).toMatch(/\.criterion-header \{[^}]*flex-wrap: wrap/);
    });

    it('keeps the grading footer to two rows with Save pinned to the end (#660)', () => {
        expect(css).toMatch(/\.grade-footer-actions \{[^}]*flex-shrink: 0;[^}]*margin-inline-start: auto/);
        expect(phone).toMatch(/\.grade-footer-options \{[^}]*display: none/);
        expect(phone).toMatch(/\.grade-footer-options\.open \{[^}]*display: flex/);
        expect(phone).toMatch(/\.grade-footer-options-toggle \{[^}]*display: inline-flex/);
    });

    it('truncates a long next-student name so Save stays on screen (#660)', () => {
        expect(css).toMatch(
            /\.grade-footer-next-name \{[^}]*max-width: 12ch;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap/
        );
        expect(phone).toMatch(/\.grade-footer-next-name \{[^}]*max-width: 8ch/);
    });
});
