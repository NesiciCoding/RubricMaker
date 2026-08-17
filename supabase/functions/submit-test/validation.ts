// Shared pure validation helpers for submit-test.
//
// Kept in their own pure module (no Deno imports) so the guards below are
// unit-testable from the app's vitest suite — see
// src/__tests__/submitTestValidation.test.ts. The edge function imports it
// with the explicit `.ts` extension (Deno convention); the vitest test imports
// it extensionless.

export interface MinimalAnswer {
    questionId: string;
    response: string;
}

/**
 * Rebuild answer objects as { questionId, response } only.
 *
 * Client input can carry arbitrary extra fields — most importantly
 * pointsEarned, which scoreAnswer() on the teacher-facing side
 * (src/utils/testCalc.ts) treats as an already-graded manual score and uses
 * verbatim instead of auto-scoring. Reconstructing the answers here (rather
 * than trusting the spread) means a forged pointsEarned can never reach
 * storage in the first place.
 */
export function sanitizeAnswers(answers: MinimalAnswer[]): MinimalAnswer[] {
    return answers.map((a) => ({ questionId: a.questionId, response: a.response }));
}

/** Deadline guard — expired assignments (or rows with no deadline) reject/allow accordingly. */
export function isAssignmentExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
    return !!expiresAt && new Date(expiresAt) < now;
}

/**
 * Attempt policy by assignment mode: practice-mode assignments allow retakes
 * (up to 5 attempts, retried on 23505 conflicts), assessment-mode (or legacy
 * rows with no mode) always allow exactly one — preserving the original
 * one-submission-per-assignment guard.
 */
export function attemptPolicyFor(mode: string | null | undefined): { isPractice: boolean; maxAttempts: number } {
    const isPractice = mode === 'practice';
    return { isPractice, maxAttempts: isPractice ? 5 : 1 };
}
