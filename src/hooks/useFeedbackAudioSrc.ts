import { useEffect, useState } from 'react';
import { storageSync } from '../services/database';

/**
 * Resolves a ScoreEntry's voice feedback to a playable `<audio src>`:
 * - a freshly-recorded / not-yet-uploaded / legacy base64 `audioDataUrl` is used as-is;
 * - otherwise an `audioStoragePath` is resolved to a (session-cached) signed URL.
 * Returns undefined while resolving or when there is no audio.
 */
export function useFeedbackAudioSrc(audioDataUrl?: string, audioStoragePath?: string): string | undefined {
    const [src, setSrc] = useState<string | undefined>(audioDataUrl);

    useEffect(() => {
        if (audioDataUrl) {
            setSrc(audioDataUrl);
            return;
        }
        if (!audioStoragePath) {
            setSrc(undefined);
            return;
        }
        let alive = true;
        setSrc(undefined);
        storageSync.feedbackAudioSync.resolveUrl(audioStoragePath).then((url) => {
            if (alive) setSrc(url || undefined);
        });
        return () => {
            alive = false;
        };
    }, [audioDataUrl, audioStoragePath]);

    return src;
}
