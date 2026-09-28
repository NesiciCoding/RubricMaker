/**
 * Turns a scanned, perspective-corrected answer-sheet page into a draft TestAnswer per question:
 * multiple-choice/true-false/multiple-response bubbles by ink coverage (detectChoiceAnswer), and
 * short-answer/numeric/open text by per-region OCR. Matching/ordering/cloze/categorize/hot-text
 * sub-item answers and audio-response questions aren't auto-detected — a student writes a letter
 * per sub-item there too, but the sub-item geometry doesn't have per-line boxes yet (see
 * testExamContent.ts's AnswerBlockGeometry docs), so those come back as 'unscanned' for the
 * teacher to fill in by hand during review.
 */

import type { RgbaImage, Test, TestQuestion } from '../types';
import { answerSheetGeometry } from './testExamContent';
import { detectChoiceAnswer, cropAnswerBlock, answerSheetFitsOnOnePage } from './examScanRegions';
import { recognizeImage } from './textExtraction';
import { examAnswerVocabulary } from './examScanVocabulary';
import { rgbaImageToDataUrl } from './rgbaImageCanvas';

export type ScannedAnswerSource = 'bubble' | 'ocr' | 'unscanned';

export interface ScannedAnswer {
    questionId: string;
    number: number;
    /** TestAnswer.response value, ready to save as-is (or after teacher review/correction). */
    response: string;
    source: ScannedAnswerSource;
    /** OCR mean word confidence in [0,1]; only set for 'ocr'. */
    confidence?: number;
}

export class UnsupportedAnswerSheetError extends Error {
    constructor() {
        super('Multi-page answer sheets are not supported for automatic scanning yet.');
        this.name = 'UnsupportedAnswerSheetError';
    }
}

/** Converts detected bubble letters into the TestAnswer.response encoding autoScoreResponse expects for the question's type. */
export function choiceLettersToResponse(question: TestQuestion, letters: string[], optionLetters: string[]): string {
    if (question.type === 'true-false') {
        return letters[0] === undefined ? '' : String(letters[0] === 'A');
    }
    if (question.type === 'multiple-response') {
        const ids = letters
            .map((letter) => question.options?.[optionLetters.indexOf(letter)]?.id)
            .filter((id): id is string => !!id);
        return JSON.stringify(ids);
    }
    // multiple-choice (single-select)
    return question.options?.[optionLetters.indexOf(letters[0])]?.id ?? '';
}

/**
 * Detects every question's answer from a scanned page. Throws UnsupportedAnswerSheetError when
 * the sheet's estimated geometry doesn't fit on one page, since region positions would no longer
 * correspond to this single scanned image.
 */
export async function detectScannedAnswers(pageImage: RgbaImage, test: Test): Promise<ScannedAnswer[]> {
    const blocks = answerSheetGeometry(test);
    if (!answerSheetFitsOnOnePage(blocks)) throw new UnsupportedAnswerSheetError();

    const questionsById = new Map(test.questions.map((q) => [q.id, q]));
    const userWords = examAnswerVocabulary(test);
    const results: ScannedAnswer[] = [];

    for (const block of blocks) {
        const question = questionsById.get(block.questionId);
        if (!question) continue;

        if (block.space.kind === 'choice') {
            const letters = detectChoiceAnswer(pageImage, block);
            results.push({
                questionId: block.questionId,
                number: block.number,
                response: choiceLettersToResponse(question, letters, block.space.optionLetters ?? []),
                source: 'bubble',
            });
            continue;
        }

        if (block.space.kind === 'short' || block.space.kind === 'numeric' || block.space.kind === 'long') {
            const region = cropAnswerBlock(pageImage, block);
            const dataUrl = rgbaImageToDataUrl(region);
            const ocr = await recognizeImage(dataUrl, { captureHint: 'sparse', userWords });
            results.push({
                questionId: block.questionId,
                number: block.number,
                response: ocr.text.trim(),
                source: 'ocr',
                confidence: ocr.confidence,
            });
            continue;
        }

        results.push({ questionId: block.questionId, number: block.number, response: '', source: 'unscanned' });
    }

    return results;
}
