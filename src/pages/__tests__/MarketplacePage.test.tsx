import React from 'react';
import { screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, MarketplaceListing, Rubric } from '../../types';

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
};

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockAddRubric = vi.fn(() => ({ ...mockRubric, id: 'new-r' }));
const mockListListings = vi.fn().mockResolvedValue([]);

const mockRubricsArr = [mockRubric];
const emptyArr: never[] = [];

// Base app value — settings without schoolId → disabled state.
const mockAppValue: Record<string, unknown> = {
    rubrics: mockRubricsArr,
    students: emptyArr,
    classes: emptyArr,
    studentRubrics: emptyArr,
    settings: mockSettings,
    addRubric: mockAddRubric,
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
}));

const mockDbState = vi.hoisted(() => ({
    isConnected: false,
    currentUser: null as { id: string; schoolId: string } | null,
}));

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: mockDbState.isConnected, currentUser: mockDbState.currentUser }),
}));

vi.mock('../../services/database', () => ({
    storageSync: {
        adapter: {
            listMarketplaceListings: (...args: unknown[]) => mockListListings(...args),
            upvoteListing: vi.fn().mockResolvedValue({ success: true }),
            cloneListing: vi.fn().mockResolvedValue({ success: true }),
            publishRubricToMarketplace: vi.fn().mockResolvedValue({ success: true }),
        },
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

let MarketplacePageComp: React.ComponentType;

function renderPage() {
    return renderWithRouter(<MarketplacePageComp />);
}

describe('MarketplacePage', () => {
    beforeEach(async () => {
        mockListListings.mockClear();
        mockAddRubric.mockClear();
        mockDbState.isConnected = false;
        mockDbState.currentUser = null;
        const mod = await import('../MarketplacePage');
        MarketplacePageComp = mod.default;
    });

    it('shows the disabled state when not connected or no school ID', () => {
        renderPage();
        expect(screen.getByText('marketplace.disabled_title')).toBeInTheDocument();
        expect(screen.getByText('marketplace.disabled_body')).toBeInTheDocument();
    });

    it('shows the marketplace title in all states', () => {
        renderPage();
        expect(screen.getByText('marketplace.title')).toBeInTheDocument();
    });

    it('shows the connected marketplace view when connected with schoolId in settings', async () => {
        mockDbState.isConnected = true;
        (mockAppValue as Record<string, unknown>).settings = { ...mockSettings, schoolId: 'school-1' };
        await act(async () => {
            renderPage();
        });
        expect(screen.getByText('marketplace.title')).toBeInTheDocument();
        expect(screen.getByText('marketplace.publish_button')).toBeInTheDocument();
        (mockAppValue as Record<string, unknown>).settings = mockSettings;
    });

    it('shows the publish form when publish button is clicked', async () => {
        mockDbState.isConnected = true;
        (mockAppValue as Record<string, unknown>).settings = { ...mockSettings, schoolId: 'school-1' };
        await act(async () => {
            renderPage();
        });
        fireEvent.click(screen.getByText('marketplace.publish_button'));
        expect(screen.getByText('marketplace.publish_title')).toBeInTheDocument();
        expect(screen.getByText('marketplace.publish_select_rubric')).toBeInTheDocument();
        (mockAppValue as Record<string, unknown>).settings = mockSettings;
    });

    it('renders marketplace listings when available', async () => {
        mockDbState.isConnected = true;
        (mockAppValue as Record<string, unknown>).settings = { ...mockSettings, schoolId: 'school-1' };
        const listing: MarketplaceListing = {
            id: 'l1',
            schoolId: 'school-1',
            publishedBy: 'u1',
            rubricSnapshot: mockRubric,
            name: 'Grammar Rubric',
            subject: 'English',
            description: 'A grammar rubric for B2 students',
            cefrLevels: ['B2'],
            upvoteCount: 5,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
        };
        mockListListings.mockResolvedValueOnce([listing]);
        await act(async () => {
            renderPage();
        });
        expect(await screen.findByText('Grammar Rubric')).toBeInTheDocument();
        expect(screen.getByText('A grammar rubric for B2 students')).toBeInTheDocument();
        (mockAppValue as Record<string, unknown>).settings = mockSettings;
    });
});

// Test the exported pure function directly.
describe('filterAndSortListings', () => {
    it('filters by subject', async () => {
        const { filterAndSortListings } = await import('../MarketplacePage');
        const listings = [
            { id: '1', subject: 'English', upvoteCount: 0, createdAt: '2024-01-01' },
            { id: '2', subject: 'Math', upvoteCount: 0, createdAt: '2024-01-02' },
        ] as Parameters<typeof filterAndSortListings>[0];
        const result = filterAndSortListings(listings, 'English', 'newest');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
    });

    it('sorts by upvotes', async () => {
        const { filterAndSortListings } = await import('../MarketplacePage');
        const listings = [
            { id: '1', subject: 'English', upvoteCount: 2, createdAt: '2024-01-01' },
            { id: '2', subject: 'English', upvoteCount: 10, createdAt: '2024-01-02' },
        ] as Parameters<typeof filterAndSortListings>[0];
        const result = filterAndSortListings(listings, 'all', 'upvotes');
        expect(result[0].id).toBe('2');
    });

    it('sorts by newest when sortBy is newest', async () => {
        const { filterAndSortListings } = await import('../MarketplacePage');
        const listings = [
            { id: '1', subject: 'English', upvoteCount: 0, createdAt: '2024-01-01' },
            { id: '2', subject: 'English', upvoteCount: 0, createdAt: '2024-01-05' },
        ] as Parameters<typeof filterAndSortListings>[0];
        const result = filterAndSortListings(listings, 'all', 'newest');
        expect(result[0].id).toBe('2');
    });
});
