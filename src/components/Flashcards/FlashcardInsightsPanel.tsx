import React from 'react';
import { useTranslation } from 'react-i18next';
import type { DeckInsights } from '../../utils/flashcardInsights';

interface Props {
    insights: DeckInsights;
    /** Hide the focus-word list (e.g. in compact teacher table rows). */
    compact?: boolean;
    /** Swaps "Words to focus on" for a kind-neutral label when the deck isn't vocabulary. */
    deckKind?: 'vocabulary' | 'grammar';
}

const STAGES = [
    { key: 'newCount', color: 'var(--text-dim)', labelKey: 'flashcards.stage_new' },
    { key: 'learningCount', color: 'var(--yellow)', labelKey: 'flashcards.stage_learning' },
    { key: 'reviewCount', color: 'var(--teal)', labelKey: 'flashcards.stage_review' },
    { key: 'masteredCount', color: 'var(--green)', labelKey: 'flashcards.stage_mastered' },
] as const;

export default function FlashcardInsightsPanel({ insights, compact = false, deckKind = 'vocabulary' }: Props) {
    const { t, i18n } = useTranslation();
    const total = Math.max(insights.totalCards, 1);

    return (
        <div>
            <div
                role="img"
                aria-label={t('flashcards.progress_bar_label')}
                style={{
                    display: 'flex',
                    height: 8,
                    borderRadius: 4,
                    overflow: 'hidden',
                    background: 'var(--bg-elevated)',
                }}
            >
                {STAGES.map(
                    (stage) =>
                        insights[stage.key] > 0 && (
                            <div
                                key={stage.key}
                                style={{
                                    width: `${(insights[stage.key] / total) * 100}%`,
                                    background: stage.color,
                                }}
                            />
                        )
                )}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: '0.75rem' }}>
                {STAGES.map((stage) => (
                    <span key={stage.key} style={{ color: 'var(--text-muted)' }}>
                        <span
                            style={{
                                display: 'inline-block',
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: stage.color,
                                marginRight: 4,
                            }}
                        />
                        {t(stage.labelKey)}: {insights[stage.key]}
                    </span>
                ))}
                {insights.dueCount > 0 && (
                    <span style={{ color: 'var(--red)', fontWeight: 600 }}>
                        {t('flashcards.due_count', { count: insights.dueCount })}
                    </span>
                )}
            </div>
            {!compact && insights.focusCards.length > 0 && (
                <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                        {t(deckKind === 'grammar' ? 'flashcards.focus_items' : 'flashcards.focus_words')}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {insights.focusCards.map((c) => (
                            <span key={c.id} className="badge badge-yellow" title={c.back}>
                                {c.front}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {!compact && insights.lastStudied && (
                <div style={{ marginTop: 8, fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                    {t('flashcards.last_studied', {
                        date: new Date(insights.lastStudied).toLocaleDateString(i18n.language),
                    })}
                </div>
            )}
        </div>
    );
}
