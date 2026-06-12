import { useState, useRef, useCallback, useEffect } from 'react';

export type MediaRecorderStatus = 'idle' | 'recording' | 'stopped' | 'error';

export interface RecordingResult {
    blob: Blob;
    mimeType: string;
}

export interface StartOptions {
    video?: boolean;
    key?: string;
}

export interface UseMediaRecorderReturn {
    status: MediaRecorderStatus;
    recordingKey: string | null;
    error: Error | null;
    start: (opts?: StartOptions) => Promise<boolean>;
    stop: (key?: string) => Promise<RecordingResult | null>;
}

const DEFAULT_KEY = '__default__';

interface Session {
    recorder: MediaRecorder;
    stream: MediaStream;
    chunks: BlobPart[];
    mimeType: string;
}

export function useMediaRecorder(): UseMediaRecorderReturn {
    const [status, setStatus] = useState<MediaRecorderStatus>('idle');
    const [recordingKey, setRecordingKey] = useState<string | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const sessionsRef = useRef<Map<string, Session>>(new Map());

    const start = useCallback(async (opts: StartOptions = {}) => {
        const key = opts.key ?? DEFAULT_KEY;
        if (sessionsRef.current.has(key)) return false;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: opts.video ?? false,
            });
            const recorder = new MediaRecorder(stream);
            const session: Session = {
                recorder,
                stream,
                chunks: [],
                mimeType: opts.video ? 'video/webm' : 'audio/webm',
            };
            recorder.ondataavailable = (e) => {
                session.chunks.push(e.data);
            };
            recorder.start();
            sessionsRef.current.set(key, session);
            setRecordingKey(key);
            setStatus('recording');
            setError(null);
            return true;
        } catch (e) {
            setError(e instanceof Error ? e : new Error(String(e)));
            setStatus('error');
            return false;
        }
    }, []);

    const stop = useCallback((key?: string) => {
        const k = key ?? DEFAULT_KEY;
        const session = sessionsRef.current.get(k);
        if (!session) return Promise.resolve<RecordingResult | null>(null);
        sessionsRef.current.delete(k);

        const remaining = [...sessionsRef.current.keys()];
        setRecordingKey(remaining.length > 0 ? remaining[remaining.length - 1] : null);
        setStatus(remaining.length > 0 ? 'recording' : 'stopped');

        return new Promise<RecordingResult | null>((resolve) => {
            session.recorder.onstop = () => {
                session.stream.getTracks().forEach((t) => t.stop());
                resolve({
                    blob: new Blob(session.chunks, { type: session.mimeType }),
                    mimeType: session.mimeType,
                });
            };
            session.recorder.stop();
        });
    }, []);

    useEffect(() => {
        const sessions = sessionsRef.current;
        return () => {
            sessions.forEach((session) => {
                try {
                    if (session.recorder.state !== 'inactive') session.recorder.stop();
                } catch {
                    // recorder already torn down
                }
                session.stream.getTracks().forEach((t) => t.stop());
            });
            sessions.clear();
        };
    }, []);

    return { status, recordingKey, error, start, stop };
}
