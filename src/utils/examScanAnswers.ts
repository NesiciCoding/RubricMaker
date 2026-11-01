/**
 * Turns a scanned, perspective-corrected answer-sheet page into a draft TestAnswer per question:
 * multiple-choice/true-false/multiple-response bubbles by ink coverage (detectChoiceAnswer), and
 * short-answer/numeric/open text by per-region OCR. Matching/ordering/cloze/categorize/hot-text
 * sub-item answers and audio-response questions aren't auto-detected — a student writes a letter
 * per sub-item there too, but the sub-item geometry doesn't have per-line boxes yet (see
 * testExamContent.ts's AnswerBlockGeometry docs), so those come back as 'unscanned' for the
 * teacher to fill in by hand during review.
 *
 * An answer sheet can span several printed pages. `detectScannedAnswers()` reads one page using the
 * same `answerSheetPages()` layout the renderer printed, and `mergeScannedAnswers()` joins the
 * per-page results into one answer list per student.
 */

import type { RgbaImage, Test, TestQuestion } from '../types';
import { answerSheetPages, groupQuestionsBySection } from './testExamContent';
import { detectChoiceAnswer, cropAnswerBlock } from './examScanRegions';
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
    constructor(message = 'This answer sheet page could not be matched to the test layout.') {
        super(message);
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
 * Detects the answers printed on one page of a student's answer sheet. `pageNumber` is 1-based and
 * follows `answerSheetPages()`: only the blocks the renderer actually placed on that page are read,
 * so a multi-page sheet is scanned page by page rather than assumed to fit on one page. The layout
 * is the same for markerless and marker sheets, so no marker-mode argument is needed.
 */
export async function detectScannedAnswers(pageImage: RgbaImage, test: Test, pageNumber = 1): Promise<ScannedAnswer[]> {
    const page = answerSheetPages(test).find((p) => p.pageNumber === pageNumber);
    if (!page) throw new UnsupportedAnswerSheetError(`The answer sheet has no page ${pageNumber}.`);

    const questionsById = new Map(test.questions.map((q) => [q.id, q]));
    const userWords = examAnswerVocabulary(test);
    const results: ScannedAnswer[] = [];

    for (const block of page.blocks) {
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

/**
 * Joins the per-page results of one student's sheet into a single answer list in printed question
 * order. Page results are merged by question id (a question is printed on exactly one page); any
 * question missing from every page — e.g. a page the teacher removed from the batch — is kept as
 * 'unscanned' so review still shows it instead of silently dropping it.
 */
export function mergeScannedAnswers(test: Test, pageResults: ScannedAnswer[][]): ScannedAnswer[] {
    const byQuestion = new Map<string, ScannedAnswer>();
    for (const results of pageResults) {
        for (const result of results) {
            const existing = byQuestion.get(result.questionId);
            if (!existing) {
                byQuestion.set(result.questionId, result);
                continue;
            }
            // Prefer a real detection over a blank/unscanned placeholder from another page.
            if (existing.response.trim() === '' && result.response.trim() !== '') {
                byQuestion.set(result.questionId, result);
            }
        }
    }

    const ordered: ScannedAnswer[] = [];
    for (const group of groupQuestionsBySection(test)) {
        for (const { question, number } of group.questions) {
            ordered.push(
                byQuestion.get(question.id) ?? {
                    questionId: question.id,
                    number,
                    response: '',
                    source: 'unscanned',
                }
            );
        }
    }
    return ordered;
}
