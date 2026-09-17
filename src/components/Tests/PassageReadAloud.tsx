import { Play, Pause, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTTS, htmlToPlainText } from '../../hooks/useTTS';

interface PassageReadAloudProps {
    /** Passage HTML (rich content) to read aloud. */
    contentHtml: string;
    /** BCP-47 / base language code for voice selection (e.g. 'en', 'nl'). */
    lang: string;
}

/** Browser speech-synthesis read-aloud for a reading passage — reused for test section/generator passages. */
export default function PassageReadAloud({ contentHtml, lang }: PassageReadAloudProps) {
    const { t } = useTranslation();
    const { status, charIndex, totalChars, speak, pause, resume, stop } = useTTS({ lang });

    if (status === 'unsupported') return null;

    const isBusy = status === 'speaking' || status === 'paused';
    const progressPct = totalChars > 0 ? (charIndex / totalChars) * 100 : 0;

    const handlePlayPause = () => {
        if (status === 'speaking') return pause();
        if (status === 'paused') return resume();
        speak(htmlToPlainText(contentHtml));
    };

    const btnStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: isBusy ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--bg-elevated)',
        color: 'var(--text)',
        cursor: 'pointer',
        fontSize: '0.8rem',
        fontWeight: 500,
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <button
                type="button"
                style={btnStyle}
                onClick={handlePlayPause}
                aria-label={
                    status === 'paused' ? t('tts.resume') : status === 'speaking' ? t('tts.pause') : t('tts.read_aloud')
                }
                aria-pressed={isBusy}
            >
                {status === 'speaking' ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
                {t('tts.read_aloud')}
            </button>
            {isBusy && (
                <button
                    type="button"
                    style={{ ...btnStyle, background: 'var(--bg-elevated)' }}
                    onClick={stop}
                    aria-label={t('tts.stop')}
                >
                    <Square size={13} aria-hidden="true" />
                </button>
            )}
            {isBusy && totalChars > 0 && (
                <div
                    role="progressbar"
                    aria-valuenow={Math.round(progressPct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t('tts.progress')}
                    style={{ width: 60, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}
                >
                    <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--accent)' }} />
                </div>
            )}
        </div>
    );
}
