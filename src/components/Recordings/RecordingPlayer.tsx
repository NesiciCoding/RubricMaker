import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getBlob } from '../../services/mediaStore';
import type { SessionRecording } from '../../types';

interface Props {
    recording: SessionRecording;
    /** Signed cloud URL to fall back to when the local blob is missing (e.g. another device). */
    cloudUrl?: string;
}

export default function RecordingPlayer({ recording, cloudUrl }: Props) {
    const { t } = useTranslation();
    const [objectUrl, setObjectUrl] = useState<string | null>(null);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        let url: string | null = null;
        let cancelled = false;
        setObjectUrl(null);
        setNotFound(false);
        (async () => {
            const record = await getBlob(recording.id);
            if (cancelled) return;
            if (record) {
                url = URL.createObjectURL(record.blob);
                setObjectUrl(url);
            } else {
                setNotFound(true);
            }
        })();
        return () => {
            cancelled = true;
            if (url) URL.revokeObjectURL(url);
        };
    }, [recording.id]);

    const src = objectUrl ?? (notFound ? cloudUrl : undefined);

    if (!src) {
        return notFound ? (
            <p className="text-xs text-muted" style={{ margin: 0 }}>
                {t('recordings.unavailable')}
            </p>
        ) : null;
    }

    return recording.mediaType === 'video' ? (
        <video controls src={src} style={{ width: '100%', maxWidth: 360, borderRadius: 6 }} />
    ) : (
        <audio controls src={src} style={{ width: '100%', maxWidth: 360 }} />
    );
}
