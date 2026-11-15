import { useTranslation } from 'react-i18next';
import { KEY_WORD_DEFAULT_LIMIT, answerWordCount } from '../../../supabase/functions/_shared/testScoring';
import type { TestQuestion } from '../../types';

interface Props {
    question: TestQuestion;
    value: string;
    onChange: (value: string) => void;
    /** Effective content language of the question (BCP-47 base code). */
    lang?: string;
}

/** Complete the second sentence with the key word unchanged, inside the word limit. */
export default function KeyWordAnswer({ question, value, onChange, lang }: Props) {
    const { t } = useTranslation();
    const limit = question.answerWordLimit ?? KEY_WORD_DEFAULT_LIMIT;
    const words = answerWordCount(value);
    const outside = words > 0 && (words < limit.min || words > limit.max);
    const [before, after] = (question.gappedSentence ?? '').split(/_{3,}/, 2);
    const hasGap = /_{3,}/.test(question.gappedSentence ?? '');
    const input = (
        <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={t('tests.taking.kwt_answer_label')}
            lang={lang ?? 'en'}
            style={{
                margin: '0 6px',
                padding: '4px 8px',
                minWidth: 220,
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: '0.95rem',
            }}
        />
    );
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {question.keyWord && (
                <div
                    style={{
                        alignSelf: 'flex-start',
                        padding: '4px 14px',
                        border: '2px solid var(--border)',
                        borderRadius: 6,
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                    }}
                >
                    {question.keyWord}
                </div>
            )}
            <p lang={lang ?? 'en'} style={{ margin: 0, lineHeight: 2.2, color: 'var(--text)' }}>
                {hasGap ? (
                    <>
                        {before}
                        {input}
                        {after}
                    </>
                ) : (
                    <>
                        {question.gappedSentence} {input}
                    </>
                )}
            </p>
            <span
                role="status"
                className="text-sm"
                style={{ color: outside ? 'var(--red-text)' : 'var(--text-muted)' }}
            >
                {t('tests.taking.kwt_word_count', { count: words, min: limit.min, max: limit.max })}
                {outside ? ` — ${t('tests.taking.kwt_out_of_limit')}` : ''}
            </span>
        </div>
    );
}
