import React, { useMemo, useState } from 'react';
import { RotateCcw, PartyPopper, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FlashcardCard, FlashcardCardState, FlashcardDeck } from '../../types';
import { buildStudyQueue, previewIntervals, rateCard, type FlashcardRating } from '../../utils/flashcardScheduler';

interface Props {
    deck: FlashcardDeck;
    initialStates: Record<string, FlashcardCardState>;
    /** Called after every rating with the full updated state map. Omit for teacher preview. */
    onStatesChange?: (states: Record<string, FlashcardCardState>) => void;
    onExit?: () => void;
}

/** Cards rescheduled within this window (learning steps) come back later in the same session. */
const REQUEUE_WINDOW_MS = 10 * 60 * 1000;

const RATING_BUTTONS: { rating: FlashcardRating; labelKey: string; color: string }[] = [
    { rating: 1, labelKey: 'flashcards.rate_again', color: 'var(--red)' },
    { rating: 2, labelKey: 'flashcards.rate_hard', color: 'var(--yellow)' },
    { rating: 3, labelKey: 'flashcards.rate_good', color: 'var(--teal)' },
    { rating: 4, labelKey: 'flashcards.rate_easy', color: 'var(--green)' },
];

export default function FlashcardStudySession({ deck, initialStates, onStatesChange, onExit }: Props) {
    const { t } = useTranslation();
    const initialQueue = useMemo(() => {
        const review = { id: '', deckId: deck.id, studentId: '', cardStates: initialStates, updatedAt: '' };
        const q = buildStudyQueue(deck, review);
        return [...q.due, ...q.fresh];
        // Deliberately frozen at mount: rating cards must not rebuild the queue mid-session.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deck.id]);

    const [queue, setQueue] = useState<FlashcardCard[]>(initialQueue);
    const [states, setStates] = useState(initialStates);
    const [revealed, setRevealed] = useState(false);
    const [reviewedCount, setReviewedCount] = useState(0);
    const [againCount, setAgainCount] = useState(0);
    const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

    const card = queue[0];
    const intervals = useMemo(() => (card ? previewIntervals(states[card.id]) : null), [card, states]);
    // Session progress: reviews landed vs. what's still pending (reaches 100% when the queue drains).
    const progressPct =
        reviewedCount + queue.length > 0 ? Math.round((reviewedCount / (reviewedCount + queue.length)) * 100) : 0;

    function handleRate(rating: FlashcardRating) {
        if (!card) return;
        const now = new Date();
        const nextState = rateCard(states[card.id], rating, now);
        const nextStates = { ...states, [card.id]: nextState };
        setStates(nextStates);
        onStatesChange?.(nextStates);
        setReviewedCount((n) => n + 1);
        setReviewedIds((prev) => (prev.has(card.id) ? prev : new Set(prev).add(card.id)));
        if (rating === 1) setAgainCount((n) => n + 1);

        const dueAgainSoon = new Date(nextState.due).getTime() - now.getTime() < REQUEUE_WINDOW_MS;
        setQueue((q) => (dueAgainSoon ? [...q.slice(1), card] : q.slice(1)));
        setRevealed(false);
    }

    if (!card) {
        return (
            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                <PartyPopper size={40} style={{ color: 'var(--green)' }} />
                <h3 style={{ marginTop: 12 }}>{t('flashcards.session_done_title')}</h3>
                <p className="text-muted text-sm">
                    {reviewedCount > 0
                        ? t('flashcards.session_done_summary', { count: reviewedCount, again: againCount })
                        : t('flashcards.session_nothing_due')}
                </p>
                {onExit && (
                    <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={onExit}>
                        {t('common.close')}
                    </button>
                )}
            </div>
        );
    }

    // Phonetic / part of speech are vocabulary concepts; grammar decks never show them,
    // even if a card retains the fields from before its deck was switched to grammar.
    const meta = deck.deckKind !== 'grammar' ? [card.phonetic, card.partOfSpeech].filter(Boolean).join(' · ') : '';

    return (
        <div
            style={{
                display: 'flex',
                gap: 24,
                maxWidth: 980,
                margin: '0 auto',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
            }}
        >
            <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ marginBottom: 16 }}>
                    <div
                        role="progressbar"
                        aria-valuenow={progressPct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={t('flashcards.study_progress_label')}
                        style={{
                            height: 8,
                            borderRadius: 999,
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            overflow: 'hidden',
                        }}
                    >
                        <div
                            style={{
                                width: `${progressPct}%`,
                                height: '100%',
                                background: 'var(--accent)',
                                transition: 'width var(--transition)',
                            }}
                        />
                    </div>
                    <div
                        style={{
                            marginTop: 6,
                            fontSize: '0.72rem',
                            color: 'var(--text-muted)',
                            textAlign: 'center',
                        }}
                    >
                        {t('flashcards.study_progress_count', { done: reviewedCount, remaining: queue.length })}
                    </div>
                </div>

                <div
                    className="card"
                    style={{ textAlign: 'center', padding: '40px 24px', cursor: revealed ? 'default' : 'pointer' }}
                    onClick={() => !revealed && setRevealed(true)}
                    {...(!revealed
                        ? {
                              role: 'button' as const,
                              tabIndex: 0,
                              'aria-label': t('flashcards.show_answer'),
                              onKeyDown: (e: React.KeyboardEvent) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setRevealed(true);
                                  }
                              },
                          }
                        : {})}
                >
                    <div data-testid="study-card-front" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                        {card.front}
                    </div>
                    {meta && <div style={{ marginTop: 6, fontSize: '0.9rem', color: 'var(--text-muted)' }}>{meta}</div>}
                    {revealed && (
                        <>
                            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />
                            <div style={{ fontSize: '1.2rem' }}>{card.back}</div>
                            {card.example && (
                                <div
                                    style={{
                                        marginTop: 12,
                                        fontSize: '0.85rem',
                                        color: 'var(--text-muted)',
                                        fontStyle: 'italic',
                                    }}
                                >
                                    {card.example}
                                </div>
                            )}
                        </>
                    )}
                </div>
                <div style={{ marginTop: 16 }}>
                    {revealed ? (
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                            {RATING_BUTTONS.map(({ rating, labelKey, color }) => (
                                <button
                                    key={rating}
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ minWidth: 96, borderColor: color, flexDirection: 'column', gap: 2 }}
                                    onClick={() => handleRate(rating)}
                                >
                                    <span style={{ color, fontWeight: 600 }}>{t(labelKey)}</span>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                        {intervals?.[rating]}
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center' }}>
                            <button type="button" className="btn btn-primary" onClick={() => setRevealed(true)}>
                                <RotateCcw size={15} /> {t('flashcards.show_answer')}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <aside style={{ width: 220, flexShrink: 0, alignSelf: 'stretch' }} aria-label={t('flashcards.deck_words')}>
                <div
                    style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                        color: 'var(--text-muted)',
                        marginBottom: 8,
                    }}
                >
                    {t('flashcards.deck_words')}
                </div>
                <ul
                    style={{
                        listStyle: 'none',
                        margin: 0,
                        padding: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                    }}
                >
                    {deck.cards.map((c) => {
                        const isCurrent = c.id === card.id;
                        const isReviewed = reviewedIds.has(c.id);
                        return (
                            <li
                                key={c.id}
                                aria-current={isCurrent ? 'true' : undefined}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '5px 8px',
                                    borderRadius: 6,
                                    fontSize: '0.8rem',
                                    background: isCurrent ? 'var(--accent-soft)' : 'transparent',
                                    color: isCurrent ? 'var(--accent)' : 'var(--text)',
                                    fontWeight: isCurrent ? 600 : 400,
                                }}
                            >
                                <span
                                    style={{
                                        width: 14,
                                        flexShrink: 0,
                                        color: 'var(--green)',
                                        display: 'inline-flex',
                                    }}
                                >
                                    {isReviewed && <Check size={13} />}
                                </span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {c.front}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </aside>
        </div>
    );
}
