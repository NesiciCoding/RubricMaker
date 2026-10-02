import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { sentenceBuilderTiles } from '../../../supabase/functions/_shared/testScoring';
import type { TestQuestion } from '../../types';

interface Props {
    question: TestQuestion;
    value: string;
    onChange: (value: string) => void;
}

const tileStyle = {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    color: 'var(--text)',
    font: 'inherit',
} as const;

/** Click tiles to build the sentence in order; click a placed tile to take it back. */
export default function SentenceBuilderAnswer({ question, value, onChange }: Props) {
    const { t } = useTranslation();
    const tiles = useMemo(() => sentenceBuilderTiles(question), [question]);
    const placed: string[] = useMemo(() => {
        try {
            const parsed: unknown = value ? JSON.parse(value) : [];
            return Array.isArray(parsed) ? parsed.filter((w): w is string => typeof w === 'string') : [];
        } catch {
            return [];
        }
    }, [value]);

    const usedCounts = new Map<string, number>();
    placed.forEach((w) => usedCounts.set(w, (usedCounts.get(w) ?? 0) + 1));
    const seen = new Map<string, number>();
    const tileUsed = tiles.map((w) => {
        const rank = seen.get(w) ?? 0;
        seen.set(w, rank + 1);
        return rank < (usedCounts.get(w) ?? 0);
    });

    const set = (next: string[]) => onChange(next.length ? JSON.stringify(next) : '');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
                role="group"
                aria-label={t('tests.taking.sentence_builder_answer')}
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    minHeight: 44,
                    padding: 10,
                    border: '1px solid var(--border)',
                    borderBottom: '2px solid var(--accent)',
                    borderRadius: 8,
                }}
            >
                {placed.map((word, i) => (
                    <button
                        key={`${word}-${i}`}
                        type="button"
                        style={tileStyle}
                        aria-label={t('tests.taking.sentence_builder_remove', { word })}
                        onClick={() => set(placed.filter((_, k) => k !== i))}
                    >
                        {word}
                    </button>
                ))}
            </div>
            <div
                role="group"
                aria-label={t('tests.taking.sentence_builder_tiles')}
                style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
            >
                {tiles.map((word, i) => (
                    <button
                        key={`${word}-${i}`}
                        type="button"
                        disabled={tileUsed[i]}
                        style={{ ...tileStyle, opacity: tileUsed[i] ? 0.35 : 1 }}
                        onClick={() => set([...placed, word])}
                    >
                        {word}
                    </button>
                ))}
            </div>
            {placed.length > 0 && (
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => set([])}
                >
                    {t('tests.taking.sentence_builder_reset')}
                </button>
            )}
        </div>
    );
}
