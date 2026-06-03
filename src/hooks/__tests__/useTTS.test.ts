import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { htmlToPlainText, useTTS } from '../useTTS';

// ── htmlToPlainText ────────────────────────────────────────────────────────────

describe('htmlToPlainText', () => {
    it('strips tags and returns plain text', () => {
        expect(htmlToPlainText('<p>Hello world</p>')).toBe('Hello world');
    });

    it('decodes HTML entities', () => {
        expect(htmlToPlainText('<p>Fish &amp; chips</p>')).toBe('Fish & chips');
    });

    it('inserts spaces between block elements', () => {
        const result = htmlToPlainText('<p>First</p><p>Second</p>');
        expect(result).toContain('First');
        expect(result).toContain('Second');
    });

    it('handles list items with spaces', () => {
        const result = htmlToPlainText('<ul><li>One</li><li>Two</li></ul>');
        expect(result).toMatch(/One.*Two/);
    });

    it('handles empty input', () => {
        expect(htmlToPlainText('')).toBe('');
    });

    it('collapses multiple whitespace to single spaces', () => {
        expect(htmlToPlainText('<p>  hello   world  </p>')).toBe('hello world');
    });
});

// ── useTTS ────────────────────────────────────────────────────────────────────

describe('useTTS', () => {
    let mockSpeechSynthesis: {
        speak: ReturnType<typeof vi.fn>;
        cancel: ReturnType<typeof vi.fn>;
        pause: ReturnType<typeof vi.fn>;
        resume: ReturnType<typeof vi.fn>;
        getVoices: ReturnType<typeof vi.fn>;
        addEventListener: ReturnType<typeof vi.fn>;
        removeEventListener: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        mockSpeechSynthesis = {
            speak: vi.fn(),
            cancel: vi.fn(),
            pause: vi.fn(),
            resume: vi.fn(),
            getVoices: vi.fn(() => []),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        };
        vi.stubGlobal('speechSynthesis', mockSpeechSynthesis);
        vi.stubGlobal(
            'SpeechSynthesisUtterance',
            class {
                lang = '';
                voice: SpeechSynthesisVoice | null = null;
                rate = 1;
                pitch = 1;
                onstart: (() => void) | null = null;
                onend: (() => void) | null = null;
                onerror: (() => void) | null = null;
                onboundary: ((e: { charIndex: number }) => void) | null = null;
                constructor(public text: string) {}
            }
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('starts with idle status when speechSynthesis is available', () => {
        const { result } = renderHook(() => useTTS({ lang: 'en' }));
        expect(result.current.status).toBe('idle');
    });

    it('returns unsupported status when speechSynthesis is unavailable', () => {
        vi.stubGlobal('speechSynthesis', undefined);
        const { result } = renderHook(() => useTTS({ lang: 'en' }));
        expect(result.current.status).toBe('unsupported');
    });

    it('calls speechSynthesis.speak when speak() is called', () => {
        const { result } = renderHook(() => useTTS({ lang: 'en' }));
        act(() => {
            result.current.speak('Hello world');
        });
        expect(mockSpeechSynthesis.speak).toHaveBeenCalledOnce();
    });

    it('calls speechSynthesis.cancel on stop()', () => {
        const { result } = renderHook(() => useTTS({ lang: 'en' }));
        act(() => {
            result.current.speak('Test text');
        });
        act(() => {
            result.current.stop();
        });
        expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
        expect(result.current.status).toBe('idle');
    });

    it('calls speechSynthesis.pause on pause()', () => {
        const { result } = renderHook(() => useTTS({ lang: 'en' }));
        act(() => {
            result.current.pause();
        });
        expect(mockSpeechSynthesis.pause).toHaveBeenCalled();
        expect(result.current.status).toBe('paused');
    });

    it('calls speechSynthesis.resume on resume()', () => {
        const { result } = renderHook(() => useTTS({ lang: 'en' }));
        act(() => {
            result.current.resume();
        });
        expect(mockSpeechSynthesis.resume).toHaveBeenCalled();
        expect(result.current.status).toBe('speaking');
    });

    it('cancels speech on unmount', () => {
        const { unmount } = renderHook(() => useTTS({ lang: 'en' }));
        unmount();
        expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    });

    it('selects matching voice for language', () => {
        const enVoice = { lang: 'en-US', name: 'Google US English' } as SpeechSynthesisVoice;
        const nlVoice = { lang: 'nl-NL', name: 'Dutch' } as SpeechSynthesisVoice;
        mockSpeechSynthesis.getVoices.mockReturnValue([enVoice, nlVoice]);

        const { result } = renderHook(() => useTTS({ lang: 'nl' }));
        act(() => {
            result.current.speak('Hallo wereld');
        });

        const utterance = (mockSpeechSynthesis.speak.mock.calls[0] as unknown[])[0] as {
            voice: SpeechSynthesisVoice;
        };
        expect(utterance.voice).toBe(nlVoice);
    });

    it('falls back to first available voice when no match', () => {
        const onlyVoice = { lang: 'ja-JP', name: 'Japanese' } as SpeechSynthesisVoice;
        mockSpeechSynthesis.getVoices.mockReturnValue([onlyVoice]);

        const { result } = renderHook(() => useTTS({ lang: 'en' }));
        act(() => {
            result.current.speak('Hello');
        });

        const utterance = (mockSpeechSynthesis.speak.mock.calls[0] as unknown[])[0] as {
            voice: SpeechSynthesisVoice;
        };
        expect(utterance.voice).toBe(onlyVoice);
    });
});
