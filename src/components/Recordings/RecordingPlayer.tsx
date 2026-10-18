import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getBlob } from '../../services/mediaStore';
import { MediaBoxSkeleton } from '../ui/Skeleton';
import type { SessionRecording } from '../../types';

interface Props {
    recording: SessionRecording;
    /** Signed cloud URL to fall back to when the local blob is missing (e.g. another device). */
    cloudUrl?: string;
}

export default function RecordingPlayer({ recording, cloudUrl }: Props) {
    const { t } = useTranslation();
    const [objectUrl, setObjectUrl] = useState<string | null>(null);
    const [loadedRecordingId, setLoadedRecordingId] = useState<string | null>(null);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        let url: string | null = null;
        let cancelled = false;
        setObjectUrl(null);
        setLoadedRecordingId(null);
        setNotFound(false);
        (async () => {
            const record = await getBlob(recording.id);
            if (cancelled) return;
            if (record) {
                url = URL.createObjectURL(record.blob);
                setObjectUrl(url);
                setLoadedRecordingId(recording.id);
            } else {
                setNotFound(true);
            }
        })();
        return () => {
            cancelled = true;
            if (url) URL.revokeObjectURL(url);
        };
    }, [recording.id]);

    /* v8 ignore next -- objectUrl and loadedRecordingId are always set/cleared together, so the ??-undefined arm is unreachable */
    const src = loadedRecordingId === recording.id ? (objectUrl ?? undefined) : notFound ? cloudUrl : undefined;

    if (!src) {
        if (notFound) {
            return (
                <p className="text-xs text-muted" style={{ margin: 0 }}>
                    {t('recordings.unavailable')}
                </p>
            );
        }
        // The blob is still coming out of IndexedDB: keep the player's footprint instead
        // of returning null (which made the whole row jump when the audio appeared).
        return recording.mediaType === 'video' ? (
            <div style={{ width: '100%', maxWidth: 360 }}>
                <MediaBoxSkeleton aspectRatio="16 / 9" label={t('a11y.loading')} />
            </div>
        ) : (
            <div style={{ width: '100%', maxWidth: 360 }}>
                <MediaBoxSkeleton height="3.5rem" label={t('a11y.loading')} />
            </div>
        );
    }

    return recording.mediaType === 'video' ? (
        <video controls src={src} style={{ width: '100%', maxWidth: 360, borderRadius: 6 }} />
    ) : (
        <audio controls src={src} style={{ width: '100%', maxWidth: 360 }} />
    );
}
