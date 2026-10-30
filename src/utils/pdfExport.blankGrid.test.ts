import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initTestI18n } from '../test-utils/initI18n';
import { makeTotalPointsRubric } from '../test-utils/totalPointsRubric';
import { exportRubricGridPdf } from './pdfExport';

/**
 * "Print rubric" in the editor used to call `window.print()` on the builder, so the dialog showed
 * one viewport of the app rather than the rubric (#1004). It now prints this blank-rubric document,
 * which means the document has to carry the whole sheet — every criterion, every level — for the
 * paper to be usable.
 */
beforeAll(async () => {
    await initTestI18n();
});

afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
});

describe('printed blank rubric', () => {
    const rubric = makeTotalPointsRubric({ name: 'Presentatie rubric' });

    it('prints every criterion and level of the rubric, not just what was on screen', () => {
        vi.useFakeTimers();
        void exportRubricGridPdf(rubric);
        const doc = document.querySelector('iframe')!.contentDocument!;
        const html = doc.documentElement.innerHTML;

        expect(html).toContain('Presentatie rubric');
        for (const criterion of rubric.criteria) {
            expect(html, criterion.title).toContain(criterion.title);
            for (const level of criterion.levels) {
                expect(html, `${criterion.title} / ${level.label}`).toContain(level.label);
            }
        }
    });

    it('stays A4 portrait for a grid rubric', () => {
        vi.useFakeTimers();
        void exportRubricGridPdf(rubric);
        const html = document.querySelector('iframe')!.contentDocument!.documentElement.innerHTML;
        expect(html).toContain('size: portrait');
        expect(html).not.toContain('size: landscape');
    });

    it('uses the rubric’s own orientation when the format asks for landscape', () => {
        vi.useFakeTimers();
        void exportRubricGridPdf(makeTotalPointsRubric({ format: { ...rubric.format, orientation: 'landscape' } }));
        const html = document.querySelector('iframe')!.contentDocument!.documentElement.innerHTML;
        expect(html).toContain('size: landscape');
    });
});
