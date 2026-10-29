import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DragDropContext } from '@hello-pangea/dnd';
import FolderBar from './FolderBar';
import { ALL_FOLDERS } from '../../utils/folders';
import type { Folder } from '../../types';

const now = '2026-01-01T00:00:00.000Z';
const folders: Folder[] = [
    { id: 'f1', name: 'Term 1', kind: 'rubric', createdAt: now, displayOrder: 0 },
    { id: 'f2', name: 'Term 2', kind: 'rubric', createdAt: now, displayOrder: 1 },
];

// FolderTile is a dnd Droppable, so the bar has to live inside a DragDropContext — the same
// contract every list page honours.
function renderBar(props: Partial<React.ComponentProps<typeof FolderBar>> = {}) {
    const handlers = {
        onOpen: vi.fn(),
        onRename: vi.fn(),
        onDelete: vi.fn(),
        onCreate: vi.fn(),
    };
    render(
        <DragDropContext onDragEnd={() => {}}>
            <FolderBar
                folders={folders}
                activeFolder={ALL_FOLDERS}
                countFor={(id) => (id === 'f1' ? 2 : 0)}
                {...handlers}
                {...props}
            />
        </DragDropContext>
    );
    return handlers;
}

describe('FolderBar', () => {
    it('renders All, every folder with its count, and the create button', () => {
        renderBar();

        expect(screen.getByText('folders.all')).toBeInTheDocument();
        expect(screen.getByText('Term 1')).toBeInTheDocument();
        expect(screen.getByText('Term 2')).toBeInTheDocument();
        expect(screen.getByText('folders.new_folder')).toBeInTheDocument();
        // The count comes from the page, so each list can count its own collection.
        expect(screen.getByText(/2/)).toBeInTheDocument();
    });

    it('marks the active folder pressed and reports opens', () => {
        const handlers = renderBar({ activeFolder: 'f2' });

        const active = screen.getByRole('button', { name: /Term 2/ });
        expect(active).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: /Term 1/ })).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(screen.getByRole('button', { name: /Term 1/ }));
        expect(handlers.onOpen).toHaveBeenCalledWith('f1');

        fireEvent.click(screen.getByRole('button', { name: /folders\.all/ }));
        expect(handlers.onOpen).toHaveBeenCalledWith(ALL_FOLDERS);
    });

    it('routes rename, delete and create to the page', () => {
        const handlers = renderBar();
        const tile = screen.getByRole('button', { name: /Term 1/ }).closest('.card') as HTMLElement;

        fireEvent.click(within(tile).getByRole('button', { name: 'folders.rename' }));
        expect(handlers.onRename).toHaveBeenCalledWith(folders[0]);

        fireEvent.click(within(tile).getByRole('button', { name: 'folders.delete' }));
        expect(handlers.onDelete).toHaveBeenCalledWith(folders[0]);

        fireEvent.click(screen.getByText('folders.new_folder'));
        expect(handlers.onCreate).toHaveBeenCalled();
    });

    it('highlights the folder the pointer is over while a card is dragged', () => {
        renderBar({ dropFolderId: 'f2' });
        const highlighted = screen.getByRole('button', { name: /Term 2/ }).closest('.card') as HTMLElement;
        expect(highlighted.getAttribute('style') ?? '').toMatch(/border|background/);
    });
});
