import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CohortFilter from '../CohortFilter';
import type { Class, CohortFilter as CohortFilterValue } from '../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const classWithYearAndTrack: Class = { id: 'c1', name: '1B', year: 'jaar-2', voTrack: 'havo' };
const classWithYearOnly: Class = { id: 'c2', name: 'Groep 8', year: 'groep-8' };

const value: CohortFilterValue = { year: 'all', voTrack: 'all' };

describe('CohortFilter', () => {
    it('renders nothing when there are no years or tracks to filter by', () => {
        const { container } = render(<CohortFilter classes={[]} value={value} onChange={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders a year dropdown when classes have school years', () => {
        render(<CohortFilter classes={[classWithYearOnly]} value={value} onChange={vi.fn()} />);
        const yearSelect = screen.getByLabelText('statistics.filters.year');
        expect(yearSelect).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Groep 8' })).toBeInTheDocument();
    });

    it('renders a track dropdown only when a class has a VO track', () => {
        render(<CohortFilter classes={[classWithYearOnly]} value={value} onChange={vi.fn()} />);
        expect(screen.queryByLabelText('statistics.filters.track')).not.toBeInTheDocument();

        render(<CohortFilter classes={[classWithYearAndTrack]} value={value} onChange={vi.fn()} />);
        expect(screen.getByLabelText('statistics.filters.track')).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'voTrack.havo' })).toBeInTheDocument();
    });

    it('reports year changes with the previous value spread in', () => {
        const onChange = vi.fn();
        render(
            <CohortFilter
                classes={[classWithYearAndTrack]}
                value={{ year: 'all', voTrack: 'havo' }}
                onChange={onChange}
            />
        );
        fireEvent.change(screen.getByLabelText('statistics.filters.year'), { target: { value: 'jaar-2' } });
        expect(onChange).toHaveBeenCalledWith({ year: 'jaar-2', voTrack: 'havo' });
    });

    it('reports track changes with the previous value spread in', () => {
        const onChange = vi.fn();
        render(
            <CohortFilter
                classes={[classWithYearAndTrack]}
                value={{ year: 'jaar-2', voTrack: 'all' }}
                onChange={onChange}
            />
        );
        fireEvent.change(screen.getByLabelText('statistics.filters.track'), { target: { value: 'vwo' } });
        expect(onChange).toHaveBeenCalledWith({ year: 'jaar-2', voTrack: 'vwo' });
    });
});
