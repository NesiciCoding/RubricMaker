import { describe, it, expect } from 'vitest';
import type { Test } from '../types';
import { buildAnswerSheetHtml } from './testExamExportHtml';
import { CHOICE_CELL_WIDTH_MM, CHOICE_CELL_GAP_MM, DEFAULT_EXAM_EXPORT_OPTIONS } from './testExamContent';

function makeTest(): Test {
    return {
        id: 't1',
        name: 'Quiz',
        requireSEB: false,
        shuffleQuestions: false,
        createdAt: new Date().toISOString(),
        questions: [
            {
                id: 'q1',
                type: 'multiple-choice',
                points: 1,
                prompt: 'Capital of France?',
                partialCredit: true,
                options: [
                    { id: 'o1', text: 'Paris', isCorrect: true },
                    { id: 'o2', text: 'Berlin', isCorrect: false },
                ],
            },
        ],
    };
}

describe('buildAnswerSheetHtml choice bubbles', () => {
    it('sizes and spaces MC bubbles from the same CHOICE_CELL_WIDTH_MM/CHOICE_CELL_GAP_MM constants examScanRegions.ts scans against', async () => {
        const html = await buildAnswerSheetHtml(makeTest(), DEFAULT_EXAM_EXPORT_OPTIONS);
        // box-sizing:border-box keeps the border inside the declared width, so the printed pitch
        // (width + gap) matches choiceCellRects()'s assumption exactly instead of growing by the
        // border thickness per cell.
        expect(html).toContain(
            `box-sizing:border-box;width:${CHOICE_CELL_WIDTH_MM}mm;height:${CHOICE_CELL_WIDTH_MM}mm`
        );
        expect(html).toContain(`gap:${CHOICE_CELL_GAP_MM}mm`);
        // Not the old hardcoded px sizing this used to diverge from the scanner geometry with.
        expect(html).not.toContain('width:20px');
        expect(html).not.toContain('gap:14px');
    });
});
