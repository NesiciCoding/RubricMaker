import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Upload, Play, Send, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import Modal from '../components/ui/Modal';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import { nanoid } from '../utils/nanoid';
import FlashcardImportModal from '../components/Flashcards/FlashcardImportModal';
import FlashcardStudySession from '../components/Flashcards/FlashcardStudySession';
import FlashcardInsightsPanel from '../components/Flashcards/FlashcardInsightsPanel';
import { computeDeckInsights } from '../utils/flashcardInsights';
import type { FlashcardCard, FlashcardDeck } from '../types';
import type { ParsedFlashcard } from '../utils/flashcardImport';

const AUTOSAVE_DELAY_MS = 700;

export default function FlashcardDeckPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const {
        flashcardDecks,
        flashcardAssignments,
        flashcardReviews,
        updateFlashcardDeck,
        addFlashcardAssignments,
        students,
        classes,
    } = useApp();
    const { showToast } = useToast();

    const deck = flashcardDecks.find((d) => d.id === id);
    const [draft, setDraft] = useState<FlashcardDeck | null>(deck ?? null);
    const [showImport, setShowImport] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [assignClassId, setAssignClassId] = useState(classes[0]?.id ?? '');

    // Autosave the draft after a pause in editing; skip the initial mount echo.
    const lastSavedRef = useRef<string | null>(null);
    useEffect(() => {
        if (!draft) return;
        const serialized = JSON.stringify(draft);
        if (lastSavedRef.current === null) {
            lastSavedRef.current = serialized;
            return;
        }
        if (lastSavedRef.current === serialized) return;
        const timer = setTimeout(() => {
            lastSavedRef.current = serialized;
            updateFlashcardDeck(draft);
        }, AUTOSAVE_DELAY_MS);
        return () => clearTimeout(timer);
    }, [draft, updateFlashcardDeck]);

    const assignments = useMemo(() => flashcardAssignments.filter((a) => a.deckId === id), [flashcardAssignments, id]);

    if (!deck || !draft) {
        return (
            <>
                <Topbar title={t('flashcards.deck_title')} />
                <div className="page-content">
                    <div className="empty-state">
                        <h3>{t('flashcards.deck_not_found')}</h3>
                        <button className="btn btn-secondary" onClick={() => navigate('/flashcards')}>
                            <ArrowLeft size={15} /> {t('common.back')}
                        </button>
                    </div>
                </div>
            </>
        );
    }

    function patchDraft(patch: Partial<FlashcardDeck>) {
        setDraft((d) => (d ? { ...d, ...patch } : d));
    }

    function patchCard(cardId: string, patch: Partial<FlashcardCard>) {
        setDraft((d) => (d ? { ...d, cards: d.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)) } : d));
    }

    function addCard() {
        setDraft((d) => (d ? { ...d, cards: [...d.cards, { id: nanoid(), front: '', back: '' }] } : d));
    }

    function removeCard(cardId: string) {
        setDraft((d) => (d ? { ...d, cards: d.cards.filter((c) => c.id !== cardId) } : d));
    }

    function handleImport(parsed: ParsedFlashcard[]) {
        setDraft((d) => (d ? { ...d, cards: [...d.cards, ...parsed.map((p) => ({ id: nanoid(), ...p }))] } : d));
        showToast(t('flashcards.import_success', { count: parsed.length }), 'success');
    }

    function handleAssign() {
        if (!draft) return;
        const classStudents = students.filter((s) => s.classId === assignClassId);
        if (classStudents.length === 0 || draft.cards.length === 0) return;
        const now = new Date().toISOString();
        addFlashcardAssignments(
            classStudents.map((s) => ({
                deckId: draft.id,
                studentId: s.id,
                deckName: draft.name,
                cardCount: draft.cards.length,
                createdAt: now,
            }))
        );
        showToast(t('flashcards.assign_success', { count: classStudents.length }), 'success');
    }

    const validCardCount = draft.cards.filter((c) => c.front.trim() && c.back.trim()).length;

    return (
        <>
            <Topbar
                title={draft.name || t('flashcards.deck_title')}
                actions={
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            className="btn btn-secondary btn-sm"
                            disabled={validCardCount === 0}
                            onClick={() => setShowPreview(true)}
                        >
                            <Play size={15} /> {t('flashcards.preview_deck')}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}>
                            <Upload size={15} /> {t('flashcards.import_button')}
                        </button>
                    </div>
                }
            />
            <div className="page-content fade-in" style={{ maxWidth: 900 }}>
                <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginBottom: 16 }}
                    onClick={() => navigate('/flashcards')}
                >
                    <ArrowLeft size={15} /> {t('flashcards.back_to_decks')}
                </button>

                <div className="card" style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                            <label className="text-sm" htmlFor="deck-name" style={{ fontWeight: 600 }}>
                                {t('flashcards.deck_name_label')}
                            </label>
                            <input
                                id="deck-name"
                                className="input"
                                value={draft.name}
                                onChange={(e) => patchDraft({ name: e.target.value })}
                                style={{ width: '100%', marginTop: 4 }}
                            />
                        </div>
                        <div>
                            <label className="text-sm" htmlFor="deck-description" style={{ fontWeight: 600 }}>
                                {t('flashcards.deck_description_label')}
                            </label>
                            <input
                                id="deck-description"
                                className="input"
                                value={draft.description ?? ''}
                                placeholder={t('flashcards.deck_description_placeholder')}
                                onChange={(e) => patchDraft({ description: e.target.value })}
                                style={{ width: '100%', marginTop: 4 }}
                            />
                        </div>
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 20 }}>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 12,
                        }}
                    >
                        <h3 style={{ margin: 0 }}>{t('flashcards.cards_heading', { count: draft.cards.length })}</h3>
                        <button className="btn btn-secondary btn-sm" onClick={addCard}>
                            <Plus size={15} /> {t('flashcards.add_card')}
                        </button>
                    </div>
                    {draft.cards.length === 0 ? (
                        <p className="text-muted text-sm" style={{ margin: 0 }}>
                            {t('flashcards.no_cards_hint')}
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {draft.cards.map((card, i) => (
                                <div key={card.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <span className="text-dim text-xs" style={{ width: 24, textAlign: 'right' }}>
                                        {i + 1}
                                    </span>
                                    <input
                                        className="input"
                                        value={card.front}
                                        placeholder={t('flashcards.card_front')}
                                        aria-label={t('flashcards.card_front')}
                                        onChange={(e) => patchCard(card.id, { front: e.target.value })}
                                        style={{ flex: 1 }}
                                    />
                                    <input
                                        className="input"
                                        value={card.back}
                                        placeholder={t('flashcards.card_back')}
                                        aria-label={t('flashcards.card_back')}
                                        onChange={(e) => patchCard(card.id, { back: e.target.value })}
                                        style={{ flex: 1 }}
                                    />
                                    <input
                                        className="input"
                                        value={card.example ?? ''}
                                        placeholder={t('flashcards.card_example')}
                                        aria-label={t('flashcards.card_example')}
                                        onChange={(e) => patchCard(card.id, { example: e.target.value })}
                                        style={{ flex: 1 }}
                                    />
                                    <button
                                        className="btn btn-ghost btn-icon btn-sm"
                                        title={t('flashcards.remove_card')}
                                        aria-label={t('flashcards.remove_card')}
                                        style={{ color: 'var(--red)' }}
                                        onClick={() => removeCard(card.id)}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="card" style={{ marginBottom: 20 }}>
                    <h3 style={{ marginTop: 0 }}>{t('flashcards.assign_heading')}</h3>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                            className="input"
                            value={assignClassId}
                            aria-label={t('flashcards.assign_class_label')}
                            onChange={(e) => setAssignClassId(e.target.value)}
                        >
                            {classes.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                        <button
                            className="btn btn-primary btn-sm"
                            disabled={validCardCount === 0}
                            onClick={handleAssign}
                        >
                            <Send size={15} /> {t('flashcards.assign_button')}
                        </button>
                    </div>
                    {validCardCount === 0 && (
                        <p className="text-muted text-xs" style={{ marginBottom: 0, marginTop: 8 }}>
                            {t('flashcards.assign_needs_cards')}
                        </p>
                    )}

                    {assignments.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                            <h4 style={{ marginBottom: 8 }}>{t('flashcards.student_progress_heading')}</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {assignments.map((a) => {
                                    const student = students.find((s) => s.id === a.studentId);
                                    if (!student) return null;
                                    const review =
                                        flashcardReviews.find((r) => r.id === `${deck.id}:${a.studentId}`) ?? null;
                                    const insights = computeDeckInsights(deck, review);
                                    return (
                                        <div
                                            key={a.studentId}
                                            style={{
                                                borderTop: '1px solid var(--border)',
                                                paddingTop: 10,
                                            }}
                                        >
                                            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>
                                                {student.name}
                                            </div>
                                            <FlashcardInsightsPanel insights={insights} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showImport && <FlashcardImportModal onImport={handleImport} onClose={() => setShowImport(false)} />}
            {showPreview && (
                <Modal titleId="flashcard-preview-title" onClose={() => setShowPreview(false)} maxWidth={640}>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 12,
                        }}
                    >
                        <h3 id="flashcard-preview-title" style={{ margin: 0 }}>
                            {t('flashcards.preview_title', { name: draft.name })}
                        </h3>
                        <button
                            className="btn btn-ghost btn-icon btn-sm"
                            aria-label={t('common.close')}
                            onClick={() => setShowPreview(false)}
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <p className="text-muted text-xs" style={{ marginTop: 0 }}>
                        {t('flashcards.preview_hint')}
                    </p>
                    <FlashcardStudySession
                        deck={{ ...draft, cards: draft.cards.filter((c) => c.front.trim() && c.back.trim()) }}
                        initialStates={{}}
                        onExit={() => setShowPreview(false)}
                    />
                </Modal>
            )}
        </>
    );
}
