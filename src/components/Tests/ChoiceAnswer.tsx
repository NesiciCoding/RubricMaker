import { useTranslation } from 'react-i18next';
import { OptionAudioButton } from './LimitedAudio';
import { safeAudioSrc, safeImgSrc } from '../../utils/safeMediaSrc';
import { displayOptions } from '../../utils/optionOrder';
import type { TestOption, TestQuestion } from '../../types';

interface Props {
    question: TestQuestion;
    value: string;
    onChange: (value: string) => void;
    /** Effective content language of the question (BCP-47 base code). */
    lang?: string;
    /** Seed for the per-student option shuffle. */
    code?: string;
}

function rowStyle(selected: boolean) {
    return {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: selected ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--bg)',
        cursor: 'pointer',
    } as const;
}

function OptionMedia({ option, lang }: { option: TestOption; lang?: string }) {
    const { t } = useTranslation();
    const imgSrc = safeImgSrc(option.imageUrl);
    return (
        <>
            {imgSrc && (
                <img
                    src={imgSrc}
                    alt={option.text ? '' : t('tests.taking.option_image_fallback')}
                    style={{ maxWidth: 80, maxHeight: 60, borderRadius: 4, objectFit: 'contain' }}
                />
            )}
            <span lang={lang ?? 'en'} style={{ color: 'var(--text)' }}>
                {option.text}
            </span>
            <OptionAudioButton
                src={safeAudioSrc(option.audioUrl)}
                spokenText={option.spokenText}
                lang={lang ?? 'en'}
                label={t('tests.taking.option_audio_play')}
            />
        </>
    );
}

/** One answer from a radio list; each option can carry an image, audio, or a spoken label. */
export function MultipleChoiceAnswer({ question, value, onChange, lang, code = '' }: Props) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayOptions(question, code).map((opt) => (
                <label key={opt.id} style={rowStyle(value === opt.id)}>
                    <input
                        type="radio"
                        name={`q-${question.id}`}
                        value={opt.id}
                        checked={value === opt.id}
                        onChange={() => onChange(opt.id)}
                    />
                    <OptionMedia option={opt} lang={lang} />
                </label>
            ))}
        </div>
    );
}

/** Any number of correct answers from a checkbox list. */
export function MultipleResponseAnswer({ question, value, onChange, lang, code = '' }: Props) {
    const selected: string[] = value ? (JSON.parse(value) as string[]) : [];
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayOptions(question, code).map((opt) => {
                const checked = selected.includes(opt.id);
                return (
                    <label key={opt.id} style={rowStyle(checked)}>
                        <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                                const next = checked ? selected.filter((id) => id !== opt.id) : [...selected, opt.id];
                                onChange(JSON.stringify(next));
                            }}
                        />
                        <OptionMedia option={opt} lang={lang} />
                    </label>
                );
            })}
        </div>
    );
}
