import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GradingActionsMenu, { GradingAction } from '../GradingActionsMenu';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

function makeActions(): { actions: GradingAction[]; clicks: ReturnType<typeof vi.fn>[] } {
    const clicks = [vi.fn(), vi.fn(), vi.fn()];
    return {
        clicks,
        actions: [
            { key: 'a1', icon: <span>i1</span>, label: 'Action One', onClick: clicks[0] },
            { key: 'a2', icon: <span>i2</span>, label: 'Action Two', onClick: clicks[1], danger: true },
            { key: 'a3', icon: <span>i3</span>, label: 'Active Toggle', onClick: clicks[2], active: true },
        ],
    };
}

function openMenu() {
    fireEvent.click(screen.getByLabelText('gradeStudent.more_actions'));
}

describe('GradingActionsMenu coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders nothing when there are no actions', () => {
        const { container } = render(<GradingActionsMenu actions={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it('opens the menu, renders the items with styling, and fires the action on click', () => {
        const { actions, clicks } = makeActions();
        render(<GradingActionsMenu actions={actions} />);
        const trigger = screen.getByLabelText('gradeStudent.more_actions');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');

        openMenu();
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('menu')).toBeInTheDocument();

        const items = screen.getAllByRole('menuitem');
        expect(items).toHaveLength(3);
        expect(items[1]).toHaveStyle({ color: 'var(--red)' });
        expect(items[2]).toHaveStyle({ color: 'var(--accent)' });
        expect(screen.getByText('✓')).toBeInTheDocument();

        fireEvent.click(items[1]);
        expect(clicks[1]).toHaveBeenCalled();
        // Item clicks close the menu without refocusing the trigger.
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(document.activeElement).not.toBe(trigger);
    });

    it('closes when the trigger is clicked again', () => {
        const { actions } = makeActions();
        render(<GradingActionsMenu actions={actions} />);
        openMenu();
        expect(screen.getByRole('menu')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('gradeStudent.more_actions'));
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('closes on an outside mousedown but not on an inside one', () => {
        const { actions } = makeActions();
        render(<GradingActionsMenu actions={actions} />);
        openMenu();
        fireEvent.mouseDown(screen.getByLabelText('gradeStudent.more_actions'));
        expect(screen.getByRole('menu')).toBeInTheDocument();
        fireEvent.mouseDown(document.body);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('closes on Escape and returns focus to the trigger', () => {
        const { actions } = makeActions();
        render(<GradingActionsMenu actions={actions} />);
        const trigger = screen.getByLabelText('gradeStudent.more_actions');
        openMenu();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(document.activeElement).toBe(trigger);
    });

    it('navigates the items with ArrowDown, ArrowUp, Home and End', () => {
        const { actions } = makeActions();
        render(<GradingActionsMenu actions={actions} />);
        openMenu();
        const menu = screen.getByRole('menu');
        const items = screen.getAllByRole('menuitem');

        // Focus moves into the first item on open.
        expect(document.activeElement).toBe(items[0]);

        fireEvent.keyDown(menu, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(items[1]);
        fireEvent.keyDown(menu, { key: 'ArrowUp' });
        expect(document.activeElement).toBe(items[0]);
        // ArrowUp wraps around to the last item.
        fireEvent.keyDown(menu, { key: 'ArrowUp' });
        expect(document.activeElement).toBe(items[2]);
        fireEvent.keyDown(menu, { key: 'Home' });
        expect(document.activeElement).toBe(items[0]);
        fireEvent.keyDown(menu, { key: 'End' });
        expect(document.activeElement).toBe(items[2]);
        fireEvent.keyDown(menu, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(items[0]);

        // An unhandled key falls through the whole navigation chain.
        fireEvent.keyDown(menu, { key: 'Tab' });
        expect(document.activeElement).toBe(items[0]);
    });

    it('repositions the menu on open from the trigger rect', () => {
        const { actions } = makeActions();
        render(<GradingActionsMenu actions={actions} />);
        openMenu();
        const menu = screen.getByRole('menu');
        expect(menu.style.position).toBe('fixed');
    });

    it('closes the menu on window resize and scroll', () => {
        const { actions } = makeActions();
        render(<GradingActionsMenu actions={actions} />);
        openMenu();
        fireEvent(window, new Event('resize'));
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        openMenu();
        fireEvent(window, new Event('scroll'));
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
});
