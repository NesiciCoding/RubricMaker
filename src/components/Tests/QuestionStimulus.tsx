import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbulb } from 'lucide-react';
import LimitedAudio from './LimitedAudio';
import RichNote from './RichNote';
import { safeAudioSrc, safeImgSrc } from '../../utils/safeMediaSrc';
import type { TestQuestion } from '../../types';

interface Props {
    question: TestQuestion;
    lang?: string;
    /** Plays already recorded for this question, when the caller keeps them across questions. */
    plays?: number;
    onPlay?: (count: number) => void;
}

/**
 * The media and hint a student meets before answering — image, audio stimulus (or the dictation
 * recording) and the hint toggle — shared by the student runner and the builder's student view.
 */
export default function QuestionStimulus({ question, lang, plays = 0, onPlay }: Props) {
    const { t } = useTranslation();
    const [hintQuestionId, setHintQuestionId] = useState<string | null>(null);
    const hintVisible = hintQuestionId === question.id;
    const image = safeImgSrc(question.imageUrl);
    const audio = safeAudioSrc(question.audioUrl);
    const isDictation = question.type === 'dictation';

    return (
        <>
            {image && (
                <img
                    src={image}
                    alt={t('tests.taking.question_image_alt')}
                    style={{
                        display: 'block',
                        maxWidth: '100%',
                        maxHeight: 320,
                        borderRadius: 8,
                        objectFit: 'contain',
                        border: '1px solid var(--border)',
                        marginBottom: 16,
                    }}
                />
            )}

            {isDictation ? (
                <div style={{ marginBottom: 16 }}>
                    <LimitedAudio
                        src={audio}
                        spokenText={audio ? undefined : question.dictationText}
                        maxPlays={question.maxPlays}
                        plays={plays}
                        onPlay={onPlay ?? (() => {})}
                        lang={lang ?? 'en'}
                        label={t('tests.taking.dictation_play')}
                    />
                </div>
            ) : (
                (audio || question.spokenText) && (
                    <div style={{ marginBottom: 16 }}>
                        <LimitedAudio
                            src={audio}
                            spokenText={question.spokenText}
                            maxPlays={question.maxPlays}
                            plays={plays}
                            onPlay={onPlay ?? (() => {})}
                            lang={lang ?? 'en'}
                            label={t('tests.taking.question_audio_alt')}
                        />
                    </div>
                )
            )}

            {question.hint && (
                <div style={{ marginBottom: 16 }}>
                    <button
                        type="button"
                        aria-expanded={hintVisible}
                        onClick={() => setHintQuestionId(hintVisible ? null : question.id)}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            background: 'none',
                            border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                            borderRadius: 6,
                            padding: '4px 10px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: 'var(--accent-text)',
                            cursor: 'pointer',
                        }}
                    >
                        <Lightbulb size={13} />
                        {hintVisible ? t('tests.taking.hint_hide') : t('tests.taking.hint_show')}
                    </button>
                    {hintVisible && (
                        <div
                            lang={lang ?? 'en'}
                            style={{
                                marginTop: 8,
                                padding: '10px 14px',
                                background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                                borderRadius: 8,
                                fontSize: '0.9rem',
                                color: 'var(--text)',
                                lineHeight: 1.55,
                            }}
                        >
                            <RichNote text={question.hint} lang={lang ?? 'en'} />
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
