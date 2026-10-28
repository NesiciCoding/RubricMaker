import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ToggleChipGroup from '../ToggleChipGroup';

const options = [
    { value: 'groep-7' as const, label: 'Groep 7' },
    { value: 'groep-8' as const, label: 'Groep 8', activeColor: '#123456' },
];

describe('ToggleChipGroup', () => {
    it('exposes the label as the group name and marks the active chips pressed', () => {
        render(<ToggleChipGroup label="School Year" options={options} values={['groep-7']} onToggle={vi.fn()} />);
        const group = screen.getByRole('group', { name: 'School Year' });
        expect(screen.getByText('School Year')).toBeInTheDocument();
        expect(within(group).getByRole('button', { name: 'Groep 7' })).toHaveAttribute('aria-pressed', 'true');
        expect(within(group).getByRole('button', { name: 'Groep 8' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('reports the toggled value for both pressing and releasing a chip', () => {
        const onToggle = vi.fn();
        render(<ToggleChipGroup label="School Year" options={options} values={['groep-7']} onToggle={onToggle} />);
        fireEvent.click(screen.getByRole('button', { name: 'Groep 8' }));
        expect(onToggle).toHaveBeenCalledWith('groep-8');
        fireEvent.click(screen.getByRole('button', { name: 'Groep 7' }));
        expect(onToggle).toHaveBeenCalledWith('groep-7');
    });

    it('uses the option color as the active fill and renders the hint', () => {
        render(
            <ToggleChipGroup
                label="VO Track"
                options={options}
                values={['groep-8']}
                onToggle={vi.fn()}
                hint="Pick every track"
            />
        );
        // The active chip takes the option's own colour; jsdom's CSSOM may keep the hex or
        // normalise it to rgb(), so accept either spelling rather than pin the engine's quirk.
        const chip = screen.getByRole('button', { name: 'Groep 8' });
        expect([chip.style.background, chip.style.backgroundColor].join(' ')).toMatch(/#123456|rgb\(18, 52, 86\)/);
        expect(screen.getByTestId('toggle-chip-hint')).toHaveTextContent('Pick every track');
    });

    it('renders no hint element when none is given', () => {
        render(<ToggleChipGroup label="VO Track" options={options} values={[]} onToggle={vi.fn()} />);
        expect(screen.queryByTestId('toggle-chip-hint')).not.toBeInTheDocument();
    });
});
