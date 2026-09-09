import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'idle' | 'active' | 'error';

export interface CaptureResult {
    blob: Blob;
    mimeType: string;
    width: number;
    height: number;
}

export interface StartCameraOptions {
    /** Prefer the rear ('environment') camera for scanning paper; falls back if unavailable. */
    facingMode?: 'environment' | 'user';
}

export interface UseCameraCaptureReturn {
    status: CameraStatus;
    error: Error | null;
    /** Attach to a <video autoPlay playsInline muted> element to preview the live camera. */
    videoRef: React.RefObject<HTMLVideoElement | null>;
    start: (opts?: StartCameraOptions) => Promise<boolean>;
    capture: (mimeType?: string, quality?: number) => Promise<CaptureResult | null>;
    stop: () => void;
}

/**
 * Live camera preview + still-frame capture for scanning paper work. A still image
 * (not a recording) is grabbed from the preview onto a canvas; the caller stores the
 * resulting blob via scanStore. Mirrors useMediaRecorder's permission/stream/cleanup
 * handling but is video-still oriented.
 */
export function useCameraCapture(): UseCameraCaptureReturn {
    const [status, setStatus] = useState<CameraStatus>('idle');
    const [error, setError] = useState<Error | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const stop = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setStatus('idle');
    }, []);

    const start = useCallback(async (opts: StartCameraOptions = {}) => {
        if (streamRef.current) return true;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: opts.facingMode ?? 'environment' },
                audio: false,
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play?.();
            }
            setStatus('active');
            setError(null);
            return true;
        } catch (e) {
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            setError(e instanceof Error ? e : new Error(String(e)));
            setStatus('error');
            return false;
        }
    }, []);

    const capture = useCallback((mimeType = 'image/png', quality?: number) => {
        const video = videoRef.current;
        if (!video || !streamRef.current) return Promise.resolve<CaptureResult | null>(null);

        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) return Promise.resolve<CaptureResult | null>(null);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return Promise.resolve<CaptureResult | null>(null);
        ctx.drawImage(video, 0, 0, width, height);

        return new Promise<CaptureResult | null>((resolve) => {
            canvas.toBlob((blob) => resolve(blob ? { blob, mimeType, width, height } : null), mimeType, quality);
        });
    }, []);

    useEffect(() => stop, [stop]);

    return { status, error, videoRef, start, capture, stop };
}
