import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Layers, Edit2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useConfirm } from '../hooks/useConfirm';

export default function FlashcardsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { flashcardDecks, flashcardAssignments, addFlashcardDeck, deleteFlashcardDeck } = useApp();
    const { confirm, dialogProps: confirmDialogProps } = useConfirm();

    function handleCreate() {
        const deck = addFlashcardDeck({ name: t('flashcards.untitled_deck'), cards: [] });
        navigate(`/flashcards/${deck.id}`);
    }

    async function handleDelete(deckId: string, deckName: string) {
        const ok = await confirm({
            title: t('flashcards.delete_deck_title'),
            message: t('flashcards.delete_deck_warning', { name: deckName }),
            confirmLabel: t('common.delete'),
        });
        if (ok) deleteFlashcardDeck(deckId);
    }

    const sorted = [...flashcardDecks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return (
        <>
            <Topbar
                title={t('flashcards.list_title')}
                actions={
                    <button className="btn btn-primary btn-sm" onClick={handleCreate}>
                        <Plus size={15} /> {t('flashcards.new_deck')}
                    </button>
                }
            />
            <div className="page-content fade-in">
                {sorted.length === 0 ? (
                    <div className="empty-state">
                        <Layers size={40} />
                        <h3>{t('flashcards.no_decks')}</h3>
                        <p className="text-muted text-sm">{t('flashcards.create_first_instruction')}</p>
                        <button className="btn btn-primary" onClick={handleCreate}>
                            <Plus size={16} /> {t('flashcards.new_deck')}
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                        {sorted.map((deck) => {
                            const assignedCount = new Set(
                                flashcardAssignments.filter((a) => a.deckId === deck.id).map((a) => a.studentId)
                            ).size;
                            return (
                                <div
                                    key={deck.id}
                                    className="card"
                                    style={{
                                        cursor: 'pointer',
                                        transition: 'border-color var(--transition)',
                                        flex: '1 1 320px',
                                        maxWidth: 480,
                                    }}
                                    onClick={() => navigate(`/flashcards/${deck.id}`)}
                                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            marginBottom: 12,
                                        }}
                                    >
                                        <div>
                                            <h3>{deck.name}</h3>
                                            <div className="text-muted text-xs" style={{ marginTop: 2 }}>
                                                {new Date(deck.createdAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-icon btn-sm"
                                                title={t('flashcards.action_edit')}
                                                aria-label={t('flashcards.action_edit')}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/flashcards/${deck.id}`);
                                                }}
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-icon btn-sm"
                                                title={t('flashcards.action_delete')}
                                                aria-label={t('flashcards.action_delete')}
                                                style={{ color: 'var(--red)' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(deck.id, deck.name);
                                                }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <span className="badge badge-blue">
                                            {t('flashcards.card_count', { count: deck.cards.length })}
                                        </span>
                                        {assignedCount > 0 && (
                                            <span className="badge badge-green">
                                                {t('flashcards.assigned_count', { count: assignedCount })}
                                            </span>
                                        )}
                                    </div>
                                    {deck.description && (
                                        <p className="text-muted text-sm" style={{ marginTop: 10, marginBottom: 0 }}>
                                            {deck.description}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            <ConfirmDialog {...confirmDialogProps} />
        </>
    );
}
