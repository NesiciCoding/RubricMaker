import { useEffect, useState } from 'react';
import { storageSync } from '../services/database';

/**
 * Portal counterpart of useFeedbackAudioSrc. A student session cannot sign the owner-scoped
 * feedback-audio path, so a storage-backed recording is resolved through the get-feedback-audio-url
 * edge function (which authorizes the caller against the grade they are reading) instead of the
 * direct storage sign used for teacher playback. A recording still held inline as base64 is used
 * as-is; returns undefined while resolving or when there is no audio.
 */
export function usePortalFeedbackAudioSrc(
    studentRubricId: string | undefined,
    entry: { criterionId: string; audioDataUrl?: string; audioStoragePath?: string }
): string | undefined {
    const { criterionId, audioDataUrl, audioStoragePath } = entry;
    const [src, setSrc] = useState<string | undefined>(audioDataUrl);

    useEffect(() => {
        if (audioDataUrl) {
            setSrc(audioDataUrl);
            return;
        }
        if (!audioStoragePath || !studentRubricId) {
            setSrc(undefined);
            return;
        }
        let alive = true;
        setSrc(undefined);
        storageSync.feedbackAudioSync.resolvePortalUrl(studentRubricId, criterionId).then((url) => {
            if (alive) setSrc(url || undefined);
        });
        return () => {
            alive = false;
        };
    }, [studentRubricId, criterionId, audioDataUrl, audioStoragePath]);

    return src;
}
