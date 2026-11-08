import { describe, it, expect } from 'vitest';
import { buildSearchIndex, searchAll, type SearchableData } from '../globalSearch';
import { DEFAULT_FORMAT } from '../../types';

function makeData(): SearchableData {
    return {
        rubrics: [
            {
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
            },
        ],
        tests: [],
        students: [{ id: 's1', name: 'Alice', classId: 'c1' }],
        classes: [{ id: 'c1', name: 'Class A' }],
        essayAssignments: [],
        flashcardDecks: [],
        newsFlashes: [],
    };
}

describe('globalSearch index (#1113)', () => {
    it('returns identical results with and without a cached index', () => {
        const data = makeData();
        const idx = buildSearchIndex(data);
        for (const q of ['Essay', 'Alice', 'Class', 'type:rubric Essay', 'nomatchxyz']) {
            expect(searchAll(q, data, idx)).toEqual(searchAll(q, data));
        }
    });

    it('reuses the cached index instead of re-reading mutated collections', () => {
        const data = makeData();
        const idx = buildSearchIndex(data);
        // Mutate the live collection after indexing: a cached search must NOT see it.
        data.rubrics.push({
            ...data.rubrics[0],
            id: 'r2',
            name: 'Brand New Rubric XYZ',
        });
        expect(searchAll('Brand New Rubric XYZ', data, idx)).toEqual([]);
        // A fresh index picks the new row up.
        expect(searchAll('Brand New Rubric XYZ', data)).toHaveLength(1);
    });

    it('compound student+rubric shortcut works from the index', () => {
        const data = makeData();
        const idx = buildSearchIndex(data);
        const results = searchAll('Alice Essay Rubric', data, idx);
        expect(results.some((r) => r.type === 'grade')).toBe(true);
    });
});
