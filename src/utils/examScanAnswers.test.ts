import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RgbaImage, Test, TestQuestion } from '../types';
import { EXAM_PAGE_MM, answerSheetGeometry, answerSheetPages } from './testExamContent';
import { choiceCellRects } from './examScanRegions';

const { recognizeImage } = vi.hoisted(() => ({ recognizeImage: vi.fn() }));
vi.mock('./textExtraction', () => ({ recognizeImage }));

const { rgbaImageToDataUrl } = vi.hoisted(() => ({ rgbaImageToDataUrl: vi.fn(() => 'data:image/png;base64,region') }));
vi.mock('./rgbaImageCanvas', () => ({ rgbaImageToDataUrl }));

import {
    choiceLettersToResponse,
    detectScannedAnswers,
    mergeScannedAnswers,
    UnsupportedAnswerSheetError,
} from './examScanAnswers';

function q(overrides: Partial<TestQuestion> & Pick<TestQuestion, 'id' | 'type' | 'points' | 'prompt'>): TestQuestion {
    return { partialCredit: true, ...overrides };
}

function makeTest(overrides: Partial<Test> = {}): Test {
    return {
        id: 't1',
        name: 'Sample Test',
        questions: [],
        requireSEB: false,
        shuffleQuestions: false,
        createdAt: new Date().toISOString(),
        ...overrides,
    };
}

function solidImage(width: number, height: number, value: number): RgbaImage {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = data[i + 1] = data[i + 2] = value;
        data[i + 3] = 255;
    }
    return { data, width, height };
}

function paintBlack(img: RgbaImage, x: number, y: number, width: number, height: number): void {
    for (let py = y; py < y + height; py++) {
        for (let px = x; px < x + width; px++) {
            const i = (py * img.width + px) * 4;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
        }
    }
}

beforeEach(() => {
    recognizeImage.mockReset().mockResolvedValue({ text: '', confidence: 0, words: [] });
    rgbaImageToDataUrl.mockClear();
});

describe('choiceLettersToResponse', () => {
    it('maps true-false letters to the "true"/"false" string autoScoreResponse expects', () => {
        const question = q({ id: 'a', type: 'true-false', points: 1, prompt: 'P' });
        expect(choiceLettersToResponse(question, ['A'], ['A', 'B'])).toBe('true');
        expect(choiceLettersToResponse(question, ['B'], ['A', 'B'])).toBe('false');
        expect(choiceLettersToResponse(question, [], ['A', 'B'])).toBe('');
    });

    it('maps a single-select multiple-choice letter to the matching option id', () => {
        const question = q({
            id: 'a',
            type: 'multiple-choice',
            points: 1,
            prompt: 'P',
            options: [
                { id: 'o1', text: 'Paris', isCorrect: true },
                { id: 'o2', text: 'Berlin', isCorrect: false },
            ],
        });
        expect(choiceLettersToResponse(question, ['B'], ['A', 'B'])).toBe('o2');
        expect(choiceLettersToResponse(question, [], ['A', 'B'])).toBe('');
    });

    it('maps multiple-response letters to a JSON array of option ids', () => {
        const question = q({
            id: 'a',
            type: 'multiple-response',
            points: 1,
            prompt: 'P',
            options: [
                { id: 'o1', text: 'A', isCorrect: true },
                { id: 'o2', text: 'B', isCorrect: false },
                { id: 'o3', text: 'C', isCorrect: true },
            ],
        });
        expect(choiceLettersToResponse(question, ['A', 'C'], ['A', 'B', 'C'])).toBe(JSON.stringify(['o1', 'o3']));
    });
});

