import { useTranslation } from 'react-i18next';
import { Droppable } from '@hello-pangea/dnd';
import { Folder as FolderIcon, Pencil, Trash2 } from 'lucide-react';
import type { Folder } from '../../types';

export const FOLDER_DROP_PREFIX = 'folder-drop:';

export interface FolderTileProps {
    folder: Folder;
    count: number;
    active: boolean;
    onOpen: (folderId: string) => void;
    onRename: (folder: Folder) => void;
    onDelete: (folder: Folder) => void;
}

/** A compact Drive-style folder tile that is both a filter and a drop target for the cards. */
export default function FolderTile({ folder, count, active, onOpen, onRename, onDelete }: FolderTileProps) {
    const { t } = useTranslation();
    return (
        <Droppable droppableId={`${FOLDER_DROP_PREFIX}${folder.id}`}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="card"
                    style={{
                        flex: '0 1 220px',
                        padding: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        borderColor: snapshot.isDraggingOver || active ? 'var(--accent)' : 'var(--border)',
                        background: snapshot.isDraggingOver
                            ? 'var(--accent-soft)'
                            : active
                              ? 'var(--bg-elevated)'
                              : undefined,
                        transition: 'border-color var(--transition)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                        <FolderIcon size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} aria-hidden="true" />
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
            )}
        </Droppable>
    );
}
