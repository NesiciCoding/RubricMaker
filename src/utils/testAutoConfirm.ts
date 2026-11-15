import type { StudentTest, Test, TestAnswer, TestQuestion } from '../types';
import { autoGradeVerdict, type AutoGradeReason } from '../../supabase/functions/_shared/testScoring.ts';

export type AnswerReviewState =
    | { state: 'decided' }
    | { state: 'auto-confirmed'; score: number }
    | { state: 'needs-review'; reason: AutoGradeReason | 'auto-confirm-off'; score: number };

export function autoConfirmEnabled(test: Pick<Test, 'autoConfirmScores'>): boolean {
    return test.autoConfirmScores !== false;
}

/** Where one answer stands: saved by a teacher, auto-confirmed, or waiting for a human. */
export function answerReviewState(
    test: Pick<Test, 'autoConfirmScores'>,
    question: TestQuestion,
    answer: TestAnswer
): AnswerReviewState {
    if (answer.pointsEarned !== undefined) return { state: 'decided' };
    const verdict = autoGradeVerdict(question, answer.response);
    if (!autoConfirmEnabled(test)) {
        return { state: 'needs-review', reason: verdict.reason ?? 'auto-confirm-off', score: verdict.score };
    }
    if (verdict.confident) return { state: 'auto-confirmed', score: verdict.score };
    return { state: 'needs-review', reason: verdict.reason ?? 'manual-type', score: verdict.score };
}

/** True when a submission still has an answered question nobody has decided and auto-confirm did not cover. */
export function attemptNeedsReview(test: Pick<Test, 'questions' | 'autoConfirmScores'>, attempt: StudentTest): boolean {
    const questions = new Map(test.questions.map((q) => [q.id, q]));
    const latest = new Map<string, TestAnswer>();
    for (const answer of attempt.answers) latest.set(answer.questionId, answer);
    for (const [questionId, answer] of latest) {
        const question = questions.get(questionId);
        if (!question || answer.response.trim() === '') continue;
        if (answerReviewState(test, question, answer).state === 'needs-review') return true;
    }
    return false;
}
