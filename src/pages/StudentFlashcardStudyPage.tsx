import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { useDbStatus } from '../hooks/useDbStatus';
import FlashcardStudySession from '../components/Flashcards/FlashcardStudySession';
import FlashcardInsightsPanel from '../components/Flashcards/FlashcardInsightsPanel';
import { computeDeckInsights } from '../utils/flashcardInsights';
import type { FlashcardCardState, FlashcardDeck, FlashcardReview } from '../types';

export default function StudentFlashcardStudyPage() {
    const { studentId, deckId } = useParams<{ studentId: string; deckId: string }>();
    const { t } = useTranslation();
    const {
        students,
        settings,
        flashcardDecks,
        flashcardReviews,
        saveFlashcardReview,
        fetchAssignedFlashcardDeck,
        fetchMyFlashcardReview,
        saveFlashcardReviewAsStudent,
    } = useApp();
    const { isConnected } = useDbStatus();

    const student = students.find((s) => s.id === studentId);
    const localDeck = flashcardDecks.find((d) => d.id === deckId) ?? null;
    const localReview = flashcardReviews.find((r) => r.id === `${deckId}:${studentId}`) ?? null;

    const [remoteDeck, setRemoteDeck] = useState<FlashcardDeck | null>(null);
    const [remoteReview, setRemoteReview] = useState<FlashcardReview | null>(null);
    const [loading, setLoading] = useState(isConnected && !localDeck);
    const [saveFailed, setSaveFailed] = useState(false);

    useEffect(() => {
        if (!isConnected || !deckId || !studentId) return;
        let cancelled = false;
        Promise.all([fetchAssignedFlashcardDeck(deckId), fetchMyFlashcardReview(deckId, studentId)])
            .then(([deck, review]) => {
                if (cancelled) return;
                if (deck) setRemoteDeck(deck);
                if (review) setRemoteReview(review);
            })
            .catch(() => {
                /* fall back to app state below */
            })
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deckId, studentId, isConnected]);

    const deck = remoteDeck ?? localDeck;
    const initialReview = remoteReview ?? localReview;
    // Frozen at first render of the session; live insights come from sessionStates.
    const [sessionStates, setSessionStates] = useState<Record<string, FlashcardCardState> | null>(null);

    const insights = useMemo(() => {
        if (!deck) return null;
        return computeDeckInsights(deck, {
            id: '',
            deckId: deck.id,
            studentId: studentId ?? '',
            cardStates: sessionStates ?? initialReview?.cardStates ?? {},
            updatedAt: '',
        });
    }, [deck, sessionStates, initialReview, studentId]);

    // A teacher previewing a student's portal must never overwrite that student's
    // real spaced-repetition state — only persist for the student themself (connected)
    // or in local mode, where the portal runs on the teacher's device by design.
    const isTeacherPreview = isConnected && settings.userRole !== 'student';

    function handleStatesChange(nextStates: Record<string, FlashcardCardState>) {
        setSessionStates(nextStates);
        if (isTeacherPreview || !deckId || !studentId) return;
        const review: FlashcardReview = {
            id: `${deckId}:${studentId}`,
            deckId,
            studentId,
            cardStates: nextStates,
            updatedAt: new Date().toISOString(),
        };
        if (isConnected) {
            saveFlashcardReviewAsStudent(review)
                .then((res) => setSaveFailed(!res.success))
                .catch(() => setSaveFailed(true));
        } else {
            saveFlashcardReview(review);
        }
    }

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 60 }}>
            <div
                style={{
                    background: 'var(--bg-elevated)',
                    borderBottom: '1px solid var(--border)',
                    padding: '20px 24px',
                }}
            >
                <div style={{ maxWidth: 820, margin: '0 auto' }}>
                    <Link
                        to={`/portal/${studentId}`}
                        className="btn btn-ghost btn-sm"
                        style={{ marginBottom: 8, display: 'inline-flex' }}
                    >
                        <ArrowLeft size={15} /> {t('flashcards.back_to_portal')}
                    </Link>
                    <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>
                        {deck?.name ?? t('flashcards.deck_title')}
                    </h1>
                    {student && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {student.name}
                        </div>
                    )}
                </div>
            </div>

            <div style={{ maxWidth: 820, margin: '24px auto 0', padding: '0 24px' }}>
                {isTeacherPreview && (
                    <div className="text-sm" style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>
                        {t('flashcards.teacher_preview_no_save')}
                    </div>
                )}
                {saveFailed && (
                    <div
                        className="text-sm"
                        style={{
                            color: 'var(--red)',
                            marginBottom: 12,
                            display: 'flex',
                            gap: 8,
                            alignItems: 'center',
                        }}
                    >
                        <AlertTriangle size={15} /> {t('flashcards.save_failed')}
                    </div>
                )}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 48 }}>
                        <Loader2 size={24} className="spin" style={{ color: 'var(--text-muted)' }} />
                    </div>
                ) : !deck ? (
                    <div className="empty-state">
                        <h3>{t('flashcards.deck_not_found')}</h3>
                    </div>
                ) : (
                    <>
                        {insights && (
                            <div
                                style={{
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 12,
                                    padding: '18px 20px',
                                    marginBottom: 20,
                                }}
                            >
                                <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem' }}>
                                    {t('flashcards.my_progress_heading')}
                                </h3>
                                <FlashcardInsightsPanel insights={insights} />
                            </div>
                        )}
                        <FlashcardStudySession
                            deck={deck}
                            initialStates={initialReview?.cardStates ?? {}}
                            onStatesChange={handleStatesChange}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
