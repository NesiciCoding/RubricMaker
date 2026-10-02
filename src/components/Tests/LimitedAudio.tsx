import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTTS } from '../../hooks/useTTS';

interface Props {
    /** Already-sanitised audio URL; takes precedence over spokenText */
    src?: string;
    /** Read by the browser voice when there is no src */
    spokenText?: string;
    maxPlays?: number;
    /** Plays used so far — owned by the page so navigating between questions can't reset it */
    plays: number;
    onPlay: (count: number) => void;
    lang: string;
    label: string;
}

/**
 * Listening stimulus: a plain audio player when unlimited, otherwise a Play button with a
 * remaining-plays counter. Enforced client-side only (a refresh resets the counter), so it is a
 * guard against casual replaying, not a security boundary.
 */
export default function LimitedAudio({ src, spokenText, maxPlays, plays, onPlay, lang, label }: Props) {
    const { t } = useTranslation();
    const audioRef = useRef<HTMLAudioElement>(null);
    const [audioPlaying, setAudioPlaying] = useState(false);
    const startingRef = useRef(false);
    const tts = useTTS({ lang });
    const limited = maxPlays !== undefined && maxPlays > 0;

    if (src && !limited) {
        return <audio controls src={src} aria-label={label} style={{ display: 'block', width: '100%' }} />;
    }
    if (!src && !spokenText) return null;
    if (!src && tts.status === 'unsupported') {
        return <p className="text-muted text-sm">{t('tests.taking.tts_unsupported')}</p>;
    }

    const busy = src ? audioPlaying : tts.status === 'speaking' || tts.status === 'paused';
    const exhausted = limited && plays >= maxPlays;

    function play() {
        if (exhausted || busy || startingRef.current) return;
        if (src) {
            const el = audioRef.current;
            if (!el) return;
            // A play only counts once the browser actually starts it, so a blocked or failed
            // start doesn't burn one of the student's limited plays.
            startingRef.current = true;
            el.currentTime = 0;
            el.play()
                .then(() => {
                    if (limited) onPlay(plays + 1);
                })
                .catch(() => undefined)
                .finally(() => {
                    startingRef.current = false;
                });
        } else {
            if (limited) onPlay(plays + 1);
            tts.speak(spokenText!);
        }
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {src && (
                <audio
                    ref={audioRef}
                    src={src}
                    onPlay={() => setAudioPlaying(true)}
                    onEnded={() => setAudioPlaying(false)}
                    onPause={() => setAudioPlaying(false)}
                />
            )}
            <button type="button" className="btn btn-primary btn-sm" disabled={exhausted || busy} onClick={play}>
                <Volume2 size={14} /> {busy ? t('tests.taking.audio_playing') : label}
            </button>
            {limited && (
                <span className="text-muted text-sm" role="status">
                    {exhausted
                        ? t('tests.taking.audio_no_plays_left')
                        : t('tests.taking.audio_plays_left', { left: maxPlays - plays, max: maxPlays })}
                </span>
            )}
        </div>
    );
}

/** Small speaker button for a multiple-choice option's audio (file or browser voice); never limited. */
export function OptionAudioButton({
    src,
    spokenText,
    lang,
    label,
}: {
    src?: string;
    spokenText?: string;
    lang: string;
    label: string;
}) {
    const tts = useTTS({ lang });
    const audioRef = useRef<HTMLAudioElement | null>(null);
    useEffect(
        () => () => {
            audioRef.current?.pause();
            audioRef.current = null;
        },
        []
    );
    if (!src && (!spokenText || tts.status === 'unsupported')) return null;
    return (
        <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            aria-label={label}
            title={label}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (src) {
                    // A fresh element each time restarts the clip from the top; the previous one is stopped.
                    audioRef.current?.pause();
                    const audio = new Audio(src);
                    audioRef.current = audio;
                    audio.play().catch(() => undefined);
                } else {
                    tts.speak(spokenText!);
                }
            }}
        >
            <Volume2 size={14} />
        </button>
    );
}
