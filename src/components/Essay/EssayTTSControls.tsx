import React, { useCallback, useState } from 'react';
import { Play, Pause, Square, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTTS, htmlToPlainText } from '../../hooks/useTTS';

interface EssayTTSControlsProps {
    promptText?: string;
    contentHtml: string;
    lang: string;
}

export default function EssayTTSControls({ promptText, contentHtml, lang }: EssayTTSControlsProps) {
    const { t } = useTranslation();
    const { status, charIndex, totalChars, speak, pause, resume, stop } = useTTS({ lang });
    const [activeTarget, setActiveTarget] = useState<'prompt' | 'essay' | null>(null);

    const handleReadPrompt = useCallback(() => {
        if (!promptText) return;
        if (status === 'speaking' && activeTarget === 'prompt') {
            pause();
            return;
        }
        if (status === 'paused' && activeTarget === 'prompt') {
            resume();
            return;
        }
        setActiveTarget('prompt');
        speak(promptText);
    }, [promptText, status, activeTarget, speak, pause, resume]);

    const handlePlayPause = useCallback(() => {
        if (status === 'speaking' && activeTarget === 'essay') {
            pause();
            return;
        }
        if (status === 'paused' && activeTarget === 'essay') {
            resume();
            return;
        }
        setActiveTarget('essay');
        speak(htmlToPlainText(contentHtml));
    }, [contentHtml, status, activeTarget, speak, pause, resume]);

    const handleStop = useCallback(() => {
        stop();
        setActiveTarget(null);
    }, [stop]);

    if (status === 'unsupported') return null;

    const isBusy = status === 'speaking' || status === 'paused';
    const progressPct = totalChars > 0 ? (charIndex / totalChars) * 100 : 0;

    const btnStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
        color: 'var(--text)',
        cursor: 'pointer',
        fontSize: '0.8rem',
        fontWeight: 500,
        whiteSpace: 'nowrap',
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {promptText && (
                <button
                    style={{
                        ...btnStyle,
                        background:
                            activeTarget === 'prompt' && isBusy
                                ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                                : 'var(--bg-elevated)',
                        borderColor: activeTarget === 'prompt' && isBusy ? 'var(--accent)' : 'var(--border)',
                    }}
                    onClick={handleReadPrompt}
                    aria-label={t('tts.read_prompt')}
                    aria-pressed={activeTarget === 'prompt' && isBusy}
                >
                    <BookOpen size={13} aria-hidden="true" />
                    {t('tts.read_prompt_short')}
                </button>
            )}

            <button
                style={{
                    ...btnStyle,
                    background:
                        activeTarget === 'essay' && isBusy
                            ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                            : 'var(--bg-elevated)',
                    borderColor: activeTarget === 'essay' && isBusy ? 'var(--accent)' : 'var(--border)',
                }}
                onClick={handlePlayPause}
                aria-label={
                    status === 'paused' && activeTarget === 'essay'
                        ? t('tts.resume')
                        : status === 'speaking' && activeTarget === 'essay'
                          ? t('tts.pause')
                          : t('tts.play')
                }
                aria-pressed={activeTarget === 'essay' && isBusy}
            >
                {status === 'speaking' && activeTarget === 'essay' ? (
                    <Pause size={13} aria-hidden="true" />
                ) : (
                    <Play size={13} aria-hidden="true" />
                )}
            </button>

            {isBusy && (
                <button style={btnStyle} onClick={handleStop} aria-label={t('tts.stop')}>
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
                    style={{
                        width: 60,
                        height: 4,
                        borderRadius: 2,
                        background: 'var(--border)',
                        overflow: 'hidden',
                        flexShrink: 0,
                    }}
                >
                    <div
                        style={{
                            width: `${progressPct}%`,
                            height: '100%',
                            background: 'var(--accent)',
                            borderRadius: 2,
                            transition: 'width 0.15s linear',
                        }}
                    />
                </div>
            )}
        </div>
    );
}
