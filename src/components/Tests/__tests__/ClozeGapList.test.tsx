import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ClozeGapList from '../ClozeGapList';

describe('ClozeGapList', () => {
    it('renders nothing when the passage has no gaps', () => {
        const { container } = render(<ClozeGapList prompt="No gaps here." onChange={vi.fn()} rolesEditable={false} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('lists typed gaps by number, with no ticks since every alternative is accepted', () => {
        render(<ClozeGapList prompt={'I {{went|go}} and {{saw}}.'} onChange={vi.fn()} rolesEditable={false} />);
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
        expect(screen.getByText('went')).toBeInTheDocument();
        expect(screen.getByText('go')).toBeInTheDocument();
        expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    });

    it('ticks the accepted alternatives of a dropdown gap', () => {
        render(<ClozeGapList prompt="Pick {{Paris|London|Berlin}}." onChange={vi.fn()} rolesEditable />);
        expect(screen.getAllByRole('checkbox').map((box) => (box as HTMLInputElement).checked)).toEqual([
            true,
            false,
            false,
        ]);
    });

    it('writes a newly ticked alternative back into the stored syntax', () => {
        const onChange = vi.fn();
        render(<ClozeGapList prompt="Pick {{Paris|London|Berlin}}." onChange={onChange} rolesEditable />);
        fireEvent.click(screen.getAllByRole('checkbox')[1]);
        expect(onChange).toHaveBeenLastCalledWith('Pick {{=Paris|=London|~Berlin}}.');
    });

    it('unticking a correct alternative keeps the rest of the gap as it was', () => {
        const onChange = vi.fn();
        render(<ClozeGapList prompt="Pick {{=Paris|=London|~Berlin}}." onChange={onChange} rolesEditable />);
        fireEvent.click(screen.getAllByRole('checkbox')[0]);
        expect(onChange).toHaveBeenLastCalledWith('Pick {{~Paris|=London|~Berlin}}.');
    });
});
