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
    /** The tile under the dragging pointer, from `useFolderDropTarget`. */
    dropFolderId?: string | null;
    /** Opens a folder's sharing settings; when omitted the tiles get no share button. */
    onShare?: (folder: Folder) => void;
    /** Whether a folder is shared (own or inherited setting), for the share button's state. */
    isFolderShared?: (folder: Folder) => boolean;
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
    dropFolderId = null,
    onShare,
    isFolderShared,
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

    // Picking a target in a tile's "Move to…" menu closes the menu and moves the folder off this
    // level, so the focused menu item and the tile's own trigger both unmount and focus falls to
    // <body>. Once the new folder list has rendered, land on the destination tile if it is on this
    // level (that is where the folder went), else on the crumb for the current level.
    const pendingMoveTarget = useRef<{ targetId: string | undefined } | null>(null);
    useEffect(() => {
        const pending = pendingMoveTarget.current;
        if (!pending) return;
        pendingMoveTarget.current = null;
        const focused = document.activeElement;
        if (focused && focused !== document.body && focused.isConnected) return;
        const bar = barRef.current;
        const destination = pending.targetId
            ? bar?.querySelector<HTMLElement>(`[data-folder-open="${CSS.escape(pending.targetId)}"]`)
            : null;
        (destination ?? bar?.querySelector<HTMLElement>('[data-folder-focus]'))?.focus();
    }, [folders]);

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
                        isDropTarget={dropFolderId === folder.id}
                        onOpen={onSelect}
                        onRename={onRename}
                        onDelete={onDelete}
                        onShare={onShare}
                        shared={isFolderShared?.(folder) ?? false}
                        moveMenu={
                            onMoveFolder && (
                                <MoveToMenu
                                    folders={folders}
                                    kind={kind}
                                    movingFolderId={folder.id}
                                    currentFolderId={parentId}
                                    rootLabel={t('folders.move_to_root')}
                                    onMove={(target) => {
                                        pendingMoveTarget.current = { targetId: target };
                                        onMoveFolder(folder, target);
                                    }}
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
