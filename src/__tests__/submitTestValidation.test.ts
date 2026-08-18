import { describe, expect, it } from 'vitest';
import {
    sanitizeAnswers,
    isAssignmentExpired,
    attemptPolicyFor,
} from '../../supabase/functions/submit-test/validation';

describe('submit-test sanitizeAnswers', () => {
    it('strips forged fields like pointsEarned so they never reach storage', () => {
        const input = [
            { questionId: 'q1', response: 'Paris', pointsEarned: 999 },
            { questionId: 'q2', response: '4', extra: { whatever: true } },
        ];
        expect(sanitizeAnswers(input)).toEqual([
            { questionId: 'q1', response: 'Paris' },
            { questionId: 'q2', response: '4' },
        ]);
    });

    it('preserves questionId/response and order', () => {
        const input = [
            { questionId: 'b', response: '2' },
            { questionId: 'a', response: '1' },
        ];
        expect(sanitizeAnswers(input)).toEqual(input);
    });
});

describe('submit-test isAssignmentExpired', () => {
    const now = new Date('2026-08-17T12:00:00Z');

    it('rejects when the deadline is in the past', () => {
        expect(isAssignmentExpired('2026-08-17T11:59:59Z', now)).toBe(true);
    });

    it('allows when the deadline is in the future', () => {
        expect(isAssignmentExpired('2026-08-17T12:00:01Z', now)).toBe(false);
    });

    it('rejects a submission at the exact expiration instant', () => {
        expect(isAssignmentExpired('2026-08-17T12:00:00Z', now)).toBe(true);
    });

    it('allows rows with no deadline', () => {
        expect(isAssignmentExpired(null, now)).toBe(false);
        expect(isAssignmentExpired(undefined, now)).toBe(false);
    });
});

describe('submit-test attemptPolicyFor', () => {
    it('practice mode allows up to 5 attempts (retakes)', () => {
        expect(attemptPolicyFor('practice')).toEqual({ isPractice: true, maxAttempts: 5 });
    });

    it('assessment mode allows exactly one attempt', () => {
        expect(attemptPolicyFor('assessment')).toEqual({ isPractice: false, maxAttempts: 1 });
    });

    it('legacy rows with no mode keep the one-attempt guard', () => {
        expect(attemptPolicyFor(undefined)).toEqual({ isPractice: false, maxAttempts: 1 });
        expect(attemptPolicyFor(null)).toEqual({ isPractice: false, maxAttempts: 1 });
    });
});
