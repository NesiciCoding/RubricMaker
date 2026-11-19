import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NudgeMenu, { NUDGE_PRESETS } from './NudgeMenu';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

describe('NudgeMenu', () => {
    it('stays closed until the trigger is clicked', () => {
        render(<NudgeMenu onSend={vi.fn()} />);

        expect(screen.queryByRole('menu')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'tests.monitor.nudge_button' }));
        expect(screen.getByRole('menu')).toBeInTheDocument();
        expect(screen.getAllByRole('menuitem')).toHaveLength(NUDGE_PRESETS.length);
    });

    it('sends the chosen preset and closes', () => {
        const onSend = vi.fn();
        render(<NudgeMenu onSend={onSend} />);
        fireEvent.click(screen.getByRole('button', { name: 'tests.monitor.nudge_button' }));

        fireEvent.click(screen.getByRole('menuitem', { name: 'tests.monitor.nudge.preset_time' }));

        expect(onSend).toHaveBeenCalledWith('tests.monitor.nudge.preset_time');
        expect(screen.queryByRole('menu')).toBeNull();
    });

    it('closes on Escape without sending anything', () => {
        const onSend = vi.fn();
        render(<NudgeMenu onSend={onSend} />);
        fireEvent.click(screen.getByRole('button', { name: 'tests.monitor.nudge_button' }));

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(screen.queryByRole('menu')).toBeNull();
        expect(onSend).not.toHaveBeenCalled();
    });

    it('keeps an accessible name when rendered as an icon-only trigger', () => {
        render(<NudgeMenu onSend={vi.fn()} iconOnly />);

        expect(screen.getByRole('button', { name: 'tests.monitor.nudge_button' })).toBeInTheDocument();
    });

    it('moves focus into the menu on a keyboard open and arrows through the presets', () => {
        render(<NudgeMenu onSend={vi.fn()} />);
        const trigger = screen.getByRole('button', { name: 'tests.monitor.nudge_button' });

        fireEvent.keyDown(trigger, { key: 'ArrowDown' });

        const items = screen.getAllByRole('menuitem');
        expect(document.activeElement).toBe(items[0]);
        fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
        expect(document.activeElement).toBe(items[1]);
        fireEvent.keyDown(screen.getByRole('menu'), { key: 'End' });
        expect(document.activeElement).toBe(items[items.length - 1]);
        fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
        expect(document.activeElement).toBe(items[0]);
    });

    it('returns focus to the trigger after Escape and after picking a preset', () => {
        render(<NudgeMenu onSend={vi.fn()} />);
        const trigger = screen.getByRole('button', { name: 'tests.monitor.nudge_button' });

        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(document.activeElement).toBe(trigger);

        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        fireEvent.click(screen.getAllByRole('menuitem')[0]);
        expect(document.activeElement).toBe(trigger);
    });

    it('does not pull focus back when the menu closes from a click elsewhere', () => {
        render(
            <div>
                <NudgeMenu onSend={vi.fn()} />
                <button>Elsewhere</button>
            </div>
        );
        fireEvent.click(screen.getByRole('button', { name: 'tests.monitor.nudge_button' }));
        const other = screen.getByText('Elsewhere');
        other.focus();

        fireEvent.pointerDown(other);

        expect(screen.queryByRole('menu')).toBeNull();
        expect(document.activeElement).toBe(other);
    });
});
