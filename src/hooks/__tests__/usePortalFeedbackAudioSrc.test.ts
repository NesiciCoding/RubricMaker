import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePortalFeedbackAudioSrc } from '../usePortalFeedbackAudioSrc';

const mockResolvePortalUrl = vi.fn();

vi.mock('../../services/database', () => ({
    storageSync: {
        feedbackAudioSync: {
            resolvePortalUrl: (...args: unknown[]) => mockResolvePortalUrl(...args),
        },
    },
}));

describe('usePortalFeedbackAudioSrc', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uses an inline data URL as-is', () => {
        const { result } = renderHook(() =>
            usePortalFeedbackAudioSrc('sr1', { criterionId: 'c1', audioDataUrl: 'data:audio/webm;base64,abc' })
        );
        expect(result.current).toBe('data:audio/webm;base64,abc');
        expect(mockResolvePortalUrl).not.toHaveBeenCalled();
    });

    it('resolves a storage path through the edge resolver, keyed by grade and criterion', async () => {
        mockResolvePortalUrl.mockResolvedValue('https://example.com/signed');
        const { result } = renderHook(() =>
            usePortalFeedbackAudioSrc('sr1', { criterionId: 'c1', audioStoragePath: 'u/sr1/c1' })
        );
        expect(result.current).toBeUndefined();
        await act(async () => {
            await Promise.resolve();
        });
        expect(mockResolvePortalUrl).toHaveBeenCalledWith('sr1', 'c1');
        expect(result.current).toBe('https://example.com/signed');
    });

    it('stays undefined when the resolver has no URL', async () => {
        mockResolvePortalUrl.mockResolvedValue('');
        const { result } = renderHook(() =>
            usePortalFeedbackAudioSrc('sr1', { criterionId: 'c1', audioStoragePath: 'u/sr1/c1' })
        );
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current).toBeUndefined();
    });

    it('stays undefined without a storage path or a grade id', () => {
        const { result } = renderHook(() => usePortalFeedbackAudioSrc('sr1', { criterionId: 'c1' }));
        expect(result.current).toBeUndefined();

        const { result: noId } = renderHook(() =>
            usePortalFeedbackAudioSrc(undefined, { criterionId: 'c1', audioStoragePath: 'u/sr1/c1' })
        );
        expect(noId.current).toBeUndefined();
        expect(mockResolvePortalUrl).not.toHaveBeenCalled();
    });

    it('ignores a late resolution after unmount', async () => {
        let resolveUrl!: (url: string) => void;
        mockResolvePortalUrl.mockImplementation(() => new Promise<string>((resolve) => (resolveUrl = resolve)));
        const { unmount } = renderHook(() =>
            usePortalFeedbackAudioSrc('sr1', { criterionId: 'c1', audioStoragePath: 'u/sr1/c1' })
        );
        unmount();
        await act(async () => {
            resolveUrl('https://example.com/signed');
            await Promise.resolve();
        });
    });
});
