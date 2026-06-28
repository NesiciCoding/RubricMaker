import { describe, it, expect } from 'vitest';
import { filterAndSortListings } from './MarketplacePage';
import type { MarketplaceListing } from '../types';

function listing(overrides: Partial<MarketplaceListing>): MarketplaceListing {
    return {
        id: 'x',
        schoolId: 's',
        publishedBy: 'u',
        rubricSnapshot: {} as MarketplaceListing['rubricSnapshot'],
        name: 'n',
        upvoteCount: 0,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('filterAndSortListings', () => {
    const listings = [
        listing({ id: 'a', subject: 'Math', upvoteCount: 1, createdAt: '2024-01-01T00:00:00.000Z' }),
        listing({ id: 'b', subject: 'Science', upvoteCount: 5, createdAt: '2024-03-01T00:00:00.000Z' }),
        listing({ id: 'c', subject: 'Math', upvoteCount: 2, createdAt: '2024-02-01T00:00:00.000Z' }),
    ];

    it('filters by subject', () => {
        const result = filterAndSortListings(listings, 'Math', 'newest');
        expect(result.map((l) => l.id)).toEqual(['c', 'a']);
    });

    it('sorts by newest when no filter applied', () => {
        const result = filterAndSortListings(listings, 'all', 'newest');
        expect(result.map((l) => l.id)).toEqual(['b', 'c', 'a']);
    });

    it('sorts by upvote count', () => {
        const result = filterAndSortListings(listings, 'all', 'upvotes');
        expect(result.map((l) => l.id)).toEqual(['b', 'c', 'a']);
    });
});
