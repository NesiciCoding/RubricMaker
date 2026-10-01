import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { parseErrorPassage, stripErrorKey } from '../../../supabase/functions/_shared/testScoring';
import type { TestQuestion } from '../../types';

interface Props {
    question: TestQuestion;
    value: string;
    onChange: (value: string) => void;
}

/** Select the fragments you think are wrong, then type a correction for each. */
export default function ErrorCorrectionAnswer({ question, value, onChange }: Props) {
    const { t } = useTranslation();
    const segments = useMemo(
        () => parseErrorPassage(stripErrorKey(question.errorPassage ?? '')),
        [question.errorPassage]
    );
    const picks: Record<string, string> = useMemo(() => {
        try {
            const parsed: unknown = value ? JSON.parse(value) : {};
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? (parsed as Record<string, string>)
                : {};
        } catch {
            return {};
        }
    }, [value]);

    function toggle(index: number) {
        const next = { ...picks };
        if (index in next) delete next[index];
        else next[index] = '';
        onChange(JSON.stringify(next));
    }

    return (
        <div>
            <p className="text-muted text-sm" style={{ margin: '0 0 8px' }}>
                {t('tests.taking.error_correction_instruction')}
            </p>
            <p style={{ margin: 0, lineHeight: 2.4, color: 'var(--text)' }}>
                {segments.map((segment, i) => {
                    if (segment.type === 'text') return <span key={i}>{segment.text}</span>;
                    const picked = segment.index in picks;
                    return (
                        <span key={i}>
                            <button
                                type="button"
                                aria-pressed={picked}
                                onClick={() => toggle(segment.index)}
                                style={{
                                    padding: '1px 4px',
                                    borderRadius: 4,
                                    border: picked ? '1px solid var(--accent)' : '1px dashed var(--border)',
                                    background: picked
                                        ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                                        : 'transparent',
                                    color: 'var(--text)',
                                    textDecoration: picked ? 'line-through' : 'none',
                                    font: 'inherit',
                                    cursor: 'pointer',
                                }}
                            >
                                {segment.text}
                            </button>
                            {picked && (
                                <input
                                    type="text"
                                    value={picks[segment.index]}
                                    onChange={(e) =>
                                        onChange(JSON.stringify({ ...picks, [segment.index]: e.target.value }))
                                    }
                                    aria-label={t('tests.taking.error_correction_input', { text: segment.text })}
                                    placeholder={t('tests.taking.error_correction_placeholder')}
                                    style={{ margin: '0 6px', width: 140, padding: '2px 6px' }}
                                />
                            )}
                        </span>
                    );
                })}
            </p>
        </div>
    );
}
