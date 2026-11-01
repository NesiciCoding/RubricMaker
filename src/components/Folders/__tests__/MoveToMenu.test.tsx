import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Folder } from '../../../types';
import MoveToMenu from '../MoveToMenu';

// Keys, so the assertions can read the labels and titles the menu was given.
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
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
    folder({ id: 'year2', name: 'Year 2' }),
];

function openMenu(overrides: Partial<React.ComponentProps<typeof MoveToMenu>> = {}) {
    const props = {
        folders: tree,
        kind: 'rubric' as const,
        rootLabel: 'folders.move_to_unfiled',
        onMove: vi.fn(),
        ...overrides,
    };
    render(<MoveToMenu {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'folders.move_to' }));
    return props;
}

function item(name: string): HTMLElement {
    const menu = screen.getByRole('menu', { name: 'folders.move_to' });
    return within(menu).getByRole('menuitem', { name });
}

describe('MoveToMenu', () => {
    it('lists the whole tree in reading order, indented by depth', () => {
        openMenu();
        const menu = screen.getByRole('menu', { name: 'folders.move_to' });
        const labels = within(menu)
            .getAllByRole('menuitem')
            .map((el) => el.textContent?.trim());
        expect(labels).toEqual(['Year 1', 'Essays', 'Drafts', 'Year 2']);
        // Nested entries are pushed right by their depth, so the hierarchy is visible, not implied.
        expect(item('Essays').style.paddingLeft).toBe('26px');
        expect(item('Drafts').style.paddingLeft).toBe('42px');
        expect(item('Year 2').style.paddingLeft).toBe('10px');
    });

    it('offers the top level only when the item is filed somewhere', () => {
        openMenu({ currentFolderId: 'year2' });
        expect(item('folders.move_to_unfiled')).toBeInTheDocument();
    });

    it('does not offer the top level when the item is already unfiled', () => {
        openMenu();
        expect(
            within(screen.getByRole('menu', { name: 'folders.move_to' })).queryByRole('menuitem', {
                name: 'folders.move_to_unfiled',
            })
        ).not.toBeInTheDocument();
    });

    it('marks where the item sits now as unavailable', () => {
        openMenu({ currentFolderId: 'year2' });
        expect(item('Year 2')).toBeDisabled();
        expect(item('Year 2')).toHaveAttribute('title', 'folders.move_already_here');
    });

    it('refuses to move a folder into itself or into its own subtree', () => {
        openMenu({ movingFolderId: 'year1', currentFolderId: undefined });
        expect(item('Year 1')).toBeDisabled();
        expect(item('Year 1')).toHaveAttribute('title', 'folders.move_into_self');
        expect(item('Essays')).toBeDisabled();
        expect(item('Essays')).toHaveAttribute('title', 'folders.move_into_subfolder');
        expect(item('Drafts')).toBeDisabled();
        expect(item('Year 2')).toBeEnabled();
    });

    it('explains the depth limit separately from a cycle', () => {
        // `drafts` is a leaf at level 3, so a leaf can go in at level 4 but nothing deeper.
        const deep = [...tree, folder({ id: 'final', name: 'Final', parentId: 'drafts' })];
        openMenu({ folders: deep, movingFolderId: 'year2' });
        expect(item('Final')).toBeDisabled();
        expect(item('Final')).toHaveAttribute('title', 'folders.move_too_deep');
    });

    it('moves into the chosen folder and closes', () => {
        const props = openMenu();
        fireEvent.click(item('Drafts'));
        expect(props.onMove).toHaveBeenCalledWith('drafts');
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('moves back to the top level', () => {
        const props = openMenu({ currentFolderId: 'year1' });
        fireEvent.click(item('folders.move_to_unfiled'));
        expect(props.onMove).toHaveBeenCalledWith(undefined);
    });

    it('says so when there is nothing to move into', () => {
        openMenu({ folders: [] });
        expect(screen.getByText('folders.move_no_folders')).toBeInTheDocument();
    });

    it('closes on Escape and returns focus to the trigger', () => {
        openMenu();
        fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'folders.move_to' }));
    });
});
