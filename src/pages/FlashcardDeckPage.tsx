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
import GrammarItemSelect from '../components/CEFR/GrammarItemSelect';
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

    useEffect(() => {
        if (!classes.some((c) => c.id === assignClassId)) {
            setAssignClassId(classes[0]?.id ?? '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [classes]);

    // Autosave the draft after a pause in editing; skip the initial mount echo.
    const lastSavedRef = useRef<string | null>(null);
    const draftRef = useRef(draft);
    useEffect(() => {
        draftRef.current = draft;
    }, [draft]);
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

    // Flush a pending edit that the debounce above hasn't saved yet if the teacher
    // navigates away mid-keystroke — a plain clearTimeout would silently drop it.
    useEffect(() => {
        return () => {
            const current = draftRef.current;
            if (current && lastSavedRef.current !== JSON.stringify(current)) {
                updateFlashcardDeck(current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Adopt a fresher synced deck only when there's no unsaved local edit in flight —
    // otherwise a realtime pull from another device could clobber active typing.
    useEffect(() => {
        if (!deck) return;
        if (lastSavedRef.current === JSON.stringify(draft) && draft?.updatedAt !== deck.updatedAt) {
            setDraft(deck);
            lastSavedRef.current = JSON.stringify(deck);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deck?.updatedAt]);

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
    const frontLabel = t(draft.deckKind === 'grammar' ? 'flashcards.card_front_grammar' : 'flashcards.card_front');
    const backLabel = t(draft.deckKind === 'grammar' ? 'flashcards.card_back_grammar' : 'flashcards.card_back');

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
                        <div>
                            <label className="text-sm" htmlFor="deck-kind" style={{ fontWeight: 600 }}>
                                {t('flashcards.deck_kind_label')}
                            </label>
                            <select
                                id="deck-kind"
                                className="input"
                                value={draft.deckKind ?? 'vocabulary'}
                                onChange={(e) => patchDraft({ deckKind: e.target.value as 'vocabulary' | 'grammar' })}
                                style={{ width: '100%', marginTop: 4 }}
                            >
                                <option value="vocabulary">{t('flashcards.deck_kind_vocabulary')}</option>
                                <option value="grammar">{t('flashcards.deck_kind_grammar')}</option>
                            </select>
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
                                <div key={card.id} className="flex flex-wrap" style={{ gap: 8, alignItems: 'center' }}>
                                    <span
                                        className="text-dim text-xs"
                                        style={{ width: 24, textAlign: 'right', flexShrink: 0 }}
                                    >
                                        {i + 1}
                                    </span>
                                    <input
                                        className="input"
                                        value={card.front}
                                        placeholder={frontLabel}
                                        aria-label={frontLabel}
                                        onChange={(e) => patchCard(card.id, { front: e.target.value })}
                                        style={{ flex: 1, minWidth: 160 }}
                                    />
                                    <input
                                        className="input"
                                        value={card.back}
                                        placeholder={backLabel}
                                        aria-label={backLabel}
                                        onChange={(e) => patchCard(card.id, { back: e.target.value })}
                                        style={{ flex: 1, minWidth: 160 }}
                                    />
                                    <input
                                        className="input"
                                        value={card.example ?? ''}
                                        placeholder={t('flashcards.card_example')}
                                        aria-label={t('flashcards.card_example')}
                                        onChange={(e) => patchCard(card.id, { example: e.target.value })}
                                        style={{ flex: 1, minWidth: 160 }}
                                    />
                                    {draft.deckKind === 'grammar' && (
                                        <div style={{ width: 180, flexShrink: 0 }}>
                                            <GrammarItemSelect
                                                value={card.linkedGrammarItemId}
                                                onChange={(linkedGrammarItemId) =>
                                                    patchCard(card.id, { linkedGrammarItemId })
                                                }
                                                aria-label={t('flashcards.card_grammar_item_label')}
                                            />
                                        </div>
                                    )}
                                    <button
                                        className="btn btn-ghost btn-icon btn-sm"
                                        title={t('flashcards.remove_card')}
                                        aria-label={t('flashcards.remove_card')}
                                        style={{ color: 'var(--red)', flexShrink: 0 }}
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
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                style={{
                                                    fontWeight: 600,
                                                    fontSize: '0.85rem',
                                                    marginBottom: 6,
                                                    padding: 0,
                                                    justifyContent: 'flex-start',
                                                }}
                                                onClick={() => navigate(`/students/${student.id}`)}
                                            >
                                                {student.name}
                                            </button>
                                            <FlashcardInsightsPanel insights={insights} deckKind={draft.deckKind} />
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
