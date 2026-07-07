import { describe, expect, it } from 'vitest';
import { searchPortal, type PortalSearchableData } from './portalSearch';

function makeData(overrides: Partial<PortalSearchableData> = {}): PortalSearchableData {
    return {
        history: [],
        work: [],
        flashcards: [],
        ...overrides,
    };
}

describe('searchPortal', () => {
    it('returns no results for an empty query', () => {
        expect(searchPortal('', makeData({ history: [{ rubricId: 'r1', rubricName: 'Persuasive Essay' }] }))).toEqual(
            []
        );
    });

    it('matches a graded rubric and points to the feedback section', () => {
        const results = searchPortal(
            'persuas',
            makeData({ history: [{ rubricId: 'r1', rubricName: 'Persuasive Essay' }] })
        );
        expect(results).toEqual([
            { type: 'grade', id: 'r1', label: 'Persuasive Essay', sectionId: 'portal-section-feedback' },
        ]);
    });

    it('matches a work entry (essay or test) and points to the work section', () => {
        const results = searchPortal('grammar', makeData({ work: [{ key: 'test-tk1', label: 'Grammar Quiz' }] }));
        expect(results).toEqual([
            { type: 'work', id: 'test-tk1', label: 'Grammar Quiz', sectionId: 'portal-section-work' },
        ]);
    });

    it('matches a flashcard deck and points to the flashcards section', () => {
        const results = searchPortal(
            'vocab',
            makeData({ flashcards: [{ deckId: 'd1', deckName: 'Unit 4 Vocabulary' }] })
        );
        expect(results).toEqual([
            { type: 'flashcard', id: 'd1', label: 'Unit 4 Vocabulary', sectionId: 'portal-section-flashcards' },
        ]);
    });

    it('is diacritic-insensitive', () => {
        const results = searchPortal('cafe', makeData({ work: [{ key: 'essay-tk1', label: 'Café Culture' }] }));
        expect(results).toHaveLength(1);
    });

    it('matches across all three data types in one query', () => {
        const results = searchPortal(
            'unit',
            makeData({
                history: [{ rubricId: 'r1', rubricName: 'Unit 3 Essay' }],
                work: [{ key: 'test-tk1', label: 'Unit 3 Quiz' }],
                flashcards: [{ deckId: 'd1', deckName: 'Unit 3 Vocabulary' }],
            })
        );
        expect(results.map((r) => r.type).sort()).toEqual(['flashcard', 'grade', 'work']);
    });
});
