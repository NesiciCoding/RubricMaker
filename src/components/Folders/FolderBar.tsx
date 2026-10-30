import { useTranslation } from 'react-i18next';
import { FolderPlus, LayoutGrid } from 'lucide-react';
import type { Folder } from '../../types';
import CardGrid from '../ui/CardGrid';
import FolderTile from './FolderTile';
import { ALL_FOLDERS } from '../../utils/folders';

export interface FolderBarProps {
    folders: Folder[];
    /** `ALL_FOLDERS` or the folder currently filtering the list. */
    activeFolder: string;
    /** Items filed under a folder, shown on its tile. */
    countFor: (folderId: string) => number;
    /** Folder tile the pointer is over while a card is being dragged. */
    dropFolderId?: string | null;
    onOpen: (folderId: string) => void;
    onRename: (folder: Folder) => void;
    onDelete: (folder: Folder) => void;
    onCreate: () => void;
}

/**
 * The folder row above a card list: "All", one tile per folder, and the create button.
 *
 * Must be rendered inside the list's `DragDropContext` — each FolderTile is a dnd Droppable, so
 * a card can be dropped on it.
 */
export default function FolderBar({
    folders,
    activeFolder,
    countFor,
    dropFolderId = null,
    onOpen,
    onRename,
    onDelete,
    onCreate,
}: FolderBarProps) {
    const { t } = useTranslation();
    return (
        <CardGrid gap={12} style={{ marginBottom: 20 }}>
            <button
                type="button"
                className={`btn btn-sm ${activeFolder === ALL_FOLDERS ? 'btn-primary' : 'btn-secondary'}`}
                aria-pressed={activeFolder === ALL_FOLDERS}
                onClick={() => onOpen(ALL_FOLDERS)}
            >
                <LayoutGrid size={14} /> {t('folders.all')}
            </button>
            {folders.map((folder) => (
                <FolderTile
                    key={folder.id}
                    folder={folder}
                    count={countFor(folder.id)}
                    active={activeFolder === folder.id}
                    isDropTarget={dropFolderId === folder.id}
                    onOpen={onOpen}
                    onRename={onRename}
                    onDelete={onDelete}
                />
            ))}
            <button type="button" className="btn btn-secondary btn-sm" onClick={onCreate}>
                <FolderPlus size={14} /> {t('folders.new_folder')}
            </button>
        </CardGrid>
    );
}