describe('detectScannedAnswers', () => {
    const PAGE_WIDTH = EXAM_PAGE_MM.width;
    const PAGE_HEIGHT = EXAM_PAGE_MM.height;

    it('detects a marked multiple-choice bubble as the matching option id', async () => {
        const test = makeTest({
            questions: [
                q({
                    id: 'q1',
                    type: 'multiple-choice',
                    points: 1,
                    prompt: 'Capital of France?',
                    options: [
                        { id: 'o1', text: 'Paris', isCorrect: true },
                        { id: 'o2', text: 'Berlin', isCorrect: false },
                    ],
                }),
            ],
        });
        const [block] = answerSheetGeometry(test);
        const page = solidImage(PAGE_WIDTH, PAGE_HEIGHT, 255);
        const [aCell] = choiceCellRects(block);
        paintBlack(page, aCell.rect.x, aCell.rect.y, aCell.rect.width, aCell.rect.height);

        const results = await detectScannedAnswers(page, test);
        expect(results).toEqual([{ questionId: 'q1', number: 1, response: 'o1', source: 'bubble' }]);
    });

    it('OCRs a short-answer region and seeds the dictionary from the test’s model answers', async () => {
        const test = makeTest({
            questions: [
                q({ id: 'q1', type: 'short-answer', points: 1, prompt: 'P', expectedAnswer: 'photosynthesis' }),
            ],
        });
        recognizeImage.mockResolvedValueOnce({ text: '  photosynthesis  ', confidence: 0.82, words: [] });
        const page = solidImage(PAGE_WIDTH, PAGE_HEIGHT, 255);

        const results = await detectScannedAnswers(page, test);

        expect(rgbaImageToDataUrl).toHaveBeenCalledTimes(1);
        expect(recognizeImage).toHaveBeenCalledWith('data:image/png;base64,region', {
            captureHint: 'sparse',
            userWords: ['photosynthesis'],
        });
        expect(results).toEqual([
            { questionId: 'q1', number: 1, response: 'photosynthesis', source: 'ocr', confidence: 0.82 },
        ]);
    });

    it('leaves multi-part sub-item questions as unscanned for manual review', async () => {
        const test = makeTest({
            questions: [
                q({
                    id: 'q1',
                    type: 'matching',
                    points: 2,
                    prompt: 'P',
                    matchingPairs: [
                        { id: 'p1', left: 'Dog', right: 'Woof' },
                        { id: 'p2', left: 'Cat', right: 'Meow' },
                    ],
                }),
            ],
        });
        const page = solidImage(PAGE_WIDTH, PAGE_HEIGHT, 255);
        const results = await detectScannedAnswers(page, test);
        expect(results).toEqual([{ questionId: 'q1', number: 1, response: '', source: 'unscanned' }]);
        expect(recognizeImage).not.toHaveBeenCalled();
    });

    it('reads only the blocks printed on the requested page of a multi-page sheet', async () => {
        const test = makeTest({
            questions: Array.from({ length: 5 }, (_, i) =>
                q({ id: `q${i}`, type: 'open', points: 1, prompt: 'Write an essay' })
            ),
        });
        const pages = answerSheetPages(test);
        expect(pages.length).toBeGreaterThan(1);
        expect(pages[1].blocks.map((b) => b.questionId)).toEqual(['q1']);

        recognizeImage.mockResolvedValueOnce({ text: 'page two answer', confidence: 0.7, words: [] });
        const results = await detectScannedAnswers(solidImage(PAGE_WIDTH, PAGE_HEIGHT, 255), test, 2);

        expect(results).toEqual([
            { questionId: 'q1', number: 2, response: 'page two answer', source: 'ocr', confidence: 0.7 },
        ]);
        expect(recognizeImage).toHaveBeenCalledTimes(1);
    });

    it('rejects a page number that the printed sheet does not have', async () => {
        const test = makeTest({
            questions: [
                q({
                    id: 'q1',
                    type: 'multiple-choice',
                    points: 1,
                    prompt: 'P',
                    options: [{ id: 'o1', text: 'A', isCorrect: true }],
                }),
            ],
        });
        await expect(detectScannedAnswers(solidImage(PAGE_WIDTH, PAGE_HEIGHT, 255), test, 2)).rejects.toBeInstanceOf(
            UnsupportedAnswerSheetError
        );
    });
});

describe('mergeScannedAnswers', () => {
    it('joins per-page results in printed question order', () => {
        const test = makeTest({
            questions: [
                q({
                    id: 'q1',
                    type: 'multiple-choice',
                    points: 1,
                    prompt: 'One',
                    options: [{ id: 'o1', text: 'A', isCorrect: true }],
                }),
                q({ id: 'q2', type: 'short-answer', points: 1, prompt: 'Two' }),
                q({ id: 'q3', type: 'true-false', points: 1, prompt: 'Three' }),
            ],
        });
        const merged = mergeScannedAnswers(test, [
            [{ questionId: 'q1', number: 1, response: 'o1', source: 'bubble' }],
            [
                { questionId: 'q2', number: 2, response: 'answer', source: 'ocr', confidence: 0.9 },
                { questionId: 'q3', number: 3, response: '', source: 'unscanned' },
            ],
        ]);

        expect(merged.map((a) => [a.questionId, a.response])).toEqual([
            ['q1', 'o1'],
            ['q2', 'answer'],
            ['q3', ''],
        ]);
    });

    it('keeps a question that no scanned page covered as unscanned', () => {
        const test = makeTest({
            questions: [
                q({ id: 'q1', type: 'true-false', points: 1, prompt: 'One' }),
                q({ id: 'q2', type: 'true-false', points: 1, prompt: 'Two' }),
            ],
        });
        const merged = mergeScannedAnswers(test, [
            [{ questionId: 'q1', number: 1, response: 'true', source: 'bubble' }],
        ]);
        expect(merged[1]).toEqual({ questionId: 'q2', number: 2, response: '', source: 'unscanned' });
    });
});
