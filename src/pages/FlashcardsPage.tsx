import React, { useEffect, useRef } from 'react';
import PageTour from '../components/Tour/PageTour';
import { usePageTourState } from '../hooks/usePageTourState';
import { useNavigate } from 'react-router-dom';
import { Plus, Layers, Edit2, Trash2 } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useAuthoring, useFlashcards } from '../context/AppContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import CardGrid from '../components/ui/CardGrid';
import CardTile from '../components/ui/CardTile';
import CardGrip from '../components/ui/CardGrip';
import { EmptyState } from '../components/ui/EmptyState';
import FolderBar from '../components/Folders/FolderBar';
import FolderNameModal from '../components/Folders/FolderNameModal';
import { useConfirm } from '../hooks/useConfirm';
import { useFolderDropTarget } from '../hooks/useFolderDropTarget';
import { useToast } from '../hooks/useToast';
import { ALL_FOLDERS, countInFolder, filterByFolder, foldersForKind, nextFolderOrder } from '../utils/folders';
import { UNTITLED_DECK_NAMES } from '../utils/flashcardDecks';
import type { Folder } from '../types';

export default function FlashcardsPage() {
    const { t, i18n } = useTranslation();
    const tour = usePageTourState('flashcards');
    const navigate = useNavigate();
    const { flashcardDecks, flashcardAssignments, addFlashcardDeck, updateFlashcardDeck, deleteFlashcardDeck } =
        useFlashcards();
    const {
        // `= []` guards page tests and older local snapshots that predate the collection.
        folders = [],
        addFolder,
        updateFolder,
        deleteFolder,
    } = useAuthoring();

    const { confirm, dialogProps: confirmDialogProps } = useConfirm();
    const { showToast } = useToast();
    const [activeFolder, setActiveFolder] = React.useState<string>(ALL_FOLDERS);
    const [folderModal, setFolderModal] = React.useState<{ folder?: Folder } | null>(null);
    const { dropFolderId, startFolderDrop, endFolderDrop } = useFolderDropTarget();

    // 'New deck' has to persist a deck before navigating (the editor needs an id), so an
    // untitled deck the teacher never added a card to would otherwise pile up in the list.
    // Prune those once there is a deck list to judge: the provider mounts route children before its
    // asynchronous hydrate() resolves, so a mount-time prune would run against the empty list, latch
    // itself done and never see the hydrated decks (#693).
    const prunedUntitledDecks = useRef(false);
    // Decks created from this page while it is mounted: 'New deck' leaves the list mounted until the
    // navigation to the editor completes, so the brand-new empty deck is briefly in the list and must
    // not be mistaken for an abandoned leftover. An abandoned deck is still cleaned up on the next
    // visit, when it is no longer in this set.
    const createdHere = useRef<Set<string>>(new Set());
    useEffect(() => {
        if (prunedUntitledDecks.current || flashcardDecks.length === 0) return;
        prunedUntitledDecks.current = true;
        flashcardDecks
            .filter(
                (d) =>
                    !createdHere.current.has(d.id) &&
                    !d.ownerStudentId &&
                    d.cards.length === 0 &&
                    UNTITLED_DECK_NAMES.has(d.name)
            )
            .forEach((d) => deleteFlashcardDeck(d.id));
    }, [flashcardDecks, deleteFlashcardDeck]);

    function handleCreate() {
        const deck = addFlashcardDeck({ name: t('flashcards.untitled_deck'), cards: [] });
        createdHere.current.add(deck.id);
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

    // Never show a student's private deck in the teacher list (Phase 41.4); a deck the student
    // shared appears (badged). Online, private student decks aren't hydrated anyway; this also
    // covers the offline same-device case.
    const sorted = [...flashcardDecks]
        .filter((d) => !d.ownerStudentId || d.sharedWithTeacher)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const deckFolders = foldersForKind(folders, 'flashcard');
    const visibleDecks = filterByFolder(sorted, activeFolder);

    function fileIntoFolder(deckId: string | undefined, folderId: string) {
        const deck = flashcardDecks.find((d) => d.id === deckId);
        if (!deck || deck.folderId === folderId) return;
        updateFlashcardDeck({ ...deck, folderId });
        const folder = deckFolders.find((f) => f.id === folderId);
        if (folder) showToast(t('folders.moved_toast', { name: folder.name }), 'success');
    }

    function handleDragEnd(result: DropResult) {
        // The pointer decides which folder was under the card: @hello-pangea/dnd only sees the
        // dragged card's centre, which never reaches a folder tile from a corner grab.
        const pointerFolderId = endFolderDrop();
        if (pointerFolderId) fileIntoFolder(visibleDecks[result.source.index]?.id, pointerFolderId);
        // Decks keep their newest-first order, so a drop outside a folder changes nothing.
    }

    function submitFolderName(name: string) {
        const editing = folderModal?.folder;
        if (editing) {
            updateFolder({ ...editing, name });
            showToast(t('folders.renamed_toast'), 'success');
        } else {
            const folder = addFolder({ name, kind: 'flashcard', displayOrder: nextFolderOrder(folders, 'flashcard') });
            setActiveFolder(folder.id);
            showToast(t('folders.created_toast', { name }), 'success');
        }
        setFolderModal(null);
    }

    async function handleDeleteFolder(folder: Folder) {
        const ok = await confirm({
            title: t('folders.delete_title'),
            message: t('folders.delete_warning_other', { name: folder.name }),
            confirmLabel: t('common.delete'),
            danger: true,
        });
        if (!ok) return;
        deleteFolder(folder.id, 'flashcard');
        if (activeFolder === folder.id) setActiveFolder(ALL_FOLDERS);
        showToast(t('folders.deleted_toast', { name: folder.name }), 'success');
    }

    return (
        <>
            <PageTour {...tour.tourProps} />
            <Topbar
                title={t('flashcards.list_title')}
                actions={
                    <>
                        <button className="btn btn-ghost btn-sm" onClick={tour.start}>
                            {t('tutorial.page_tour_button')}
                        </button>
                        <button data-tour="fc-new" className="btn btn-primary btn-sm" onClick={handleCreate}>
                            <Plus size={15} /> {t('flashcards.new_deck')}
                        </button>
                    </>
                }
            />
            <div className="page-content fade-in" data-tour="fc-content">
                {sorted.length === 0 && deckFolders.length === 0 ? (
                    <EmptyState
                        icon={Layers}
                        title={t('flashcards.no_decks')}
                        description={t('flashcards.create_first_instruction')}
                        action={{ label: t('flashcards.new_deck'), icon: Plus, onClick: handleCreate }}
                    />
                ) : (
                    <DragDropContext onBeforeCapture={startFolderDrop} onDragEnd={handleDragEnd}>
                        <FolderBar
                            folders={deckFolders}
                            activeFolder={activeFolder}
                            countFor={(folderId) => countInFolder(sorted, folderId)}
                            dropFolderId={dropFolderId}
                            onOpen={(id) => setActiveFolder((current) => (current === id ? ALL_FOLDERS : id))}
                            onRename={(folder) => setFolderModal({ folder })}
                            onDelete={handleDeleteFolder}
                            onCreate={() => setFolderModal({})}
                        />
                        {visibleDecks.length === 0 ? (
                            <EmptyState
                                icon={Layers}
                                title={t('folders.empty')}
                                description={t('folders.empty_hint')}
                            />
                        ) : (
                            <Droppable droppableId="flashcard-deck-list">
                                {(droppableProvided) => (
                                    <CardGrid ref={droppableProvided.innerRef} {...droppableProvided.droppableProps}>
                                        {visibleDecks.map((deck, idx) => {
                                            const assignedCount = new Set(
                                                flashcardAssignments
                                                    .filter((a) => a.deckId === deck.id)
                                                    .map((a) => a.studentId)
                                            ).size;
                                            return (
                                                <Draggable key={deck.id} draggableId={deck.id} index={idx}>
                                                    {(dragProvided) => (
                                                        <CardTile
                                                            ref={dragProvided.innerRef}
                                                            {...dragProvided.draggableProps}
                                                            hoverable
                                                            style={{
                                                                position: 'relative',
                                                                ...dragProvided.draggableProps.style,
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'flex-start',
                                                                    marginBottom: 12,
                                                                }}
                                                            >
                                                                <div
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'flex-start',
                                                                        gap: 6,
                                                                        minWidth: 0,
                                                                    }}
                                                                >
                                                                    {/* Above the stretched link, otherwise clicking the grip opens the deck. */}
                                                                    <CardGrip
                                                                        {...dragProvided.dragHandleProps}
                                                                        label={t('folders.drag_to_file')}
                                                                        style={{ position: 'relative', zIndex: 1 }}
                                                                    />
                                                                    <div style={{ minWidth: 0 }}>
                                                                        <h3 style={{ margin: 0 }}>
                                                                            {deck.ownerStudentId ? (
                                                                                // A shared student deck is read-only for teachers (RLS blocks
                                                                                // owner writes on student rows); no editor link.
                                                                                <span>{deck.name}</span>
                                                                            ) : (
                                                                                <button
                                                                                    type="button"
                                                                                    className="stretched-link"
                                                                                    onClick={() =>
                                                                                        navigate(
                                                                                            `/flashcards/${deck.id}`
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    {deck.name}
                                                                                </button>
                                                                            )}
                                                                        </h3>
                                                                        <div
                                                                            className="text-muted text-xs"
                                                                            style={{ marginTop: 2 }}
                                                                        >
                                                                            {new Date(
                                                                                deck.createdAt
                                                                            ).toLocaleDateString(i18n.language)}
                                                                            {deck.ownerStudentId &&
                                                                                deck.sharedWithTeacher && (
                                                                                    <span
                                                                                        style={{
                                                                                            marginLeft: 8,
                                                                                            padding: '1px 7px',
                                                                                            borderRadius: 999,
                                                                                            fontSize: '0.68rem',
                                                                                            fontWeight: 700,
                                                                                            background:
                                                                                                'var(--green-soft, color-mix(in srgb, var(--green) 14%, transparent))',
                                                                                            color: 'var(--green)',
                                                                                        }}
                                                                                    >
                                                                                        {t(
                                                                                            'studentDecks.from_student_badge'
                                                                                        )}
                                                                                    </span>
                                                                                )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div
                                                                    style={{
                                                                        display: 'flex',
                                                                        gap: 4,
                                                                        position: 'relative',
                                                                        zIndex: 1,
                                                                    }}
                                                                >
                                                                    {!deck.ownerStudentId && (
                                                                        <>
                                                                            <button
                                                                                type="button"
                                                                                className="btn btn-ghost btn-icon btn-sm"
                                                                                title={t('flashcards.action_edit')}
                                                                                aria-label={t('flashcards.action_edit')}
                                                                                onClick={() =>
                                                                                    navigate(`/flashcards/${deck.id}`)
                                                                                }
                                                                            >
                                                                                <Edit2 size={14} />
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                className="btn btn-ghost btn-icon btn-sm"
                                                                                title={t('flashcards.action_delete')}
                                                                                aria-label={t(
                                                                                    'flashcards.action_delete'
                                                                                )}
                                                                                style={{ color: 'var(--red)' }}
                                                                                onClick={() =>
                                                                                    handleDelete(deck.id, deck.name)
                                                                                }
                                                                            >
                                                                                <Trash2 size={14} />
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                                <span className="badge badge-blue">
                                                                    {t('flashcards.card_count', {
                                                                        count: deck.cards.length,
                                                                    })}
                                                                </span>
                                                                {assignedCount > 0 && (
                                                                    <span className="badge badge-green">
                                                                        {t('flashcards.assigned_count', {
                                                                            count: assignedCount,
                                                                        })}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {deck.description && (
                                                                <p
                                                                    className="text-muted text-sm"
                                                                    style={{ marginTop: 10, marginBottom: 0 }}
                                                                >
                                                                    {deck.description}
                                                                </p>
                                                            )}
                                                        </CardTile>
                                                    )}
                                                </Draggable>
                                            );
                                        })}
                                        {droppableProvided.placeholder}
                                    </CardGrid>
                                )}
                            </Droppable>
                        )}
                    </DragDropContext>
                )}
            </div>

            {folderModal && (
                <FolderNameModal
                    title={folderModal.folder ? t('folders.rename_title') : t('folders.new_folder')}
                    submitLabel={folderModal.folder ? t('folders.rename') : t('folders.create')}
                    initialName={folderModal.folder?.name}
                    onSubmit={submitFolderName}
                    onClose={() => setFolderModal(null)}
                />
            )}

            <ConfirmDialog {...confirmDialogProps} />
        </>
    );
}
