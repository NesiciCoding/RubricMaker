import { describe, expect, it } from 'vitest';
import { DEFAULT_FORMAT } from '../types';
import type { Rubric, Student, StudentRubric } from '../types';
import { buildRubricHTML } from './pdfExport';

function fixtures() {
    const rubric = {
        id: 'r1',
        name: 'Essay',
        subject: 'English',
        description: '',
        criteria: [
            {
                id: 'c1',
                title: 'Writing',
                description: '',
                weight: 50,
                levels: [{ id: 'l1', label: 'Meets', minPoints: 2, maxPoints: 2, description: 'Solid', subItems: [] }],
            },
        ],
        gradeScaleId: 'letter-10',
        format: { ...DEFAULT_FORMAT, criterionColWidth: 240, levelColWidth: 90 },
        attachmentIds: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        totalMaxPoints: 2,
        scoringMode: 'single-point',
    } as unknown as Rubric;
    const student = { id: 's1', name: 'Alice', classId: 'k1' } as Student;
    const sr = {
        id: 'sr1',
        rubricId: 'r1',
        studentId: 's1',
        entries: [{ criterionId: 'c1', singlePointOutcome: 'meets', comment: '', checkedSubItems: [] }],
        overallComment: '',
        gradedAt: '2026-01-02T00:00:00.000Z',
    } as unknown as StudentRubric;
    return { rubric, student, sr };
}

describe('single-point rubric grid column widths (#960)', () => {
    it('uses the rubric format criterionColWidth/levelColWidth instead of a fixed 30/40/30 split', () => {
        const { rubric, student, sr } = fixtures();
        const html = buildRubricHTML(sr, rubric, student, null);

        expect(html).not.toContain('width:30%');
        expect(html).not.toContain('width:40%');
        expect(html).toContain('min-width:240px');
        expect(html).toContain('min-width:90px');
    });

    it('maps each width to its own column rather than letting either value appear anywhere in the grid', () => {
        // Guards against a criterionColWidth/levelColWidth swap: the not-yet/exceeds columns must
        // get levelColWidth and only the center (criterion) column gets criterionColWidth, in both
        // the header row and the one criterion row below it.
        const { rubric, student, sr } = fixtures();
        const html = buildRubricHTML(sr, rubric, student, null);
        const widths = Array.from(html.matchAll(/min-width:(\d+)px/g)).map((m) => Number(m[1]));

        expect(widths).toEqual([90, 240, 90, 90, 240, 90]);
    });
});
