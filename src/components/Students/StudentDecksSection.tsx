import React, { useEffect, useMemo, useState } from 'react';
import { Layers, Plus, Trash2, Play, Pencil, Share2, X, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFlashcards } from '../../context/AppContext';
import { useDbStatus } from '../../hooks/useDbStatus';
import { useToast } from '../../hooks/useToast';
import { nanoid } from '../../utils/nanoid';
import Modal from '../ui/Modal';
import FlashcardStudySession from '../Flashcards/FlashcardStudySession';
import type { FlashcardCard, FlashcardDeck } from '../../types';

interface Props {
    studentId: string;
}

interface DraftCard {
    id: string;
    front: string;
    back: string;
    example: string;
}

/**
 * Portal section (Phase 41.4) where a student authors their own private flashcard decks.
 * Online, decks persist via the student-scoped adapter (RLS-owned by the roster teacher but
 * hidden from them until shared); offline they live in the local deck store, filtered out of
 * teacher deck lists by `ownerStudentId`.
 */
export default function StudentDecksSection({ studentId }: Props) {
    const { t } = useTranslation();
    const { isConnected } = useDbStatus();
    const { showToast } = useToast();
    const {
        flashcardDecks,
        addFlashcardDeck,
        updateFlashcardDeck,
        deleteFlashcardDeck,
        fetchMyStudentFlashcardDecks,
        saveFlashcardDeckAsStudent,
        deleteFlashcardDeckAsStudent,
    } = useFlashcards();

    const [onlineDecks, setOnlineDecks] = useState<FlashcardDeck[] | null>(null);
    const [editing, setEditing] = useState<FlashcardDeck | null>(null);
    const [studying, setStudying] = useState<FlashcardDeck | null>(null);

    const [loadError, setLoadError] = useState(false);
    useEffect(() => {
        if (!isConnected) return;
        let cancelled = false;
        setLoadError(false);
        fetchMyStudentFlashcardDecks(studentId)
            .then((d) => {
                if (!cancelled) setOnlineDecks(d);
            })
            .catch(() => {
                // A failed fetch must not masquerade as "no decks" — surface it and keep prior state.
                if (!cancelled) setLoadError(true);
            });
        return () => {
            cancelled = true;
        };
    }, [isConnected, studentId, fetchMyStudentFlashcardDecks]);

    const offlineDecks = useMemo(
        () => flashcardDecks.filter((d) => d.ownerStudentId === studentId),
        [flashcardDecks, studentId]
    );
    const decks = isConnected ? (onlineDecks ?? []) : offlineDecks;

    const upsertOnline = (deck: FlashcardDeck) =>
        setOnlineDecks((prev) => [...(prev ?? []).filter((d) => d.id !== deck.id), deck]);

    /** Returns true only when the deck actually persisted (so callers can gate UI on success). */
    async function persistDeck(deck: FlashcardDeck): Promise<boolean> {
        if (isConnected) {
            const res = await saveFlashcardDeckAsStudent(deck);
            if (!res.success) {
                showToast(t('studentDecks.save_error'), 'error');
                return false;
            }
            upsertOnline(deck);
            return true;
        }
        if (flashcardDecks.some((d) => d.id === deck.id)) updateFlashcardDeck(deck);
        else addFlashcardDeck(deck);
        return true;
    }

    async function handleDelete(deck: FlashcardDeck) {
        if (isConnected) {
            const res = await deleteFlashcardDeckAsStudent(deck.id);
            if (!res.success) {
                showToast(t('studentDecks.save_error'), 'error');
                return;
            }
            /* v8 ignore start -- delete button only renders once the online list has loaded, so prev is never null */
            setOnlineDecks((prev) => (prev ?? []).filter((d) => d.id !== deck.id));
            /* v8 ignore stop */
        } else {
            deleteFlashcardDeck(deck.id);
        }
    }

    async function toggleShare(deck: FlashcardDeck) {
        const next = { ...deck, sharedWithTeacher: !deck.sharedWithTeacher, updatedAt: new Date().toISOString() };
        if (!(await persistDeck(next))) return;
        showToast(
            next.sharedWithTeacher ? t('studentDecks.shared_toast') : t('studentDecks.unshared_toast'),
            'success'
        );
    }

    function startCreate() {
        setEditing({
            id: nanoid(),
            name: '',
            cards: [],
            deckKind: 'vocabulary',
            ownerStudentId: studentId,
            createdAt: new Date().toISOString(),
        });
    }

    return (
        <section aria-label={t('studentDecks.section_title')}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginBottom: 12,
                }}
            >
                <h2
                    style={{
                        margin: 0,
                        fontSize: '1rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <Layers size={16} style={{ color: 'var(--accent)' }} /> {t('studentDecks.section_title')}
                </h2>
                <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>
                    <Plus size={14} /> {t('studentDecks.create')}
                </button>
            </div>

            {loadError ? (
                <p className="text-sm" style={{ margin: 0, color: 'var(--red)' }}>
                    {t('studentDecks.load_error')}
                </p>
            ) : decks.length === 0 ? (
                <p className="text-muted text-sm" style={{ margin: 0 }}>
                    {t('studentDecks.empty')}
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {decks.map((deck) => (
                        <div
                            key={deck.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 10,
                                flexWrap: 'wrap',
                                border: '1px solid var(--border)',
                                borderRadius: 10,
                                padding: '10px 14px',
                            }}
                        >
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                                    {deck.name || t('studentDecks.untitled')}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {t('flashcards.card_count', { count: deck.cards.length })}
                                    {deck.sharedWithTeacher && (
                                        <span style={{ color: 'var(--green)', marginLeft: 8 }}>
                                            {t('studentDecks.shared_badge')}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => setStudying(deck)}
                                    disabled={deck.cards.length === 0}
                                >
                                    <Play size={14} /> {t('flashcards.study_button')}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-icon btn-sm"
                                    aria-label={t('common.edit')}
                                    title={t('common.edit')}
                                    onClick={() => setEditing(deck)}
                                >
                                    <Pencil size={14} />
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-icon btn-sm"
                                    aria-pressed={deck.sharedWithTeacher ?? false}
                                    aria-label={t('studentDecks.share')}
                                    title={t('studentDecks.share')}
                                    style={{ color: deck.sharedWithTeacher ? 'var(--green)' : 'var(--text-muted)' }}
                                    onClick={() => void toggleShare(deck)}
                                >
                                    <Share2 size={14} />
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-icon btn-sm"
                                    aria-label={t('common.delete')}
                                    title={t('common.delete')}
                                    style={{ color: 'var(--red)' }}
                                    onClick={() => void handleDelete(deck)}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {editing && (
                <DeckEditor
                    deck={editing}
                    onClose={() => setEditing(null)}
                    onSave={async (deck) => {
                        if (await persistDeck(deck)) setEditing(null);
                    }}
                />
            )}

            {studying && (
                <Modal titleId="student-deck-study" onClose={() => setStudying(null)} maxWidth={1000}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <h3 id="student-deck-study" style={{ margin: 0, flex: 1 }}>
                            {studying.name}
                        </h3>
                        <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            aria-label={t('common.close')}
                            onClick={() => setStudying(null)}
                        >
                            <X size={18} />
                        </button>
                    </div>
                    <FlashcardStudySession deck={studying} initialStates={{}} onExit={() => setStudying(null)} />
                </Modal>
            )}
        </section>
    );
}

function DeckEditor({
    deck,
    onClose,
    onSave,
}: {
    deck: FlashcardDeck;
    onClose: () => void;
    onSave: (deck: FlashcardDeck) => void | Promise<void>;
}) {
    const { t } = useTranslation();
    const [name, setName] = useState(deck.name);
    const [cards, setCards] = useState<DraftCard[]>(
        deck.cards.length > 0
            ? deck.cards.map((c) => ({ id: c.id, front: c.front, back: c.back, example: c.example ?? '' }))
            : [{ id: nanoid(), front: '', back: '', example: '' }]
    );

    const patchCard = (id: string, patch: Partial<DraftCard>) =>
        setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const addRow = () => setCards((prev) => [...prev, { id: nanoid(), front: '', back: '', example: '' }]);
    const removeRow = (id: string) => setCards((prev) => prev.filter((c) => c.id !== id));

    const save = () => {
        const kept: FlashcardCard[] = cards
            .filter((c) => c.front.trim() && c.back.trim())
            .map((c) => ({
                id: c.id,
                front: c.front.trim(),
                back: c.back.trim(),
                ...(c.example.trim() ? { example: c.example.trim() } : {}),
            }));
        void onSave({
            ...deck,
            name: name.trim() || t('studentDecks.untitled'),
            cards: kept,
            updatedAt: new Date().toISOString(),
        });
    };

    return (
        <Modal titleId="student-deck-editor" onClose={onClose} maxWidth={640}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <h3 id="student-deck-editor" style={{ margin: 0, flex: 1 }}>
                    {t('studentDecks.editor_title')}
                </h3>
                <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label={t('common.close')}
                    onClick={onClose}
                >
                    <X size={18} />
                </button>
            </div>

            <input
                className="input"
                value={name}
                placeholder={t('studentDecks.name_placeholder')}
                aria-label={t('studentDecks.name_placeholder')}
                onChange={(e) => setName(e.target.value)}
                style={{ width: '100%', marginBottom: 12 }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {cards.map((card, i) => (
                    <div key={card.id} className="flex flex-wrap" style={{ gap: 8, alignItems: 'center' }}>
                        <span className="text-dim text-xs" style={{ width: 20, textAlign: 'right', flexShrink: 0 }}>
                            {i + 1}
                        </span>
                        <input
                            className="input"
                            value={card.front}
                            placeholder={t('flashcards.card_front')}
                            aria-label={t('flashcards.card_front')}
                            onChange={(e) => patchCard(card.id, { front: e.target.value })}
                            style={{ flex: 1, minWidth: 120 }}
                        />
                        <input
                            className="input"
                            value={card.back}
                            placeholder={t('flashcards.card_back')}
                            aria-label={t('flashcards.card_back')}
                            onChange={(e) => patchCard(card.id, { back: e.target.value })}
                            style={{ flex: 1, minWidth: 120 }}
                        />
                        <input
                            className="input"
                            value={card.example}
                            placeholder={t('flashcards.card_example')}
                            aria-label={t('flashcards.card_example')}
                            onChange={(e) => patchCard(card.id, { example: e.target.value })}
                            style={{ flex: 1, minWidth: 120 }}
                        />
                        <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm"
                            aria-label={t('flashcards.remove_card')}
                            title={t('flashcards.remove_card')}
                            style={{ color: 'var(--red)', flexShrink: 0 }}
                            onClick={() => removeRow(card.id)}
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addRow}>
                    <Plus size={14} /> {t('studentDecks.add_card')}
                </button>
                <button type="button" className="btn btn-primary" onClick={save}>
                    <Check size={15} /> {t('common.save')}
                </button>
            </div>
        </Modal>
    );
}
