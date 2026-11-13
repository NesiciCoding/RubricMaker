import { describe, expect, it } from 'vitest';
import {
    isCompleteJoinCode,
    LIVE_WRITING_CEFR_MIN_WORDS,
    liveWritingCefrEstimate,
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
