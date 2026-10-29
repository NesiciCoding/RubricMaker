import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Folder } from '../../../types';
import FolderBar from '../FolderBar';

// FolderTile is a dnd droppable; the bar's own behaviour does not need the drag machinery.
vi.mock('@hello-pangea/dnd', () => ({
    Droppable: ({ children }: { children: (p: unknown, s: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }, { isDraggingOver: false }),
}));

// Keys, with `count` appended, so the assertions can see which numbers the tiles were given.
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) =>
            opts && typeof opts.count === 'number' ? `${key}:${opts.count}` : key,
        i18n: { language: 'en' },
    }),
}));

function folder(overrides: Partial<Folder> = {}): Folder {
    return {
        id: 'f1',
        name: 'Year 1',
        kind: 'rubric',
        createdAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

const tree = [
    folder({ id: 'year1', name: 'Year 1' }),
    folder({ id: 'essays', name: 'Essays', parentId: 'year1' }),
    folder({ id: 'drafts', name: 'Drafts', parentId: 'essays' }),
    folder({ id: 'final', name: 'Final', parentId: 'drafts' }),
    folder({ id: 'year2', name: 'Year 2' }),
];

function renderBar(overrides: Partial<React.ComponentProps<typeof FolderBar>> = {}) {
    const props = {
        folders: tree,
        kind: 'rubric' as const,
        activeFolderId: 'all',
        items: [] as { folderId?: string }[],
        onSelect: vi.fn(),
        onCreate: vi.fn(),
        onRename: vi.fn(),
        onDelete: vi.fn(),
        ...overrides,
    };
    const view = render(<FolderBar {...props} />);
    return {
        props,
        rerender: (next: Partial<React.ComponentProps<typeof FolderBar>>) =>
            view.rerender(<FolderBar {...props} {...next} />),
    };
}

describe('FolderBar', () => {
    it('shows only the top-level folders in the all view', () => {
        renderBar();
        expect(screen.getByRole('button', { name: 'folders.all' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Year 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Year 2' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Essays' })).not.toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: 'folders.path_label' })).not.toBeInTheDocument();
    });

    it('opens a folder by selecting it', () => {
        const { props } = renderBar();
        fireEvent.click(screen.getByRole('button', { name: 'Year 1' }));
        expect(props.onSelect).toHaveBeenCalledWith('year1');
    });

    it('creates at the top level from the all view', () => {
        const { props } = renderBar();
        fireEvent.click(screen.getByRole('button', { name: /folders.new_folder/ }));
        expect(props.onCreate).toHaveBeenCalledWith(undefined);
    });

    it('shows the breadcrumb and the subfolders once inside a folder', () => {
        const { props } = renderBar({ activeFolderId: 'year1' });
        const crumbs = screen.getByRole('navigation', { name: 'folders.path_label' });
        expect(within(crumbs).getByRole('button', { name: 'folders.all' })).toBeInTheDocument();
        expect(within(crumbs).getByRole('button', { name: 'Year 1' })).toHaveAttribute('aria-current', 'page');
        // The sibling at the top level is out of sight; the current folder's children are shown.
        expect(screen.getByRole('button', { name: 'Essays' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Year 2' })).not.toBeInTheDocument();

        fireEvent.click(within(crumbs).getByRole('button', { name: 'folders.all' }));
        expect(props.onSelect).toHaveBeenCalledWith('all');
    });

    it('creates inside the current folder and says so', () => {
        const { props } = renderBar({ activeFolderId: 'year1' });
        fireEvent.click(screen.getByRole('button', { name: /folders.new_subfolder/ }));
        expect(props.onCreate).toHaveBeenCalledWith('year1');
    });

    it('counts the items filed in subfolders too, and shows how many folders there are', () => {
        const items = [{ folderId: 'essays' }, { folderId: 'drafts' }, { folderId: 'year2' }, {}];
        renderBar({ items });
        const tile = screen.getByRole('button', { name: 'Year 1' }).closest('.card') as HTMLElement;
        expect(tile).toHaveTextContent('folders.items_count:2');
        expect(tile).toHaveTextContent('folders.subfolder_count:1');
    });

    it('stops offering a new subfolder at the maximum depth', () => {
        renderBar({ activeFolderId: 'final' });
        const create = screen.getByRole('button', { name: /folders.new_subfolder/ });
        expect(create).toBeDisabled();
        expect(create).toHaveAttribute('title', 'folders.max_depth');
    });

    it('keeps keyboard focus in the bar when the tile it was on unmounts', () => {
        const { rerender } = renderBar();
        const tile = screen.getByRole('button', { name: 'Year 1' });
        tile.focus();
        // Re-render the way the page does once the folder opens: the tile is gone.
        rerender({ activeFolderId: 'year1' });
        const crumb = screen.getByRole('button', { name: 'Year 1' });
        expect(crumb).toHaveAttribute('aria-current', 'page');
        expect(document.activeElement).toBe(crumb);
    });

    it('leaves focus alone when it was outside the bar', () => {
        const outside = document.createElement('button');
        outside.textContent = 'Elsewhere';
        document.body.appendChild(outside);
        outside.focus();
        const { rerender } = renderBar();
        rerender({ activeFolderId: 'year1' });
        expect(document.activeElement).toBe(outside);
        outside.remove();
    });

    it('falls back to the top level when the selected folder is gone', () => {
        renderBar({ activeFolderId: 'deleted-on-another-device' });
        expect(screen.queryByRole('navigation', { name: 'folders.path_label' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'folders.all' })).toHaveAttribute('aria-pressed', 'true');
    });
});
