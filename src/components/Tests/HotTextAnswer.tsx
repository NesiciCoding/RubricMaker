import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { parseHotTextFragments } from '../../utils/clozeParse';
import type { TestQuestion } from '../../types';

interface Props {
    question: TestQuestion;
    value: string;
    onChange: (value: string) => void;
    /** Effective content language of the question (BCP-47 base code). */
    lang?: string;
}

/** Click the selectable fragments inside the passage; selection is stored as fragment indexes. */
export default function HotTextAnswer({ question, value, onChange, lang }: Props) {
    const { t } = useTranslation();
    const segments = useMemo(() => parseHotTextFragments(question.hotTextPassage ?? ''), [question.hotTextPassage]);
    const selected: number[] = useMemo(() => {
        try {
            return value ? (JSON.parse(value) as number[]) : [];
        } catch {
            return [];
        }
    }, [value]);

    function toggle(index: number) {
        const next = selected.includes(index) ? selected.filter((i) => i !== index) : [...selected, index];
        onChange(JSON.stringify(next));
    }

    return (
        <div>
            <p className="text-muted text-xs" style={{ margin: '0 0 8px' }}>
                {t('tests.taking.hot_text_instruction')}
            </p>
            <p lang={lang ?? 'en'} style={{ margin: 0, fontSize: '1rem', lineHeight: 2, color: 'var(--text)' }}>
                {segments.map((segment, i) => {
                    if (segment.type === 'text') {
                        return <span key={i}>{segment.text}</span>;
                    }
                    const isSelected = selected.includes(segment.index);
                    return (
                        <span
                            key={i}
                            role="button"
                            tabIndex={0}
                            aria-pressed={isSelected}
                            onClick={() => toggle(segment.index)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    toggle(segment.index);
                                }
                            }}
                            style={{
                                display: 'inline',
                                margin: '0 2px',
                                padding: '2px 4px',
                                borderRadius: 4,
                                cursor: 'pointer',
                                background: isSelected
                                    ? 'color-mix(in srgb, var(--accent) 25%, transparent)'
                                    : 'color-mix(in srgb, var(--text-muted) 12%, transparent)',
                                border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                            }}
                        >
                            {segment.text}
                        </span>
                    );
                })}
            </p>
        </div>
    );
}
