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
});
