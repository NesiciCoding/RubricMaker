import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderInput, Folder as FolderIcon } from 'lucide-react';
import type { Folder, FolderKind } from '../../types';
import { canNestFolder, childFolders, descendantFolderIds } from '../../utils/folders';
import DropdownMenu from '../ui/DropdownMenu';

export interface MoveToMenuProps {
    /** Every folder of this kind; the menu renders the whole tree, indented, as targets. */
    folders: Folder[];
    kind: FolderKind;
    /** Where the item sits now — that entry is shown but not selectable. */
    currentFolderId?: string;
    /**
     * Set when a folder itself is being moved. Targets that would make it its own ancestor, or
     * push its subtree past the nesting limit, are refused through `canNestFolder`.
     */
    movingFolderId?: string;
    /** Label for the "no folder" target — "Top level" for folders, "No folder" for cards. */
    rootLabel: string;
    onMove: (folderId: string | undefined) => void;
}

interface Target {
    folder: Folder;
    depth: number;
    /** Why this entry cannot be picked; undefined means it can. */
    blocked?: 'here' | 'self' | 'descendant' | 'depth';
}

/** The tree in reading order, each folder tagged with its depth and whether it can be a target. */
function targets(folders: Folder[], kind: FolderKind, props: MoveToMenuProps): Target[] {
    // The moving folder's own subtree is a separate refusal from the depth limit, so the menu can
    // say why: a cycle and "this would be five levels deep" are not the same mistake.
    const subtree = props.movingFolderId ? descendantFolderIds(folders, props.movingFolderId) : [];
    const walk = (parentId: string | undefined, depth: number): Target[] =>
        childFolders(folders, kind, parentId).flatMap((folder) => {
            const blocked =
                folder.id === props.currentFolderId
                    ? ('here' as const)
                    : folder.id === props.movingFolderId
                      ? ('self' as const)
                      : subtree.includes(folder.id)
                        ? ('descendant' as const)
                        : props.movingFolderId && !canNestFolder(folders, props.movingFolderId, folder.id)
                          ? ('depth' as const)
                          : undefined;
            return [{ folder, depth, blocked }, ...walk(folder.id, depth + 1)];
        });
    return walk(undefined, 0);
}

/**
 * "Move to…" for a folder or a card: one menu listing every folder and subfolder, indented by
 * level, plus the top level itself.
 *
 * Dragging onto a folder tile still works and is faster when the target is on screen, but tiles
 * only ever show one level — this menu is how you reach a folder that is nested somewhere else,
 * and how you file something without a pointer.
 */
export default function MoveToMenu(props: MoveToMenuProps) {
    const { t } = useTranslation();
    const anchorRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const entries = useMemo(() => targets(props.folders, props.kind, props), [props]);

    // A folder that is already at the top level, or a card that is already unfiled, has nothing
    // to gain from the root entry.
    const showRoot = props.currentFolderId !== undefined;

    const choose = (folderId: string | undefined) => {
        setOpen(false);
        props.onMove(folderId);
    };

    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                title={t('folders.move_to')}
                aria-label={t('folders.move_to')}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen((current) => !current);
                }}
            >
                <FolderInput size={14} />
            </button>
            <DropdownMenu
                open={open}
                onClose={() => setOpen(false)}
                anchorRef={anchorRef}
                minWidth={220}
                ariaLabel={t('folders.move_to')}
            >
                {showRoot && (
                    <button
                        type="button"
                        role="menuitem"
                        className="btn btn-ghost btn-sm"
                        style={{ justifyContent: 'flex-start' }}
                        onClick={() => choose(undefined)}
                    >
                        {props.rootLabel}
                    </button>
                )}
                {entries.length === 0 && (
                    <span className="text-muted text-xs" style={{ padding: '6px 10px' }}>
                        {t('folders.move_no_folders')}
                    </span>
                )}
                {entries.map(({ folder, depth, blocked }) => (
                    <button
                        key={folder.id}
                        type="button"
                        role="menuitem"
                        className="btn btn-ghost btn-sm"
                        disabled={blocked !== undefined}
                        title={
                            blocked === 'here'
                                ? t('folders.move_already_here')
                                : blocked === 'self'
                                  ? t('folders.move_into_self')
                                  : blocked === 'descendant'
                                    ? t('folders.move_into_subfolder')
                                    : blocked === 'depth'
                                      ? t('folders.move_too_deep')
                                      : undefined
                        }
                        style={{
                            justifyContent: 'flex-start',
                            paddingLeft: 10 + depth * 16,
                            opacity: blocked ? 0.55 : undefined,
                        }}
                        onClick={() => choose(folder.id)}
                    >
                        <FolderIcon size={13} aria-hidden="true" style={{ color: 'var(--accent)' }} />
                        {folder.name}
                    </button>
                ))}
            </DropdownMenu>
        </>
    );
}
