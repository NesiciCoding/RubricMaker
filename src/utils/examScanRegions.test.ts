import { describe, it, expect } from 'vitest';
import type { RgbaImage } from '../types';
import { CHOICE_CELL_WIDTH_MM, type AnswerBlockGeometry } from './testExamContent';
import {
    CHOICE_CELL_GAP_MM,
    answerSheetFitsOnOnePage,
    choiceCellRects,
    mmRectToPixelRect,
    cropRegion,
    cropAnswerBlock,
    inkCoverage,
    detectChoiceAnswer,
} from './examScanRegions';

function solidImage(width: number, height: number, value: number): RgbaImage {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = data[i + 1] = data[i + 2] = value;
        data[i + 3] = 255;
    }
    return { data, width, height };
}

/** Paint a pixel rect black on an otherwise-white image, in place. */
function paintBlack(img: RgbaImage, x: number, y: number, width: number, height: number): void {
    for (let py = y; py < y + height; py++) {
        for (let px = x; px < x + width; px++) {
            const i = (py * img.width + px) * 4;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
        }
    }
}

function choiceBlock(overrides: Partial<AnswerBlockGeometry> = {}): AnswerBlockGeometry {
    return {
        questionId: 'q1',
        number: 1,
        space: { kind: 'choice', optionLetters: ['A', 'B'] },
        x: 10,
        y: 40,
        width: 190,
        height: 12,
        ...overrides,
    };
}

describe('answerSheetFitsOnOnePage', () => {
    it('is true for an empty geometry', () => {
        expect(answerSheetFitsOnOnePage([])).toBe(true);
    });

    it('is true when the last block ends before the bottom margin', () => {
        const blocks: AnswerBlockGeometry[] = [choiceBlock({ y: 40, height: 12 })];
        expect(answerSheetFitsOnOnePage(blocks)).toBe(true);
    });

    it('is false once the last block runs past the page', () => {
        const blocks: AnswerBlockGeometry[] = [choiceBlock({ y: 290, height: 20 })];
        expect(answerSheetFitsOnOnePage(blocks)).toBe(false);
    });
});

describe('choiceCellRects', () => {
    it('lays out one cell per option letter, left to right with a fixed gap', () => {
        const cells = choiceCellRects(choiceBlock());
        expect(cells.map((c) => c.letter)).toEqual(['A', 'B']);
        expect(cells[0].rect).toEqual({ x: 10, y: 40, width: CHOICE_CELL_WIDTH_MM, height: CHOICE_CELL_WIDTH_MM });
        expect(cells[1].rect.x).toBe(10 + CHOICE_CELL_WIDTH_MM + CHOICE_CELL_GAP_MM);
    });

    it('returns [] when the block has no option letters', () => {
        expect(choiceCellRects(choiceBlock({ space: { kind: 'short' } }))).toEqual([]);
    });
});

describe('mmRectToPixelRect', () => {
    it('scales mm coordinates onto the target pixel dimensions', () => {
        // EXAM_PAGE_MM is 210x297mm; a 420x594px image is exactly 2px/mm.
        const rect = mmRectToPixelRect({ x: 10, y: 20, width: 30, height: 40 }, 420, 594);
        expect(rect).toEqual({ x: 20, y: 40, width: 60, height: 80 });
    });
});

describe('cropRegion', () => {
    it('extracts the requested pixel rect', () => {
        const img = solidImage(4, 4, 255);
        paintBlack(img, 1, 1, 2, 2);
        const cropped = cropRegion(img, { x: 1, y: 1, width: 2, height: 2 });
        expect(cropped.width).toBe(2);
        expect(cropped.height).toBe(2);
        expect(Array.from(cropped.data.slice(0, 3))).toEqual([0, 0, 0]);
    });

    it('clamps a rect that runs past the image bounds', () => {
        const img = solidImage(4, 4, 255);
        const cropped = cropRegion(img, { x: 2, y: 2, width: 10, height: 10 });
        expect(cropped.width).toBe(2);
        expect(cropped.height).toBe(2);
    });
});

describe('cropAnswerBlock', () => {
    it('crops the block region out of a full-page image at a 1px/mm scale', () => {
        const page = solidImage(210, 297, 255);
        paintBlack(page, 10, 40, 5, 5);
        const block = choiceBlock({ x: 10, y: 40, width: 20, height: 20 });
        const cropped = cropAnswerBlock(page, block);
        expect(cropped.width).toBe(20);
        expect(cropped.height).toBe(20);
        expect(Array.from(cropped.data.slice(0, 3))).toEqual([0, 0, 0]);
    });
});

describe('inkCoverage', () => {
    it('is 0 for a blank white image', () => {
        expect(inkCoverage(solidImage(10, 10, 255))).toBe(0);
    });

    it('is 1 for a fully black image', () => {
        expect(inkCoverage(solidImage(10, 10, 0))).toBe(1);
    });

    it('reflects a partially-filled region', () => {
        const img = solidImage(10, 10, 255);
        paintBlack(img, 0, 0, 5, 10); // half the image
        expect(inkCoverage(img)).toBeCloseTo(0.5, 5);
    });

    it('is 0 for an empty (zero-area) image', () => {
        expect(inkCoverage({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toBe(0);
    });
});

describe('detectChoiceAnswer', () => {
    // 1px/mm page so mm geometry maps directly to pixel coordinates.
    const PAGE_WIDTH = 210;
    const PAGE_HEIGHT = 297;

    it('picks the single marked bubble for a single-select question', () => {
        const page = solidImage(PAGE_WIDTH, PAGE_HEIGHT, 255);
        const block = choiceBlock();
        const [, bCell] = choiceCellRects(block);
        paintBlack(page, bCell.rect.x, bCell.rect.y, bCell.rect.width, bCell.rect.height);
        expect(detectChoiceAnswer(page, block)).toEqual(['B']);
    });

    it('returns [] when no bubble is marked', () => {
        const page = solidImage(PAGE_WIDTH, PAGE_HEIGHT, 255);
        expect(detectChoiceAnswer(page, choiceBlock())).toEqual([]);
    });

    it('returns every marked bubble for a multi-select question', () => {
        const page = solidImage(PAGE_WIDTH, PAGE_HEIGHT, 255);
        const block = choiceBlock({ space: { kind: 'choice', optionLetters: ['A', 'B', 'C'], multiSelect: true } });
        const [aCell, , cCell] = choiceCellRects(block);
        paintBlack(page, aCell.rect.x, aCell.rect.y, aCell.rect.width, aCell.rect.height);
        paintBlack(page, cCell.rect.x, cCell.rect.y, cCell.rect.width, cCell.rect.height);
        expect(detectChoiceAnswer(page, block).sort()).toEqual(['A', 'C']);
    });

    it('returns [] for a block with no option letters', () => {
        const page = solidImage(PAGE_WIDTH, PAGE_HEIGHT, 255);
        expect(detectChoiceAnswer(page, choiceBlock({ space: { kind: 'short' } }))).toEqual([]);
    });
});
