import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { renderClozeSegments } from '../../utils/clozeParse';
import { seededShuffle } from '../../utils/seededShuffle';
import type { TestQuestion } from '../../types';

interface Props {
    question: TestQuestion;
    value: string;
    onChange: (value: string) => void;
    code: string;
    /** Effective content language of the question (BCP-47 base code). */
    lang?: string;
}

/** Fill each gap inline; the word-bank variant adds draggable tiles above the text. */
export default function ClozeAnswer({ question, value, onChange, code, lang }: Props) {
    if (question.type === 'cloze-bank')
        return <ClozeBankAnswer question={question} value={value} onChange={onChange} code={code} lang={lang} />;
    return <ClozeInlineAnswer question={question} value={value} onChange={onChange} code={code} lang={lang} />;
}

function ClozeBankAnswer({ question, value, onChange, code, lang }: Props) {
    const { t } = useTranslation();
    const segments = useMemo(() => renderClozeSegments(question.prompt), [question.prompt]);
    const tiles = useMemo(
        () =>
            seededShuffle(
                [
                    ...segments.flatMap((s) => (s.type === 'gap' ? s.gap.alternatives : [])),
                    ...(question.bankDistractors ?? []),
                ].filter(Boolean),
                `${code}-${question.id}-bank`
            ),
        [segments, question.bankDistractors, code, question.id]
    );
    const answers: Record<string, string> = useMemo(() => {
        try {
            return value ? (JSON.parse(value) as Record<string, string>) : {};
        } catch {
            return {};
        }
    }, [value]);
    const [selected, setSelected] = useState<number | null>(null);
    const unique = question.bankUniqueUse ?? true;

    const usedCounts = new Map<string, number>();
    Object.values(answers).forEach((text) => usedCounts.set(text, (usedCounts.get(text) ?? 0) + 1));
    const seenSoFar = new Map<string, number>();
    const tileUsed = tiles.map((text) => {
        const rank = seenSoFar.get(text) ?? 0;
        seenSoFar.set(text, rank + 1);
        return unique && rank < (usedCounts.get(text) ?? 0);
    });

    function place(gapIndex: number, tileIndex: number) {
        if (tileUsed[tileIndex]) return;
        onChange(JSON.stringify({ ...answers, [gapIndex]: tiles[tileIndex] }));
        setSelected(null);
    }

    function clear(gapIndex: number) {
        const next = { ...answers };
        delete next[gapIndex];
        onChange(JSON.stringify(next));
    }

    return (
        <div lang={lang ?? 'en'} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
                role="group"
                aria-label={t('tests.taking.cloze_bank_tiles_label')}
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    padding: 10,
                    border: '1px dashed var(--border)',
                    borderRadius: 8,
                }}
            >
                {tiles.map((tile, i) => (
                    <button
                        key={`${tile}-${i}`}
                        type="button"
                        draggable={!tileUsed[i]}
                        disabled={tileUsed[i]}
                        aria-pressed={selected === i}
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
                        onClick={() => setSelected(selected === i ? null : i)}
                        style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: selected === i ? '2px solid var(--accent)' : '1px solid var(--border)',
                            background: 'var(--bg-elevated)',
                            color: 'var(--text)',
                            opacity: tileUsed[i] ? 0.4 : 1,
                            cursor: tileUsed[i] ? 'default' : 'grab',
                        }}
                    >
                        {tile}
                    </button>
                ))}
            </div>
            <p style={{ margin: 0, fontSize: '1rem', lineHeight: 2.4, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                {segments.map((segment, i) => {
                    if (segment.type === 'text') return <span key={i}>{segment.text}</span>;
                    const gapIndex = segment.gap.index;
                    const current = answers[gapIndex];
                    return (
                        <button
                            key={i}
                            type="button"
                            aria-label={
                                current
                                    ? t('tests.taking.cloze_bank_gap_filled', { number: gapIndex + 1, answer: current })
                                    : t('tests.taking.cloze_bank_gap_label', { number: gapIndex + 1 })
                            }
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                const dragged = Number(e.dataTransfer.getData('text/plain'));
                                if (Number.isInteger(dragged) && tiles[dragged] !== undefined) place(gapIndex, dragged);
                            }}
                            onClick={() => {
                                if (selected !== null) place(gapIndex, selected);
                                else if (current) clear(gapIndex);
                            }}
                            style={{
                                margin: '0 4px',
                                minWidth: 80,
                                padding: '2px 10px',
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                borderBottom: '2px solid var(--accent)',
                                background: current
                                    ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                                    : 'var(--bg)',
                                color: 'var(--text)',
                            }}
                        >
                            {current || `(${gapIndex + 1})`}
                        </button>
                    );
                })}
            </p>
        </div>
    );
}

/** Dropdown options keep their authored order but never repeat: one option, one `<option>`. */
function uniqueOptions(options: string[]): string[] {
    const seen = new Set<string>();
    return options.filter((option) => {
        const key = option.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function ClozeInlineAnswer({ question, value, onChange, code, lang }: Props) {
    const { t } = useTranslation();
    const segments = useMemo(() => renderClozeSegments(question.prompt), [question.prompt]);
    const answers: Record<string, string> = useMemo(() => {
        try {
            return value ? (JSON.parse(value) as Record<string, string>) : {};
        } catch {
            return {};
        }
    }, [value]);

    function setGapAnswer(gapIndex: number, gapValue: string) {
        onChange(JSON.stringify({ ...answers, [gapIndex]: gapValue }));
    }

    return (
        <p
            lang={lang ?? 'en'}
            style={{ margin: 0, fontSize: '1rem', lineHeight: 2.4, color: 'var(--text)', whiteSpace: 'pre-wrap' }}
        >
            {segments.map((segment, i) => {
                if (segment.type === 'text') {
                    return <span key={i}>{segment.text}</span>;
                }
                const gap = segment.gap;
                const current = answers[gap.index] ?? '';
                if (question.type === 'cloze-dropdown') {
                    const choices = seededShuffle(
                        uniqueOptions(gap.alternatives),
                        `${code}-${question.id}-${gap.index}`
                    );
                    return (
                        <select
                            key={i}
                            value={current}
                            aria-label={t('tests.taking.cloze_bank_gap_label', { number: gap.index + 1 })}
                            onChange={(e) => setGapAnswer(gap.index, e.target.value)}
                            style={{
                                margin: '0 4px',
                                padding: '4px 8px',
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                background: 'var(--bg)',
                                color: 'var(--text)',
                                fontSize: '0.95rem',
                            }}
                        >
                            <option value="">{t('tests.taking.cloze_dropdown_placeholder')}</option>
                            {choices.map((choice) => (
                                <option key={choice} value={choice}>
                                    {choice}
                                </option>
                            ))}
                        </select>
                    );
                }
                return (
                    <input
                        key={i}
                        type="text"
                        value={current}
                        onChange={(e) => setGapAnswer(gap.index, e.target.value)}
                        placeholder={t('tests.taking.cloze_gap_placeholder')}
                        aria-label={t('tests.taking.cloze_bank_gap_label', { number: gap.index + 1 })}
                        autoCapitalize="off"
                        autoCorrect="off"
                        autoComplete="off"
                        spellCheck={false}
                        style={{
                            margin: '0 4px',
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--bg)',
                            color: 'var(--text)',
                            fontSize: '0.95rem',
                            maxWidth: '100%',
                            ...({ fieldSizing: 'content' } as object),
                            minWidth: 120,
                        }}
                    />
                );
            })}
        </p>
    );
}
