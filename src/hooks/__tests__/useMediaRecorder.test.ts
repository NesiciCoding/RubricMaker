import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaRecorder } from '../useMediaRecorder';

class MockMediaRecorder {
    static instances: MockMediaRecorder[] = [];
    state: 'inactive' | 'recording' = 'inactive';
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    stream: MediaStream;

    constructor(stream: MediaStream) {
        this.stream = stream;
        MockMediaRecorder.instances.push(this);
    }

    start() {
        this.state = 'recording';
    }

    stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['chunk'], { type: 'audio/webm' }) });
        this.onstop?.();
    }
}

function makeStream() {
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    return { stream, track };
}

let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
    MockMediaRecorder.instances = [];
    getUserMedia = vi.fn().mockImplementation(async () => makeStream().stream);
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia },
        configurable: true,
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('useMediaRecorder', () => {
    it('starts in idle status', () => {
        const { result } = renderHook(() => useMediaRecorder());
        expect(result.current.status).toBe('idle');
        expect(result.current.recordingKey).toBeNull();
        expect(result.current.error).toBeNull();
    });

    it('start requests audio-only by default and sets recording status', async () => {
        const { result } = renderHook(() => useMediaRecorder());
        await act(async () => {
            expect(await result.current.start()).toBe(true);
        });
        expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
        expect(result.current.status).toBe('recording');
        expect(MockMediaRecorder.instances).toHaveLength(1);
        expect(MockMediaRecorder.instances[0].state).toBe('recording');
    });

    it('start with video requests a video stream', async () => {
        const { result } = renderHook(() => useMediaRecorder());
        await act(async () => {
            await result.current.start({ video: true });
        });
        expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
    });

    it('stop resolves with the recorded blob and stops tracks', async () => {
        const { stream, track } = makeStream();
        getUserMedia.mockResolvedValue(stream);
        const { result } = renderHook(() => useMediaRecorder());
        await act(async () => {
            await result.current.start({ key: 'crit-1' });
        });
        let recording: { blob: Blob; mimeType: string } | null = null;
        await act(async () => {
            recording = await result.current.stop('crit-1');
        });
        expect(recording).not.toBeNull();
        expect(recording!.mimeType).toBe('audio/webm');
        expect(recording!.blob.type).toBe('audio/webm');
        expect(recording!.blob.size).toBeGreaterThan(0);
        expect(track.stop).toHaveBeenCalled();
        expect(result.current.status).toBe('stopped');
        expect(result.current.recordingKey).toBeNull();
    });

    it('video recordings report video/webm', async () => {
        const { result } = renderHook(() => useMediaRecorder());
        await act(async () => {
            await result.current.start({ video: true });
        });
        let recording: { blob: Blob; mimeType: string } | null = null;
        await act(async () => {
            recording = await result.current.stop();
        });
        expect(recording!.mimeType).toBe('video/webm');
    });

    it('stop without an active recording resolves null', async () => {
        const { result } = renderHook(() => useMediaRecorder());
        let recording: unknown = undefined;
        await act(async () => {
            recording = await result.current.stop('nothing');
        });
        expect(recording).toBeNull();
    });

    it('tracks the active recording key', async () => {
        const { result } = renderHook(() => useMediaRecorder());
        await act(async () => {
            await result.current.start({ key: 'crit-a' });
        });
        expect(result.current.recordingKey).toBe('crit-a');
    });

    it('start returns false for an already-recording key', async () => {
        const { result } = renderHook(() => useMediaRecorder());
        await act(async () => {
            await result.current.start({ key: 'dup' });
        });
        await act(async () => {
            expect(await result.current.start({ key: 'dup' })).toBe(false);
        });
        expect(MockMediaRecorder.instances).toHaveLength(1);
    });

    it('supports concurrent named recordings', async () => {
        const { result } = renderHook(() => useMediaRecorder());
        await act(async () => {
            await result.current.start({ key: 'one' });
            await result.current.start({ key: 'two' });
        });
        expect(result.current.status).toBe('recording');
        let first: { blob: Blob } | null = null;
        await act(async () => {
            first = await result.current.stop('one');
        });
        expect(first).not.toBeNull();
        expect(result.current.status).toBe('recording');
        expect(result.current.recordingKey).toBe('two');
        await act(async () => {
            await result.current.stop('two');
        });
        expect(result.current.status).toBe('stopped');
    });

    it('sets error status when getUserMedia is denied', async () => {
        getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
        const { result } = renderHook(() => useMediaRecorder());
        await act(async () => {
            expect(await result.current.start()).toBe(false);
        });
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBeInstanceOf(Error);
    });

    it('stops active recorders and tracks on unmount', async () => {
        const { stream, track } = makeStream();
        getUserMedia.mockResolvedValue(stream);
        const { result, unmount } = renderHook(() => useMediaRecorder());
        await act(async () => {
            await result.current.start({ key: 'live' });
        });
        unmount();
        expect(MockMediaRecorder.instances[0].state).toBe('inactive');
        expect(track.stop).toHaveBeenCalled();
    });
});
