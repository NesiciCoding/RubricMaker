import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StandardsPickerModal from '../Standards/StandardsPickerModal';
import type { CspJurisdiction, CspStandardSet, CspStandard } from '../../services/standardsApi';
import type { LinkedStandard } from '../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

const mockAddFavorite = vi.fn();
const mockRemoveFavorite = vi.fn();
const mockIsFavorite = vi.fn(() => false);
let mockFavoriteStandards: LinkedStandard[] = [];

vi.mock('../../context/AppContext', () => ({
    useApp: () => ({
        favoriteStandards: mockFavoriteStandards,
        addFavoriteStandard: mockAddFavorite,
        removeFavoriteStandard: mockRemoveFavorite,
        isFavoriteStandard: mockIsFavorite,
    }),
}));

const mockFetchJurisdictions = vi.fn();
const mockFetchStandardSets = vi.fn();
const mockFetchStandardSetDetail = vi.fn();

vi.mock('../../services/standardsApi', async () => {
    const actual = await vi.importActual<typeof import('../../services/standardsApi')>('../../services/standardsApi');
    return {
        ...actual,
        fetchJurisdictions: (...args: unknown[]) => mockFetchJurisdictions(...args),
        fetchStandardSets: (...args: unknown[]) => mockFetchStandardSets(...args),
        fetchStandardSetDetail: (...args: unknown[]) => mockFetchStandardSetDetail(...args),
    };
});

const jurisdictions: CspJurisdiction[] = [
    { id: 'j1', title: 'California', type: 'state' },
    { id: 'j2', title: 'Texas', type: 'state' },
];

const standardSets: CspStandardSet[] = [
    { id: 's1', title: 'ELA Standards', subject: 'English', educationLevels: ['6', '7'] },
    { id: 's2', title: 'Math Standards', subject: 'Mathematics', educationLevels: ['8'] },
];

const standardsMap: Record<string, CspStandard> = {
    a1: { id: 'a1', statementNotation: 'RH.6-8.1', description: 'Cite textual evidence', depth: 0, ancestorIds: [] },
    a2: { id: 'a2', statementNotation: 'RH.6-8.2', description: 'Determine central ideas', depth: 0, ancestorIds: [] },
};

const baseProps = {
    apiKey: 'test-key',
    onSelect: vi.fn(),
    onClose: vi.fn(),
};

async function goToStandardsStep() {
    render(<StandardsPickerModal {...baseProps} />);
    await waitFor(() => expect(screen.getByText('California')).toBeInTheDocument());
    fireEvent.click(screen.getByText('California'));
    await waitFor(() => expect(screen.getByText('ELA Standards')).toBeInTheDocument());
    fireEvent.click(screen.getByText('ELA Standards'));
    await waitFor(() => expect(screen.getByText('Cite textual evidence')).toBeInTheDocument());
}

