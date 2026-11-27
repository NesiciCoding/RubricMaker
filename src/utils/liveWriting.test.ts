import { describe, expect, it } from 'vitest';
import {
    isCompleteJoinCode,
    LIVE_WRITING_CEFR_MIN_WORDS,
    liveWritingCefrEstimate,
    liveWritingJoinErrorKey,
    liveWritingLookupErrorKey,
    liveWritingSelfRatingKey,
    normalizeJoinCode,
} from './liveWriting';

function words(count: number): string {
    return Array.from({ length: count }, (_, index) => `word${index + 1}`).join(' ');
}

describe('live writing join codes', () => {
    it('normalises shorthand, spacing and punctuation to RM-XXXXXX', () => {
        expect(normalizeJoinCode('abc123')).toBe('RM-ABC123');
        expect(normalizeJoinCode('rm abc-123')).toBe('RM-ABC123');
        expect(normalizeJoinCode('RM-ABC123')).toBe('RM-ABC123');
    });

    it('requires exactly six characters after the RM prefix', () => {
        expect(isCompleteJoinCode('RM-ABC123')).toBe(true);
        expect(isCompleteJoinCode('ABC123')).toBe(true);
        expect(isCompleteJoinCode('RM-ABC12')).toBe(false);
        expect(isCompleteJoinCode('RM-ABC1234')).toBe(false);
    });
});

describe('live writing join errors', () => {
    it('reads the marker from Errors and from Supabase PostgrestError objects', () => {
        expect(liveWritingJoinErrorKey(new Error('invalid_code'))).toBe('liveWriting.invalid_code');
        expect(liveWritingJoinErrorKey({ message: 'invalid_code', code: 'P0001' })).toBe('liveWriting.invalid_code');
        expect(liveWritingJoinErrorKey('too_many_attempts')).toBe('liveWriting.too_many_attempts');
    });

    it('falls back to the generic message for an unrecognised rejection', () => {
        expect(liveWritingJoinErrorKey(new Error('network down'))).toBe('liveWriting.join_failed');
        expect(liveWritingJoinErrorKey(undefined)).toBe('liveWriting.join_failed');
    });

    it('reads an unrecognised roster lookup as an inactive code', () => {
        expect(liveWritingLookupErrorKey(new Error('network down'))).toBe('liveWriting.invalid_code');
        expect(liveWritingLookupErrorKey(new Error('invalid_code'))).toBe('liveWriting.invalid_code');
        // A rate limit is not about the code itself, so it keeps its own message.
        expect(liveWritingLookupErrorKey(new Error('too_many_attempts'))).toBe('liveWriting.too_many_attempts');
    });
});

describe('live writing self-check labels', () => {
    it('maps each three-option rating to its translation key', () => {
        expect(liveWritingSelfRatingKey('happy')).toBe('liveWriting.student_selfcheck_happy');
        expect(liveWritingSelfRatingKey('neutral')).toBe('liveWriting.student_selfcheck_neutral');
        expect(liveWritingSelfRatingKey('unhappy')).toBe('liveWriting.student_selfcheck_unhappy');
    });
});

describe('live writing vocabulary estimate', () => {
    it('stays hidden below the 25-word threshold', () => {
        const below = words(LIVE_WRITING_CEFR_MIN_WORDS - 1);
        expect(liveWritingCefrEstimate(below)).toBeNull();
        expect(liveWritingCefrEstimate(`<p>${below}</p>`)).toBeNull();
    });

    it('returns a deterministic vocabulary level at the threshold', () => {
        const atThreshold = words(LIVE_WRITING_CEFR_MIN_WORDS);
        expect(liveWritingCefrEstimate(atThreshold)).toBe('A1');
        expect(liveWritingCefrEstimate(`<p>${atThreshold}</p>`)).toBe('A1');
    });
});
