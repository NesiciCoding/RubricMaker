import { useId } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
    value: string;
    onChange: (value: string) => void;
    /** Effective content language of the question (BCP-47 base code). */
    lang?: string;
}

/** A one-line text answer, auto-scored against the model answer when there is one. */
export function ShortAnswerInput({ value, onChange, lang }: Props) {
    const { t } = useTranslation();
    return (
        <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('tests.taking.short_answer_placeholder')}
            lang={lang ?? 'en'}
            style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: '0.95rem',
                background: 'var(--bg)',
                color: 'var(--text)',
            }}
        />
    );
}

/** A number, scored within the question's tolerance; an optional unit sits after the box. */
export function NumericInput({ value, onChange, lang, unit }: Props & { unit?: string }) {
    const { t } = useTranslation();
    const unitId = useId();
    const trimmedUnit = unit?.trim();
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
                type="number"
                step="any"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={t('tests.taking.numeric_placeholder')}
                aria-describedby={trimmedUnit ? unitId : undefined}
                lang={lang ?? 'en'}
                style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    fontSize: '0.95rem',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                }}
            />
            {trimmedUnit && (
                <span id={unitId} style={{ color: 'var(--text)', fontSize: '0.95rem' }}>
                    {trimmedUnit}
                </span>
            )}
        </div>
    );
}

/** What the student heard, typed into a textarea for word-level comparison. */
export function DictationAnswer({ value, onChange, lang }: Props) {
    const { t } = useTranslation();
    return (
        <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('tests.taking.dictation_placeholder')}
            aria-label={t('tests.taking.dictation_placeholder')}
            lang={lang ?? 'en'}
            rows={3}
            style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: '0.95rem',
                resize: 'vertical',
                background: 'var(--bg)',
                color: 'var(--text)',
            }}
        />
    );
}

/** Free writing with a live word count; marked by hand. */
export function OpenAnswer({ value, onChange, lang }: Props) {
    const { t } = useTranslation();
    const wordCount = value.trim() ? value.trim().split(/\s+/).filter(Boolean).length : null;
    return (
        <>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={t('tests.taking.open_answer_placeholder')}
                lang={lang ?? 'en'}
                rows={6}
                style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    fontSize: '0.95rem',
                    resize: 'vertical',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontFamily: 'inherit',
                }}
            />
            {wordCount !== null && (
                <div
                    style={{
                        textAlign: 'right',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        marginTop: 4,
                    }}
                >
                    {t('tests.taking.word_count', { count: wordCount })}
                </div>
            )}
        </>
    );
}