describe('StandardsPickerModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFavoriteStandards = [];
        mockIsFavorite.mockReturnValue(false);
        mockFetchJurisdictions.mockResolvedValue(jurisdictions);
        mockFetchStandardSets.mockResolvedValue(standardSets);
        mockFetchStandardSetDetail.mockResolvedValue({
            id: 's1',
            title: 'ELA Standards',
            subject: 'English',
            standards: standardsMap,
        });
    });

    it('loads and shows jurisdictions on mount', async () => {
        render(<StandardsPickerModal {...baseProps} />);
        await waitFor(() => {
            expect(screen.getByText('California')).toBeInTheDocument();
            expect(screen.getByText('Texas')).toBeInTheDocument();
        });
        expect(mockFetchJurisdictions).toHaveBeenCalledWith('test-key');
    });

    it('shows an error message when loading jurisdictions fails', async () => {
        mockFetchJurisdictions.mockRejectedValueOnce(new Error('CSP API error 401: Unauthorized'));
        render(<StandardsPickerModal {...baseProps} />);
        await waitFor(() => {
            expect(screen.getByText(/CSP API error 401/)).toBeInTheDocument();
        });
        expect(screen.getByText(/CSP CORS allowlist/)).toBeInTheDocument();
    });

    it('navigates from jurisdiction to standard set to standards', async () => {
        await goToStandardsStep();
        expect(mockFetchStandardSets).toHaveBeenCalledWith('test-key', 'j1');
        expect(mockFetchStandardSetDetail).toHaveBeenCalledWith('test-key', 's1');
        expect(screen.getByText('Determine central ideas')).toBeInTheDocument();
    });

    it('selects a CSP standard via the link button and closes the modal', async () => {
        const onSelect = vi.fn();
        const onClose = vi.fn();
        render(<StandardsPickerModal {...baseProps} onSelect={onSelect} onClose={onClose} />);
        await waitFor(() => expect(screen.getByText('California')).toBeInTheDocument());
        fireEvent.click(screen.getByText('California'));
        await waitFor(() => expect(screen.getByText('ELA Standards')).toBeInTheDocument());
        fireEvent.click(screen.getByText('ELA Standards'));
        await waitFor(() => expect(screen.getByText('Cite textual evidence')).toBeInTheDocument());

        const row = screen.getByText('Cite textual evidence').closest('div[style*="border-bottom"]') as HTMLElement;
        const linkBtn = within(row)
            .getAllByRole('button')
            .find((b) => b.querySelector('.lucide-link-2'));
        fireEvent.click(linkBtn!);

        expect(onSelect).toHaveBeenCalledWith(
            expect.objectContaining({
                guid: 'a1',
                statementNotation: 'RH.6-8.1',
                description: 'Cite textual evidence',
                standardSetTitle: 'ELA Standards',
                jurisdictionTitle: 'California',
            })
        );
        expect(onClose).toHaveBeenCalled();
    });

    it('toggles a standard as a favorite without navigating', async () => {
        await goToStandardsStep();
        const row = screen.getByText('Cite textual evidence').closest('div[style*="border-bottom"]') as HTMLElement;
        const starBtn = within(row)
            .getAllByRole('button')
            .find((b) => b.querySelector('.lucide-star'));
        fireEvent.click(starBtn!);
        expect(mockAddFavorite).toHaveBeenCalledWith(
            expect.objectContaining({ guid: 'a1', description: 'Cite textual evidence' })
        );
    });

    it('removes a favorited standard when toggled again', async () => {
        mockIsFavorite.mockReturnValue(true);
        await goToStandardsStep();
        const row = screen.getByText('Cite textual evidence').closest('div[style*="border-bottom"]') as HTMLElement;
        const starBtn = within(row)
            .getAllByRole('button')
            .find((b) => b.querySelector('.lucide-star'));
        fireEvent.click(starBtn!);
        expect(mockRemoveFavorite).toHaveBeenCalledWith('a1');
    });

    it('filters jurisdictions, sets, and standards via the search box', async () => {
        await goToStandardsStep();
        const search = screen.getByPlaceholderText('Search standards...');
        fireEvent.change(search, { target: { value: 'central' } });
        expect(screen.queryByText('Cite textual evidence')).toBeNull();
        expect(screen.getByText('Determine central ideas')).toBeInTheDocument();
    });

    it('sorts standards alphabetically', async () => {
        await goToStandardsStep();
        const sortSelect = screen.getByRole('combobox');
        fireEvent.change(sortSelect, { target: { value: 'alpha-desc' } });
        const descriptions = screen
            .getAllByText(/Cite textual evidence|Determine central ideas/)
            .map((el) => el.textContent);
        expect(descriptions[0]).toBe('Determine central ideas');
    });

    it('navigates back via breadcrumbs', async () => {
        await goToStandardsStep();
        fireEvent.click(screen.getByRole('button', { name: 'ELA Standards' }));
        await waitFor(() => expect(screen.getByText('Math Standards')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: 'California' }));
        await waitFor(() => expect(screen.getByText('Texas')).toBeInTheDocument());
    });

    it('switches to the favorites view and shows empty state', async () => {
        render(<StandardsPickerModal {...baseProps} />);
        await waitFor(() => expect(screen.getByText('California')).toBeInTheDocument());
        fireEvent.click(screen.getByText(/favorites/i));
        expect(screen.getByText('No favorites yet.')).toBeInTheDocument();
    });

    it('shows favorited standards and allows selecting and removing them', async () => {
        const fav: LinkedStandard = {
            guid: 'fav1',
            statementNotation: 'RH.6-8.1',
            description: 'Favorited standard text',
            standardSetTitle: 'ELA Standards',
            jurisdictionTitle: 'California',
        };
        mockFavoriteStandards = [fav];
        const onSelect = vi.fn();
        const onClose = vi.fn();
        render(<StandardsPickerModal {...baseProps} onSelect={onSelect} onClose={onClose} />);
        await waitFor(() => expect(screen.getByText('California')).toBeInTheDocument());
        fireEvent.click(screen.getByText(/favorites \(1\)/i));

        expect(screen.getByText('Favorited standard text')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Select' }));
        expect(onSelect).toHaveBeenCalledWith(fav);
        expect(onClose).toHaveBeenCalled();

        const favRow = screen.getByText('Favorited standard text').closest('.standard-row') as HTMLElement;
        const removeBtn = within(favRow)
            .getAllByRole('button')
            .find((b) => b.querySelector('.lucide-star'));
        fireEvent.click(removeBtn!);
        expect(mockRemoveFavorite).toHaveBeenCalledWith('fav1');
    });

    it('shows a "no matches" message when favorites search has no results', async () => {
        mockFavoriteStandards = [
            {
                guid: 'fav1',
                statementNotation: 'RH.6-8.1',
                description: 'Favorited standard text',
                standardSetTitle: 'ELA Standards',
                jurisdictionTitle: 'California',
            },
        ];
        render(<StandardsPickerModal {...baseProps} />);
        await waitFor(() => expect(screen.getByText('California')).toBeInTheDocument());
        fireEvent.click(screen.getByText(/favorites \(1\)/i));
        fireEvent.change(screen.getByPlaceholderText('Search favorites...'), { target: { value: 'nomatch' } });
        expect(screen.getByText('No favorites match your search.')).toBeInTheDocument();
    });

    it('calls onClose when the close button is clicked', async () => {
        const onClose = vi.fn();
        render(<StandardsPickerModal {...baseProps} onClose={onClose} />);
        await waitFor(() => expect(screen.getByText('California')).toBeInTheDocument());
        fireEvent.click(screen.getByLabelText('Close'));
        expect(onClose).toHaveBeenCalled();
    });

    it('shows an error message when fetching standard sets fails', async () => {
        mockFetchStandardSets.mockRejectedValueOnce(new Error('CSP API error 500: Server Error'));
        render(<StandardsPickerModal {...baseProps} />);
        await waitFor(() => expect(screen.getByText('California')).toBeInTheDocument());
        fireEvent.click(screen.getByText('California'));
        await waitFor(() => expect(screen.getByText(/CSP API error 500/)).toBeInTheDocument());
    });

    it('sorts jurisdictions and standard sets alphabetically in both directions', async () => {
        render(<StandardsPickerModal {...baseProps} />);
        await waitFor(() => expect(screen.getByText('California')).toBeInTheDocument());

        let sortSelect = screen.getByRole('combobox');
        fireEvent.change(sortSelect, { target: { value: 'alpha-desc' } });
        let titles = screen.getAllByText(/California|Texas/).map((el) => el.textContent);
        expect(titles[0]).toBe('Texas');

        fireEvent.change(sortSelect, { target: { value: 'alpha-asc' } });
        titles = screen.getAllByText(/California|Texas/).map((el) => el.textContent);
        expect(titles[0]).toBe('California');

        fireEvent.click(screen.getByText('California'));
        await waitFor(() => expect(screen.getByText('ELA Standards')).toBeInTheDocument());
        sortSelect = screen.getByRole('combobox');
        fireEvent.change(sortSelect, { target: { value: 'alpha-desc' } });
        titles = screen.getAllByText(/ELA Standards|Math Standards/).map((el) => el.textContent);
        expect(titles[0]).toBe('Math Standards');
    });

    it('sorts standards alphabetically ascending', async () => {
        await goToStandardsStep();
        const sortSelect = screen.getByRole('combobox');
        fireEvent.change(sortSelect, { target: { value: 'alpha-asc' } });
        const descriptions = screen
            .getAllByText(/Cite textual evidence|Determine central ideas/)
            .map((el) => el.textContent);
        expect(descriptions[0]).toBe('Cite textual evidence');
    });

    it('sorts favorites alphabetically when a sort order is selected', async () => {
        mockFavoriteStandards = [
            { guid: 'f1', description: 'Zebra standard', standardSetTitle: 'Set', jurisdictionTitle: 'CA' },
            { guid: 'f2', description: 'Apple standard', standardSetTitle: 'Set', jurisdictionTitle: 'CA' },
        ];
        render(<StandardsPickerModal {...baseProps} />);
        await waitFor(() => expect(screen.getByText('California')).toBeInTheDocument());
        fireEvent.click(screen.getByText(/favorites \(2\)/i));
        const sortSelect = screen.getByRole('combobox');
        fireEvent.change(sortSelect, { target: { value: 'alpha-asc' } });
        let texts = screen.getAllByText(/Zebra standard|Apple standard/).map((el) => el.textContent);
        expect(texts[0]).toBe('Apple standard');

        fireEvent.change(sortSelect, { target: { value: 'alpha-desc' } });
        texts = screen.getAllByText(/Zebra standard|Apple standard/).map((el) => el.textContent);
        expect(texts[0]).toBe('Zebra standard');
    });

    it('shows an error message when fetching the standard set detail fails', async () => {
        mockFetchStandardSetDetail.mockRejectedValueOnce(new Error('CSP API error 500: Server Error'));
        render(<StandardsPickerModal {...baseProps} />);
        await waitFor(() => expect(screen.getByText('California')).toBeInTheDocument());
        fireEvent.click(screen.getByText('California'));
        await waitFor(() => expect(screen.getByText('ELA Standards')).toBeInTheDocument());
        fireEvent.click(screen.getByText('ELA Standards'));
        await waitFor(() => expect(screen.getByText(/CSP API error 500/)).toBeInTheDocument());
    });

    it('switches back to the browse view from favorites', async () => {
        render(<StandardsPickerModal {...baseProps} />);
        await waitFor(() => expect(screen.getByText('California')).toBeInTheDocument());
        fireEvent.click(screen.getByText(/favorites/i));
        expect(screen.getByText('No favorites yet.')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Browse'));
        expect(screen.getByText('California')).toBeInTheDocument();
    });

    it('selects a standard by clicking its description area', async () => {
        const onSelect = vi.fn();
        render(<StandardsPickerModal {...baseProps} onSelect={onSelect} />);
        await waitFor(() => expect(screen.getByText('California')).toBeInTheDocument());
        fireEvent.click(screen.getByText('California'));
        await waitFor(() => expect(screen.getByText('ELA Standards')).toBeInTheDocument());
        fireEvent.click(screen.getByText('ELA Standards'));
        await waitFor(() => expect(screen.getByText('Cite textual evidence')).toBeInTheDocument());

        fireEvent.click(screen.getByText('Cite textual evidence'));
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ guid: 'a1' }));
    });

    it('selects a favorited standard by clicking its content area', async () => {
        const fav: LinkedStandard = {
            guid: 'fav1',
            description: 'Favorited standard text',
            standardSetTitle: 'ELA Standards',
            jurisdictionTitle: 'California',
        };
        mockFavoriteStandards = [fav];
        const onSelect = vi.fn();
        render(<StandardsPickerModal {...baseProps} onSelect={onSelect} />);
        await waitFor(() => expect(screen.getByText('California')).toBeInTheDocument());
        fireEvent.click(screen.getByText(/favorites \(1\)/i));
        fireEvent.click(screen.getByText('Favorited standard text'));
        expect(onSelect).toHaveBeenCalledWith(fav);
    });

    it('shows a "no standards match" message when search yields nothing', async () => {
        await goToStandardsStep();
        const search = screen.getByPlaceholderText('Search standards...');
        fireEvent.change(search, { target: { value: 'zzz no match zzz' } });
        expect(screen.getByText('No standards match your search.')).toBeInTheDocument();
    });
});
