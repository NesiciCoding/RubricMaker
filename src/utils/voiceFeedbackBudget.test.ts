import { describe, it, expect } from 'vitest';
import { AUDIO_CHARS_PER_SECOND, voiceRecordingBudgetSeconds } from './voiceFeedbackBudget';

describe('voiceRecordingBudgetSeconds', () => {
    it('keeps 20% headroom and converts free characters to seconds of audio', () => {
        expect(voiceRecordingBudgetSeconds(0, AUDIO_CHARS_PER_SECOND * 100)).toBe(80);
    });

    it('is zero when storage is full or over', () => {
        expect(voiceRecordingBudgetSeconds(5_000_000, 5_000_000)).toBe(0);
        expect(voiceRecordingBudgetSeconds(6_000_000, 5_000_000)).toBe(0);
    });
});
