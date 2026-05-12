import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStartListening = vi.fn();
const mockStopListening = vi.fn();
const mockUseSpeechRecognition = vi.fn();

vi.mock('react-speech-recognition', () => ({
    default: {
        startListening: (opts: any) => mockStartListening(opts),
        stopListening: () => mockStopListening(),
    },
    useSpeechRecognition: (opts: any) => mockUseSpeechRecognition(opts),
}));

vi.mock('regenerator-runtime/runtime', () => ({}));

import { useVoiceGrading } from './useVoiceGrading';

describe('useVoiceGrading', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseSpeechRecognition.mockReturnValue({
            transcript: '',
            listening: false,
            resetTranscript: vi.fn(),
            browserSupportsSpeechRecognition: true,
        });
    });

    it('returns initial state with isListening false', () => {
        const { result } = renderHook(() => useVoiceGrading(vi.fn(), vi.fn()));
        expect(result.current.isListening).toBe(false);
        expect(result.current.transcript).toBe('');
        expect(result.current.browserSupportsSpeechRecognition).toBe(true);
    });

    it('toggleListening starts listening when not listening', () => {
        const { result } = renderHook(() => useVoiceGrading(vi.fn(), vi.fn(), 'en-US'));
        act(() => { result.current.toggleListening(); });
        expect(mockStartListening).toHaveBeenCalledWith({ continuous: true, language: 'en-US' });
    });

    it('toggleListening stops listening when already listening', () => {
        mockUseSpeechRecognition.mockReturnValue({
            transcript: '',
            listening: true,
            resetTranscript: vi.fn(),
            browserSupportsSpeechRecognition: true,
        });
        const { result } = renderHook(() => useVoiceGrading(vi.fn(), vi.fn()));
        act(() => { result.current.toggleListening(); });
        expect(mockStopListening).toHaveBeenCalled();
    });

    it('uses default language nl-NL', () => {
        const { result } = renderHook(() => useVoiceGrading(vi.fn(), vi.fn()));
        act(() => { result.current.toggleListening(); });
        expect(mockStartListening).toHaveBeenCalledWith({ continuous: true, language: 'nl-NL' });
    });

    it('isListening reflects listening state', () => {
        mockUseSpeechRecognition.mockReturnValue({
            transcript: 'hello',
            listening: true,
            resetTranscript: vi.fn(),
            browserSupportsSpeechRecognition: true,
        });
        const { result } = renderHook(() => useVoiceGrading(vi.fn(), vi.fn()));
        expect(result.current.isListening).toBe(true);
        expect(result.current.transcript).toBe('hello');
    });

    it('registers commands with useSpeechRecognition', () => {
        renderHook(() => useVoiceGrading(vi.fn(), vi.fn()));
        expect(mockUseSpeechRecognition).toHaveBeenCalledWith(
            expect.objectContaining({ commands: expect.any(Array) })
        );
        const { commands } = mockUseSpeechRecognition.mock.calls[0][0];
        expect(commands.length).toBe(3);
    });

    it('grade command callback calls onGrade with correct indices', () => {
        const onGrade = vi.fn();
        renderHook(() => useVoiceGrading(onGrade, vi.fn()));
        const { commands } = mockUseSpeechRecognition.mock.calls[0][0];
        // First command: "Criterium 1 Niveau 4"
        commands[0].callback(['full match', '1', '4']);
        expect(onGrade).toHaveBeenCalledWith(0, 3); // 1-indexed → 0-indexed
    });

    it('score command callback calls onGrade with correct indices', () => {
        const onGrade = vi.fn();
        renderHook(() => useVoiceGrading(onGrade, vi.fn()));
        const { commands } = mockUseSpeechRecognition.mock.calls[0][0];
        // Second command: "Score 3 voor Criterium 2"
        commands[1].callback(['full match', '3', '2']);
        expect(onGrade).toHaveBeenCalledWith(1, 2); // criterionIndex=2-1=1, levelIndex=3-1=2
    });

    it('comment command callback calls onComment', () => {
        const onComment = vi.fn();
        renderHook(() => useVoiceGrading(vi.fn(), onComment));
        const { commands } = mockUseSpeechRecognition.mock.calls[0][0];
        // Third command: "Commentaar Great work!"
        commands[2].callback(['full match', 'Great work!']);
        expect(onComment).toHaveBeenCalledWith('Great work!');
    });

    it('grade command ignores NaN indices', () => {
        const onGrade = vi.fn();
        renderHook(() => useVoiceGrading(onGrade, vi.fn()));
        const { commands } = mockUseSpeechRecognition.mock.calls[0][0];
        commands[0].callback(['full match', 'abc', 'def']);
        expect(onGrade).not.toHaveBeenCalled();
    });

    it('comment command ignores empty match', () => {
        const onComment = vi.fn();
        renderHook(() => useVoiceGrading(vi.fn(), onComment));
        const { commands } = mockUseSpeechRecognition.mock.calls[0][0];
        commands[2].callback(['full match', '']);
        expect(onComment).not.toHaveBeenCalled();
    });
});
