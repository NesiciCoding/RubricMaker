import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_FORMAT } from '../types';
import type { Rubric, Student, StudentRubric } from '../types';

const yieldSpy = vi.fn().mockResolvedValue(undefined);
vi.mock('./yieldToMain', () => ({ yieldToMain: () => yieldSpy() }));
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

function fixtures() {
    const level = { id: 'l1', label: 'Good', minPoints: 3, maxPoints: 3, description: 'Solid', subItems: [] };
    const rubric = {
        id: 'r1',
        name: 'Essay',
        subject: 'English',
        description: '',
        criteria: [{ id: 'c1', title: 'Writing', description: '', weight: 100, levels: [level] }],
        gradeScaleId: 'letter-10',
        format: DEFAULT_FORMAT,
        attachmentIds: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        totalMaxPoints: 3,
        scoringMode: 'weighted-percentage',
    } as unknown as Rubric;

    function entry(i: number) {
        const student = { id: `s${i}`, name: `Student ${i}`, classId: 'k1' } as Student;
        const sr = {
            id: `sr${i}`,
            rubricId: 'r1',
            studentId: `s${i}`,
            entries: [{ criterionId: 'c1', levelId: 'l1', comment: '', checkedSubItems: [] }],
            overallComment: '',
            isPeerReview: false,
        } as unknown as StudentRubric;
        return { sr, student };
    }

    return { rubric, entries: Array.from({ length: 25 }, (_, i) => entry(i)) };
}

describe('batch export main-thread yielding (docs/PERFORMANCE_AUDIT_2026-11.md #1108)', () => {
    it('exportBatchDocx yields to the main thread periodically for a large batch', async () => {
        const { exportBatchDocx } = await import('./docxExport');
        const { rubric, entries } = fixtures();

        await exportBatchDocx(entries, rubric, null);

        // 25 entries, yielding every 10 starting at idx 10: idx 10 and 20 → 2 yields.
        expect(yieldSpy).toHaveBeenCalledTimes(2);
    });

    it('exportBatchDocx does not yield at all for a small batch', async () => {
        const { exportBatchDocx } = await import('./docxExport');
        const { rubric, entries } = fixtures();
        yieldSpy.mockClear();

        await exportBatchDocx(entries.slice(0, 3), rubric, null);

        expect(yieldSpy).not.toHaveBeenCalled();
    });

    it('exportBatchPdf yields to the main thread periodically for a large batch', async () => {
        vi.useFakeTimers();
        const { exportBatchPdf } = await import('./pdfExport');
        const { rubric, entries } = fixtures();
        yieldSpy.mockClear();

        const promise = exportBatchPdf(entries, rubric, null);
        // The batch HTML-building loop now yields (awaits) partway through, so the iframe isn't
        // created synchronously anymore — flush pending microtasks/timers before looking for it.
        await vi.advanceTimersByTimeAsync(0);
        const win = document.querySelector('iframe')!.contentWindow! as Window;
        win.print = vi.fn();
        await vi.advanceTimersByTimeAsync(5_000);
        win.dispatchEvent(new Event('afterprint'));
        await promise;

        // 25 entries, yielding every 10 starting at idx 10: idx 10 and 20 → 2 yields.
        expect(yieldSpy).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });
});
