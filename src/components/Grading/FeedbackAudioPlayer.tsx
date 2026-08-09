import { useTranslation } from 'react-i18next';
import { useFeedbackAudioSrc } from '../../hooks/useFeedbackAudioSrc';

/**
 * Renders the voice-feedback `<audio>` player + remove button for a ScoreEntry, resolving
 * either the inline base64 audio or a storage-bucket path (signed URL) transparently.
 */
export function FeedbackAudioPlayer({
    audioDataUrl,
    audioStoragePath,
    onRemove,
}: {
    audioDataUrl?: string;
    audioStoragePath?: string;
    onRemove: () => void;
}) {
    const { t } = useTranslation();
    const src = useFeedbackAudioSrc(audioDataUrl, audioStoragePath);
    if (!src) return null;
    return (
        <>
            <audio controls src={src} style={{ height: 28, flex: 1 }} />
            <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onRemove}
                aria-label={t('gradeStudent.audio_remove')}
                title={t('gradeStudent.audio_remove')}
            >
                ✕
            </button>
        </>
    );
}
