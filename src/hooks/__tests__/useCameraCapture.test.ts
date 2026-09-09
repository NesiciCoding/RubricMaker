import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCameraCapture } from '../useCameraCapture';

function makeStream() {
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    return { stream, track };
}

let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
    getUserMedia = vi.fn().mockImplementation(async () => makeStream().stream);
    Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia },
        configurable: true,
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('useCameraCapture', () => {
    it('starts in idle status', () => {
        const { result } = renderHook(() => useCameraCapture());
        expect(result.current.status).toBe('idle');
        expect(result.current.error).toBeNull();
    });

    it('start requests the rear camera by default and goes active', async () => {
        const { result } = renderHook(() => useCameraCapture());
        await act(async () => {
            await result.current.start();
        });
        expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'environment' }, audio: false });
        expect(result.current.status).toBe('active');
    });

    it('start honours a user-facing camera request', async () => {
        const { result } = renderHook(() => useCameraCapture());
        await act(async () => {
            await result.current.start({ facingMode: 'user' });
        });
        expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'user' }, audio: false });
    });

    it('sets error status when permission is denied', async () => {
        getUserMedia.mockRejectedValueOnce(new Error('denied'));
        const { result } = renderHook(() => useCameraCapture());
        let ok = true;
        await act(async () => {
            ok = await result.current.start();
        });
        expect(ok).toBe(false);
        expect(result.current.status).toBe('error');
        expect(result.current.error?.message).toBe('denied');
    });

    it('capture returns null before the camera is started', async () => {
        const { result } = renderHook(() => useCameraCapture());
        const out = await result.current.capture();
        expect(out).toBeNull();
    });

    it('capture draws the current frame to a blob', async () => {
        const drawImage = vi.fn();
        const getContextSpy = vi
            .spyOn(HTMLCanvasElement.prototype, 'getContext')
            .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
        const toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
            this: HTMLCanvasElement,
            cb: BlobCallback
        ) {
            cb(new Blob(['img'], { type: 'image/png' }));
        });

        const { result } = renderHook(() => useCameraCapture());
        act(() => {
            result.current.videoRef.current = {
                videoWidth: 640,
                videoHeight: 480,
                play: vi.fn().mockResolvedValue(undefined),
            } as unknown as HTMLVideoElement;
        });
        await act(async () => {
            await result.current.start();
        });

        const out = await result.current.capture('image/png');
        expect(out).not.toBeNull();
        expect(out!.width).toBe(640);
        expect(out!.height).toBe(480);
        expect(out!.mimeType).toBe('image/png');
        expect(drawImage).toHaveBeenCalled();

        getContextSpy.mockRestore();
        toBlobSpy.mockRestore();
    });

    it('capture returns null when the video has no dimensions yet', async () => {
        const { result } = renderHook(() => useCameraCapture());
        act(() => {
            result.current.videoRef.current = {
                videoWidth: 0,
                videoHeight: 0,
                play: vi.fn().mockResolvedValue(undefined),
            } as unknown as HTMLVideoElement;
        });
        await act(async () => {
            await result.current.start();
        });
        expect(await result.current.capture()).toBeNull();
    });

    it('stop tears down the stream tracks', async () => {
        const { stream, track } = makeStream();
        getUserMedia.mockResolvedValueOnce(stream);
        const { result } = renderHook(() => useCameraCapture());
        await act(async () => {
            await result.current.start();
        });
        act(() => {
            result.current.stop();
        });
        expect(track.stop).toHaveBeenCalled();
        expect(result.current.status).toBe('idle');
    });
});
