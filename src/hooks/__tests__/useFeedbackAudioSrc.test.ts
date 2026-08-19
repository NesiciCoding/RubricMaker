import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useFeedbackAudioSrc } from '../useFeedbackAudioSrc';

const mockResolveUrl = vi.fn();

vi.mock('../../services/database', () => ({
    storageSync: {
        feedbackAudioSync: {
            resolveUrl: (...args: unknown[]) => mockResolveUrl(...args),
        },
    },
}));

describe('useFeedbackAudioSrc', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uses a provided data URL as-is', () => {
        const { result } = renderHook(() => useFeedbackAudioSrc('data:audio/webm;base64,abc'));
        expect(result.current).toBe('data:audio/webm;base64,abc');
        expect(mockResolveUrl).not.toHaveBeenCalled();
    });

    it('switches to a new data URL when the prop changes', () => {
        const { result, rerender } = renderHook(({ url }) => useFeedbackAudioSrc(url), {
            initialProps: { url: 'data:audio/webm;base64,one' },
        });
        expect(result.current).toBe('data:audio/webm;base64,one');

        rerender({ url: 'data:audio/webm;base64,two' });
        expect(result.current).toBe('data:audio/webm;base64,two');
    });

    it('resolves a storage path to a signed URL', async () => {
        mockResolveUrl.mockResolvedValue('https://example.com/audio');
        const { result } = renderHook(() => useFeedbackAudioSrc(undefined, 'feedback/audio-1'));
        expect(result.current).toBeUndefined();
        await act(async () => {
            await Promise.resolve();
        });
        expect(mockResolveUrl).toHaveBeenCalledWith('feedback/audio-1');
        expect(result.current).toBe('https://example.com/audio');
    });

    it('stays undefined when the storage path resolves to no URL', async () => {
        mockResolveUrl.mockResolvedValue(null);
        const { result } = renderHook(() => useFeedbackAudioSrc(undefined, 'feedback/audio-1'));
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current).toBeUndefined();
    });

    it('stays undefined when neither prop is provided', () => {
        const { result } = renderHook(() => useFeedbackAudioSrc());
        expect(result.current).toBeUndefined();
    });

    it('ignores a late resolution after unmount', async () => {
        let resolveUrl!: (url: string | null) => void;
        mockResolveUrl.mockImplementation(() => new Promise<string | null>((resolve) => (resolveUrl = resolve)));
        const { unmount } = renderHook(() => useFeedbackAudioSrc(undefined, 'feedback/audio-1'));
        unmount();
        await act(async () => {
            resolveUrl('https://example.com/audio');
            await Promise.resolve();
        });
    });
});
