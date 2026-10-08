import { describe, it, expect } from 'vitest';
import { AUDIO_CHARS_PER_SECOND, unsavedAudioChars, voiceRecordingBudgetSeconds } from './voiceFeedbackBudget';

describe('voiceRecordingBudgetSeconds', () => {
    it('keeps 20% headroom and converts free characters to seconds of audio', () => {
        expect(voiceRecordingBudgetSeconds(0, AUDIO_CHARS_PER_SECOND * 100)).toBe(80);
    });

    it('is zero when storage is full or over', () => {
        expect(voiceRecordingBudgetSeconds(5_000_000, 5_000_000)).toBe(0);
        expect(voiceRecordingBudgetSeconds(6_000_000, 5_000_000)).toBe(0);
    });
});

describe('unsavedAudioChars', () => {
    it('counts only recordings the stored copy does not contain', () => {
        const saved = [{ audioDataUrl: 'data:aa' }, {}];
        const current = [{ audioDataUrl: 'data:aa' }, { audioDataUrl: 'data:bbbb' }, {}];
        expect(unsavedAudioChars(current, saved)).toBe('data:bbbb'.length);
        expect(unsavedAudioChars(current)).toBe('data:aa'.length + 'data:bbbb'.length);
        expect(unsavedAudioChars([])).toBe(0);
    });
});
