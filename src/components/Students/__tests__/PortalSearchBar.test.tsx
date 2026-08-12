import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PortalSearchBar from '../PortalSearchBar';
import type { PortalSearchResult } from '../../../utils/portalSearch';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const results: PortalSearchResult[] = [
    { type: 'work', id: 's1', label: 'Alice', sectionId: 'portal-section-work' },
    { type: 'grade', id: 'r1', label: 'Essay Rubric', sectionId: 'portal-section-feedback' },
];

describe('PortalSearchBar', () => {
    it('forwards query changes and shows the dropdown once the query is non-empty', () => {
        const onQueryChange = vi.fn();
        const { rerender } = render(
            <PortalSearchBar query="" onQueryChange={onQueryChange} results={results} onSelect={vi.fn()} />
        );
        const input = screen.getByLabelText('studentPortal.search_placeholder');
        fireEvent.change(input, { target: { value: 'ali' } });
        expect(onQueryChange).toHaveBeenCalledWith('ali');

        rerender(<PortalSearchBar query="ali" onQueryChange={onQueryChange} results={results} onSelect={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'Alice' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Essay Rubric' })).toBeInTheDocument();
    });

    it('hides the dropdown while the query is empty or whitespace-only', () => {
        render(<PortalSearchBar query="  " onQueryChange={vi.fn()} results={results} onSelect={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'Alice' })).not.toBeInTheDocument();
        expect(screen.queryByText('search.no_results')).not.toBeInTheDocument();
    });

    it('shows the no-results message when nothing matches', () => {
        render(<PortalSearchBar query="zzz" onQueryChange={vi.fn()} results={[]} onSelect={vi.fn()} />);
        expect(screen.getByText('search.no_results')).toBeInTheDocument();
    });

    it('calls onSelect with the clicked result', () => {
        const onSelect = vi.fn();
        render(<PortalSearchBar query="ali" onQueryChange={vi.fn()} results={results} onSelect={onSelect} />);
        fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
        expect(onSelect).toHaveBeenCalledWith(results[0]);
    });
});
