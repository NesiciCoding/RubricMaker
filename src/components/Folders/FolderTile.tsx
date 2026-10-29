import { useTranslation } from 'react-i18next';
import { Droppable } from '@hello-pangea/dnd';
import { Folder as FolderIcon, Pencil, Trash2 } from 'lucide-react';
import type { Folder } from '../../types';

export const FOLDER_DROP_PREFIX = 'folder-drop:';

export interface FolderTileProps {
    folder: Folder;
    count: number;
    /** Folders directly inside this one; shown as a second line so a nested folder reads as nested. */
    subfolderCount?: number;
    active: boolean;
    /** Highlight from the pointer tracker: the card being dragged is over this tile. */
    isDropTarget?: boolean;
    onOpen: (folderId: string) => void;
    onRename: (folder: Folder) => void;
    onDelete: (folder: Folder) => void;
}

/** A compact Drive-style folder tile that is both a filter and a drop target for the cards. */
export default function FolderTile({
    folder,
    count,
    subfolderCount = 0,
    active,
    onOpen,
    onRename,
    onDelete,
}: FolderTileProps) {
    const { t } = useTranslation();
    return (
        <Droppable droppableId={`${FOLDER_DROP_PREFIX}${folder.id}`}>
            {(provided, snapshot) => {
                const dropHover = snapshot.isDraggingOver || isDropTarget;
                return (
                    <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        // Read by useFolderDropTarget to resolve the tile under the dragging pointer.
                        data-drop-folder-id={folder.id}
                        className="card"
                        style={{
                            flex: '0 1 220px',
                            padding: 10,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            borderColor: dropHover || active ? 'var(--accent)' : 'var(--border)',
                            background: dropHover ? 'var(--accent-soft)' : active ? 'var(--bg-elevated)' : undefined,
                            transition: 'border-color var(--transition)',
                            minWidth: 0,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                            <FolderIcon
                                size={16}
                                style={{ color: 'var(--accent)', flexShrink: 0 }}
                                aria-hidden="true"
                            />
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => onOpen(folder.id)}
                                title={folder.name}
                                aria-pressed={active}
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                    justifyContent: 'flex-start',
                                    padding: '2px 4px',
                                    fontSize: '0.85rem',
                                }}
                            >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {folder.name}
                                </span>
                            </button>
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon btn-sm"
                                title={t('folders.rename')}
                                aria-label={t('folders.rename')}
                                onClick={() => onRename(folder)}
                            >
                                <Pencil size={13} />
                            </button>
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon btn-sm"
                                title={t('folders.delete')}
                                aria-label={t('folders.delete')}
                                style={{ color: 'var(--red)' }}
                                onClick={() => onDelete(folder)}
                            >
                                <Trash2 size={13} />
                            </button>
                        </div>
                        <div className="text-muted text-xs" style={{ paddingLeft: 22 }}>
                            {t('folders.items_count', { count })}
                        </div>
                        {provided.placeholder}
                    </div>
                    <div className="text-muted text-xs" style={{ paddingLeft: 22 }}>
                        {t('folders.items_count', { count })}
                        {subfolderCount > 0 && <> · {t('folders.subfolder_count', { count: subfolderCount })}</>}
                    </div>
                    {provided.placeholder}
                </div>
            )}
        </Droppable>
    );
}
