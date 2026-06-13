import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Video, Square, Trash2, AlertTriangle } from 'lucide-react';
import { useMediaRecorder } from '../../hooks/useMediaRecorder';
import { putBlob, estimateUsage } from '../../services/mediaStore';
import { useToast } from '../../hooks/useToast';
import { nanoid } from '../../utils/nanoid';
import type { SessionRecording } from '../../types';

const QUOTA_HEADROOM_BYTES = 60 * 1024 * 1024; // 60MB
const MAX_RECORDING_BYTES = 50 * 1024 * 1024; // 50MB

interface Props {
    recordings: SessionRecording[];
    onChange: (recordings: SessionRecording[]) => void;
    /** True when Supabase sync is configured; gates video recording. */
    syncConfigured: boolean;
}

export default function RecordingControls({ recordings, onChange, syncConfigured }: Props) {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const { status, start, stop } = useMediaRecorder();
    const [pendingVideo, setPendingVideo] = useState(false);
    const [startedAt, setStartedAt] = useState<number | null>(null);

    const recording = status === 'recording';

    async function handleStart(video: boolean) {
        if (video && !syncConfigured) return;
        const { quota, usage } = await estimateUsage();
        if (quota > 0 && quota - usage < QUOTA_HEADROOM_BYTES) {
            showToast(t('recordings.quota_warning'), 'warning');
            return;
        }
        setPendingVideo(video);
        const ok = await start({ video });
        if (ok) setStartedAt(Date.now());
        else showToast(t('recordings.start_error'), 'error');
    }

    async function handleStop() {
        const result = await stop();
        const durationSec = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
        setStartedAt(null);
        if (!result) return;

        if (result.blob.size > MAX_RECORDING_BYTES) {
            showToast(t('recordings.too_large_warning'), 'warning');
            return;
        }

        const id = nanoid();
        await putBlob(id, result.blob, result.mimeType);
        const newRecording: SessionRecording = {
            id,
            mediaType: pendingVideo ? 'video' : 'audio',
            mimeType: result.mimeType,
            durationSec,
            sizeBytes: result.blob.size,
            createdAt: new Date().toISOString(),
            synced: false,
        };
        onChange([...recordings, newRecording]);
    }

    function handleDiscard(id: string) {
        onChange(recordings.filter((r) => r.id !== id));
    }

    return (
        <div>
            {!syncConfigured && (
                <div
                    role="status"
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-muted)',
                        fontSize: '0.8rem',
                        marginBottom: 10,
                    }}
                >
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1, color: 'var(--orange, #f59e0b)' }} />
                    <span>{t('recordings.local_only_warning')}</span>
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {!recording ? (
                    <>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleStart(false)}>
                            <Mic size={14} /> {t('recordings.record_audio')}
                        </button>
                        <span title={!syncConfigured ? t('recordings.video_requires_db') : undefined}>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleStart(true)}
                                disabled={!syncConfigured}
                            >
                                <Video size={14} /> {t('recordings.record_video')}
                            </button>
                        </span>
                    </>
                ) : (
                    <button type="button" className="btn btn-danger btn-sm" onClick={handleStop}>
                        <Square size={14} /> {t('recordings.stop_recording')}
                    </button>
                )}
            </div>

            {recordings.length > 0 && (
                <ul
                    style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: '10px 0 0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                    }}
                >
                    {recordings.map((rec) => (
                        <li
                            key={rec.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: '0.85rem',
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border)',
                                borderRadius: 6,
                                padding: '6px 10px',
                            }}
                        >
                            {rec.mediaType === 'video' ? <Video size={14} /> : <Mic size={14} />}
                            <span style={{ flex: 1 }}>
                                {t(`recordings.type_${rec.mediaType}`)} — {rec.durationSec}s
                            </span>
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label={t('recordings.discard')}
                                onClick={() => handleDiscard(rec.id)}
                            >
                                <Trash2 size={13} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
