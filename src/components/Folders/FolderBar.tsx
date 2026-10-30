import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, FolderPlus, LayoutGrid } from 'lucide-react';
import type { Folder, FolderKind } from '../../types';
import { ALL_FOLDERS, MAX_FOLDER_DEPTH, childFolders, countInFolderTree, folderPath } from '../../utils/folders';
import FolderTile from './FolderTile';
import MoveToMenu from './MoveToMenu';

export interface FolderBarProps {
    folders: Folder[];
    kind: FolderKind;
    /** `ALL_FOLDERS` at the top level, otherwise the folder whose contents are showing. */
    activeFolderId: string;
    /** The list being filed, so the tiles can count what is inside them. */
    items: { folderId?: string }[];
    onSelect: (folderId: string) => void;
    /** Create a folder inside `parentId` (undefined at the top level). */
    onCreate: (parentId: string | undefined) => void;
    onRename: (folder: Folder) => void;
    onDelete: (folder: Folder) => void;
    /** Re-parent a folder; when omitted the tiles get no “Move to…” action. */
    onMoveFolder?: (folder: Folder, parentId: string | undefined) => void;
}

/**
 * One level of the rubric or test folder tree: the folders inside the current folder, plus a
 * breadcrumb when you are inside one.
 *
 * The bar shows a single level rather than the whole tree — a tile is both the way in and a drop
 * target, so a deep tree stays a row of tiles instead of an ever-wider area that pushes the cards
 * off screen.
 */
export default function FolderBar({
    folders,
    kind,
    activeFolderId,
    items,
    onSelect,
    onCreate,
    onRename,
    onDelete,
    onMoveFolder,
}: FolderBarProps) {
    const { t } = useTranslation();
    const barRef = useRef<HTMLDivElement>(null);
    const previousActive = useRef(activeFolderId);

    // Opening a folder unmounts the tile that was clicked, which would drop keyboard focus onto
    // <body>. Once the level has changed, move focus to the crumb for where the user now is — but
    // only when focus was inside the bar to begin with, so unrelated focus is never stolen.
    useEffect(() => {
        if (previousActive.current === activeFolderId) return;
        previousActive.current = activeFolderId;
        const focused = document.activeElement;
        const focusWasLost = !focused || focused === document.body;
        if (!focusWasLost && !barRef.current?.contains(focused)) return;
        barRef.current?.querySelector<HTMLElement>('[data-folder-focus]')?.focus();
    }, [activeFolderId]);

    const atRoot = activeFolderId === ALL_FOLDERS;
    const path = atRoot ? [] : folderPath(folders, activeFolderId);
    const active = path.at(-1);
    const level = childFolders(folders, kind, active?.id);
    // A stale active id (folder deleted on another device) falls back to the top level.
    const parentId = active?.id;
    const atMaxDepth = path.length >= MAX_FOLDER_DEPTH;
    const newFolderLabel = parentId ? t('folders.new_subfolder') : t('folders.new_folder');

    return (
        <div ref={barRef} style={{ marginBottom: 20 }}>
            {active && (
                <nav
                    aria-label={t('folders.path_label')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        flexWrap: 'wrap',
                        marginBottom: 10,
                        fontSize: '0.85rem',
                    }}
                >
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSelect(ALL_FOLDERS)}>
                        <LayoutGrid size={13} /> {t('folders.all')}
                    </button>
                    {path.map((folder) => {
                        const isCurrent = folder.id === active.id;
                        return (
                            <span key={folder.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <ChevronRight size={13} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    aria-current={isCurrent ? 'page' : undefined}
                                    data-folder-focus={isCurrent ? '' : undefined}
                                    onClick={() => onSelect(folder.id)}
                                    style={{ fontWeight: isCurrent ? 600 : undefined }}
                                >
                                    {folder.name}
                                </button>
                            </span>
                        );
                    })}
                </nav>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {!active && (
                    <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        aria-pressed
                        data-folder-focus=""
                        onClick={() => onSelect(ALL_FOLDERS)}
                    >
                        <LayoutGrid size={14} /> {t('folders.all')}
                    </button>
                )}
                {level.map((folder) => (
                    <FolderTile
                        key={folder.id}
                        folder={folder}
                        count={countInFolderTree(items, folders, folder.id)}
                        subfolderCount={childFolders(folders, kind, folder.id).length}
                        active={false}
                        onOpen={onSelect}
                        onRename={onRename}
                        onDelete={onDelete}
                        moveMenu={
                            onMoveFolder && (
                                <MoveToMenu
                                    folders={folders}
                                    kind={kind}
                                    movingFolderId={folder.id}
                                    currentFolderId={parentId}
                                    rootLabel={t('folders.move_to_root')}
                                    onMove={(target) => onMoveFolder(folder, target)}
                                />
                            )
                        }
                    />
                ))}
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onCreate(parentId)}
                    disabled={atMaxDepth}
                    title={atMaxDepth ? t('folders.max_depth') : undefined}
                >
                    <FolderPlus size={14} /> {newFolderLabel}
                </button>
            </div>
        </div>
    );
}
