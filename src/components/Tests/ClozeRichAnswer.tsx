import { createElement, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { sanitisedRichClozeBody, splitGapMarkers } from '../../utils/clozeHtml';
import { seededShuffle } from '../../utils/seededShuffle';
import type { ClozeGap } from '../../utils/clozeParse';
import type { TestQuestion } from '../../types';

interface Props {
    question: TestQuestion;
    value: string;
    onChange: (value: string) => void;
    code: string;
    lang?: string;
}

const CONTROL: React.CSSProperties = {
    margin: '0 4px',
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--text)',
    borderRadius: 6,
    fontSize: '0.95rem',
};

/** The tags a formatted cloze prompt can contain; anything else sanitising let through renders as its children only. */
const VOID_TAGS = new Set(['BR']);
const FORMAT_TAGS = new Set([
    'P',
    'STRONG',
    'B',
    'EM',
    'I',
    'U',
    'S',
    'SUB',
    'SUP',
    'UL',
    'OL',
    'LI',
    'SPAN',
    'DIV',
    'BR',
]);

/** Converts the sanitised DOM into React elements, putting `renderGap` where each gap marker sits. */
function toReact(node: ChildNode, gaps: ClozeGap[], renderGap: (gap: ClozeGap) => ReactNode, key: string): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) {
        const parts = splitGapMarkers(node.textContent ?? '');
        return parts.map((part, i) =>
            typeof part === 'string' ? (
                <span key={`${key}.${i}`}>{part}</span>
            ) : gaps[part.index] ? (
                <span key={`${key}.${i}`}>{renderGap(gaps[part.index])}</span>
            ) : null
        );
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const element = node as Element;
    const children = Array.from(element.childNodes).map((child, i) => toReact(child, gaps, renderGap, `${key}.${i}`));
    if (!FORMAT_TAGS.has(element.tagName)) return <span key={key}>{children}</span>;
    const tag = element.tagName.toLowerCase();
    return VOID_TAGS.has(element.tagName) ? createElement(tag, { key }) : createElement(tag, { key }, children);
}

/** A formatted cloze prompt: the same gap controls as the plain version, inside the formatting the teacher gave the text. */
export default function ClozeRichAnswer({ question, value, onChange, code, lang }: Props) {
    const { t } = useTranslation();
    const { body, gaps } = useMemo(() => sanitisedRichClozeBody(question.prompt), [question.prompt]);
    const answers: Record<string, string> = useMemo(() => {
        try {
            return value ? (JSON.parse(value) as Record<string, string>) : {};
        } catch {
            return {};
        }
    }, [value]);
    const [selected, setSelected] = useState<number | null>(null);

    const bank = question.type === 'cloze-bank';
    const dropdown = question.type === 'cloze-dropdown';
    const unique = question.bankUniqueUse ?? true;

    const tiles = useMemo(
        () =>
            bank
                ? seededShuffle(
                      [...gaps.flatMap((g) => g.alternatives), ...(question.bankDistractors ?? [])].filter(Boolean),
                      `${code}-${question.id}-bank`
                  )
                : [],
        [bank, gaps, question.bankDistractors, code, question.id]
    );
    const used = new Map<string, number>();
    Object.values(answers).forEach((text) => used.set(text, (used.get(text) ?? 0) + 1));
    const seen = new Map<string, number>();
    const tileUsed = tiles.map((text) => {
        const rank = seen.get(text) ?? 0;
        seen.set(text, rank + 1);
        return unique && rank < (used.get(text) ?? 0);
    });

    const setAnswer = (index: number, text: string) => onChange(JSON.stringify({ ...answers, [index]: text }));
    const clearAnswer = (index: number) => {
        const next = { ...answers };
        delete next[index];
        onChange(JSON.stringify(next));
    };

    function renderGap(gap: ClozeGap): ReactNode {
        const label = t('tests.taking.cloze_bank_gap_label', { number: gap.index + 1 });
        const current = answers[gap.index] ?? '';
        if (dropdown) {
            const seenChoice = new Set<string>();
            const choices = seededShuffle(
                gap.alternatives.filter((choice) => {
                    const key = choice.trim().toLowerCase();
                    if (!key || seenChoice.has(key)) return false;
                    seenChoice.add(key);
                    return true;
                }),
                `${code}-${question.id}-${gap.index}`
            );
            return (
                <select
                    value={current}
                    aria-label={label}
                    onChange={(e) => setAnswer(gap.index, e.target.value)}
                    style={{ ...CONTROL, padding: '4px 8px' }}
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
        if (bank) {
            return (
                <button
                    type="button"
                    aria-label={
                        current
                            ? t('tests.taking.cloze_bank_gap_filled', { number: gap.index + 1, answer: current })
                            : label
                    }
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        e.preventDefault();
                        const dragged = Number(e.dataTransfer.getData('text/plain'));
                        if (Number.isInteger(dragged) && tiles[dragged] !== undefined && !tileUsed[dragged]) {
                            setAnswer(gap.index, tiles[dragged]);
                            setSelected(null);
                        }
                    }}
                    onClick={() => {
                        if (selected !== null && !tileUsed[selected]) {
                            setAnswer(gap.index, tiles[selected]);
                            setSelected(null);
                        } else if (current) clearAnswer(gap.index);
                    }}
                    style={{
                        ...CONTROL,
                        minWidth: 80,
                        padding: '2px 10px',
                        borderBottom: '2px solid var(--accent)',
                        background: current ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--bg)',
                    }}
                >
                    {current || `(${gap.index + 1})`}
                </button>
            );
        }
        return (
            <input
                type="text"
                value={current}
                onChange={(e) => setAnswer(gap.index, e.target.value)}
                placeholder={t('tests.taking.cloze_gap_placeholder')}
                aria-label={label}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                style={{ ...CONTROL, padding: '4px 8px', width: 120 }}
            />
        );
    }

    const text = (
        <div
            lang={lang ?? 'en'}
            className="rm-cloze-rich"
            style={{ fontSize: '1rem', lineHeight: 2.2, color: 'var(--text)' }}
        >
            {Array.from(body.childNodes).map((child, i) => toReact(child, gaps, renderGap, String(i)))}
        </div>
    );
    if (!bank) return text;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            {text}
        </div>
    );
}
