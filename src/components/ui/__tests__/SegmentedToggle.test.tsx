import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SegmentedToggle from '../SegmentedToggle';

const options = [
    { value: 'cards' as const, label: 'Cards' },
    { value: 'list' as const, label: 'List' },
];

describe('SegmentedToggle', () => {
    it('renders every option', () => {
        render(<SegmentedToggle options={options} value="cards" onChange={() => {}} ariaLabel="View" />);
        expect(screen.getByRole('button', { name: 'Cards' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'List' })).toBeTruthy();
    });

    it('marks the active option with aria-pressed', () => {
        render(<SegmentedToggle options={options} value="list" onChange={() => {}} ariaLabel="View" />);
        expect(screen.getByRole('button', { name: 'List' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: 'Cards' }).getAttribute('aria-pressed')).toBe('false');
    });

    it('calls onChange with the clicked option value', () => {
        const onChange = vi.fn();
        render(<SegmentedToggle options={options} value="cards" onChange={onChange} ariaLabel="View" />);
        fireEvent.click(screen.getByRole('button', { name: 'List' }));
        expect(onChange).toHaveBeenCalledWith('list');
    });

    it('exposes the group aria-label', () => {
        render(<SegmentedToggle options={options} value="cards" onChange={() => {}} ariaLabel="View mode" />);
        expect(screen.getByRole('group', { name: 'View mode' })).toBeTruthy();
    });
});
