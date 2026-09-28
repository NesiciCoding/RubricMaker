/**
 * Domain vocabulary for seeding an OCR `user_words` dictionary (see ocrConfig.ts, wired through
 * textExtraction.ts's recognizeImage) when scanning handwritten answers to a specific Test —
 * mirrors GradeStudent.tsx's rubric-vocabulary seeding, but for the exam-scan case. Only
 * short-answer questions have a single, exactly-graded model answer the student is expected to
 * write out; other types are graded from pre-printed letters/options (multiple-choice, matching,
 * ordering, true-false) or open text with no fixed answer to seed against.
 */

import type { Test } from '../types';

/** Model answer words for every short-answer question in a test, for OCR dictionary seeding. */
export function examAnswerVocabulary(test: Test): string[] {
    const words: string[] = [];
    for (const question of test.questions) {
        if (question.type !== 'short-answer') continue;
        const answers = question.expectedAnswers ?? (question.expectedAnswer ? [question.expectedAnswer] : []);
        for (const answer of answers) words.push(...answer.split(/\s+/).filter(Boolean));
    }
    return words;
}
