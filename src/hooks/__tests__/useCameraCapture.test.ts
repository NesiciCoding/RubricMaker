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

    it('start is idempotent while active and does not request the camera twice', async () => {
        const { result } = renderHook(() => useCameraCapture());
        await act(async () => {
            await result.current.start();
        });
        await act(async () => {
            expect(await result.current.start()).toBe(true);
        });
        expect(getUserMedia).toHaveBeenCalledTimes(1);
    });

    it('tears down a partially-acquired stream when play() rejects', async () => {
        const { stream, track } = makeStream();
        getUserMedia.mockResolvedValueOnce(stream);
        const { result } = renderHook(() => useCameraCapture());
        act(() => {
            result.current.videoRef.current = {
                videoWidth: 640,
                videoHeight: 480,
                play: vi.fn().mockRejectedValue(new Error('play failed')),
            } as unknown as HTMLVideoElement;
        });
        let ok = true;
        await act(async () => {
            ok = await result.current.start();
        });
        expect(ok).toBe(false);
        expect(result.current.status).toBe('error');
        expect(track.stop).toHaveBeenCalled();
    });

    it('serializes concurrent start calls into a single getUserMedia request', async () => {
        const { result } = renderHook(() => useCameraCapture());
        await act(async () => {
            await Promise.all([result.current.start(), result.current.start()]);
        });
        expect(getUserMedia).toHaveBeenCalledTimes(1);
        expect(result.current.status).toBe('active');
    });

    it('discards a stream that arrives after stop() and stays idle', async () => {
        const { stream, track } = makeStream();
        let resolveGum!: (s: MediaStream) => void;
        getUserMedia.mockImplementationOnce(
            () =>
                new Promise<MediaStream>((res) => {
                    resolveGum = res;
                })
        );
        const { result } = renderHook(() => useCameraCapture());
        let startPromise!: Promise<boolean>;
        act(() => {
            startPromise = result.current.start();
        });
        act(() => {
            result.current.stop();
        });
        let ok = true;
        await act(async () => {
            resolveGum(stream);
            ok = await startPromise;
        });
        expect(ok).toBe(false);
        expect(track.stop).toHaveBeenCalled();
        expect(result.current.status).toBe('idle');
    });

    it('reports the actual blob mime type when the browser falls back to png', async () => {
        const getContextSpy = vi
            .spyOn(HTMLCanvasElement.prototype, 'getContext')
            .mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
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

        const out = await result.current.capture('image/webp');
        expect(out!.mimeType).toBe('image/png');

        getContextSpy.mockRestore();
        toBlobSpy.mockRestore();
    });

    it('capture returns null when no 2d context is available', async () => {
        const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
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
        expect(await result.current.capture()).toBeNull();
        getContextSpy.mockRestore();
    });
});
