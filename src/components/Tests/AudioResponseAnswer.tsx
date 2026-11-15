import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaRecorder } from '../../hooks/useMediaRecorder';
import { encodeAudioResponse, parseAudioResponse } from '../../utils/audioResponseCode';
import { fileToDataUrl } from '../../utils/fileToDataUrl';

export const DEFAULT_MAX_RECORDING_SECONDS = 60;

interface Props {
    value: string;
    onChange: (value: string) => void;
    maxRecordingSeconds: number;
    prepSeconds?: number;
    cueBullets?: string[];
    onRecordingChange?: (recording: boolean) => void;
    /** Effective content language of the question (BCP-47 base code). */
    lang?: string;
}

/** Recordings are always `data:audio/...` URIs produced locally by fileToDataUrl — reject anything else before it reaches an <audio src>. */
function safeRecordedAudioSrc(dataUri: string): string | undefined {
    return /^data:audio\//i.test(dataUri) ? dataUri : undefined;
}

/** Record a spoken answer (with optional prep countdown and cue card) and re-record before submitting. */
export default function AudioResponseAnswer({
    value,
    onChange,
    maxRecordingSeconds,
    prepSeconds,
    cueBullets,
    onRecordingChange,
    lang,
}: Props) {
    const { t } = useTranslation();
    const { status, start, stop } = useMediaRecorder();
    const [elapsedSec, setElapsedSec] = useState(0);
    const [micError, setMicError] = useState(false);
    const elapsedRef = useRef(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [prepRemaining, setPrepRemaining] = useState<number | null>(null);
    const prepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startingRef = useRef(false);
    const existing = parseAudioResponse(value);

    useEffect(() => {
        onRecordingChange?.(status === 'recording' || prepRemaining !== null);
    }, [status, prepRemaining, onRecordingChange]);

    useEffect(
        () => () => {
            if (prepTimerRef.current) clearInterval(prepTimerRef.current);
        },
        []
    );

    const stopRecording = useCallback(async () => {
        /* v8 ignore next -- the interval is always set while recording */
        if (timerRef.current) clearInterval(timerRef.current);
        const result = await stop();
        /* v8 ignore next -- stop() only returns null when no session exists (never while recording) */
        if (result) {
            try {
                const dataUri = await fileToDataUrl(result.blob);
                onChange(encodeAudioResponse({ dataUri, mimeType: result.mimeType, durationSec: elapsedRef.current }));
            } catch (err) {
                console.error('Failed to encode audio response', err);
            }
        }
    }, [stop, onChange]);

    async function startRecording() {
        // Synchronous guard: a double click or a skipped prep must not start a second recorder
        // while the first request for the microphone is still pending.
        if (startingRef.current) return;
        startingRef.current = true;
        setMicError(false);
        elapsedRef.current = 0;
        setElapsedSec(0);
        let ok: boolean;
        try {
            ok = await start();
        } finally {
            startingRef.current = false;
        }
        if (!ok) {
            setMicError(true);
            return;
        }
        timerRef.current = setInterval(() => {
            elapsedRef.current += 1;
            setElapsedSec(elapsedRef.current);
            if (elapsedRef.current >= maxRecordingSeconds) void stopRecording();
        }, 1000);
    }

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    function endPrep() {
        if (prepTimerRef.current) clearInterval(prepTimerRef.current);
        prepTimerRef.current = null;
        setPrepRemaining(null);
        void startRecording();
    }

    function begin() {
        if (startingRef.current || prepTimerRef.current || status === 'recording') return;
        if (!prepSeconds || prepSeconds <= 0) {
            void startRecording();
            return;
        }
        let remaining = prepSeconds;
        setPrepRemaining(remaining);
        prepTimerRef.current = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) endPrep();
            else setPrepRemaining(remaining);
        }, 1000);
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cueBullets && cueBullets.length > 0 && (
                <div
                    style={{
                        padding: '10px 14px',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        background: 'var(--bg)',
                    }}
                >
                    <strong style={{ fontSize: '0.85rem' }}>{t('tests.taking.cue_card_title')}</strong>
                    <ul lang={lang ?? 'en'} style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                        {cueBullets.map((bullet, i) => (
                            <li key={i}>{bullet}</li>
                        ))}
                    </ul>
                </div>
            )}
            {prepRemaining !== null ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span role="timer" style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
                        {t('tests.taking.prep_countdown', { seconds: prepRemaining })}
                    </span>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={endPrep}
                        style={{ marginLeft: 'auto' }}
                    >
                        {t('tests.taking.prep_skip')}
                    </button>
                </div>
            ) : status === 'recording' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span
                        style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: 'var(--red)',
                            animation: 'pulse 1s infinite',
                            flexShrink: 0,
                        }}
                    />
                    <span style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
                        {t('tests.taking.recording_in_progress', {
                            elapsed: elapsedSec,
                            max: maxRecordingSeconds,
                        })}
                    </span>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => void stopRecording()}
                        style={{ marginLeft: 'auto' }}
                    >
                        {t('tests.taking.stop_recording')}
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={begin}>
                        {existing ? t('tests.taking.re_record') : t('tests.taking.start_recording')}
                    </button>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {t('tests.taking.max_recording_note', { max: maxRecordingSeconds })}
                    </span>
                </div>
            )}
            {micError && (
                <p role="alert" style={{ color: 'var(--red-text)', fontSize: '0.85rem', margin: 0 }}>
                    {t('tests.taking.microphone_error')}
                </p>
            )}
            {existing && status !== 'recording' && safeRecordedAudioSrc(existing.dataUri) && (
                <audio controls src={safeRecordedAudioSrc(existing.dataUri)} style={{ width: '100%' }} />
            )}
        </div>
    );
}
