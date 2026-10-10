import { describe, it, expect } from 'vitest';
import { cloneRubricForCopy } from './rubricClone';
import { DEFAULT_FORMAT, type Rubric } from '../types';

const source: Rubric = {
    id: 'r1',
    name: 'Essay',
    subject: 'English',
    description: '',
    criteria: [
        {
            id: 'c1',
            title: 'Ideas',
            description: '',
            weight: 100,
            levels: [
                {
                    id: 'l1',
                    label: 'Top',
                    minPoints: 4,
                    maxPoints: 4,
                    description: '',
                    subItems: [{ id: 's1', label: 'Thesis', points: 1 }],
                },
            ],
        },
    ],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: ['a1'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'total-points',
    displayOrder: 3,
    sharedWithSchool: true,
    comparativeMatchupLimit: 4,
    vocabularyItems: [
        { id: 'v1', phrase: 'however', category: 'vocabulary', linkedCriterionId: 'c1', linkedSubItemId: 's1' },
        { id: 'v2', phrase: 'moreover', category: 'vocabulary', linkedCriterionId: 'gone' },
    ],
};

describe('cloneRubricForCopy', () => {
    const copy = cloneRubricForCopy(source, { name: 'Essay (Copy)' });

    it('drops the identity, list position, sharing and attachments of the source', () => {
        expect(copy).not.toHaveProperty('id');
        expect(copy).not.toHaveProperty('createdAt');
        expect(copy).not.toHaveProperty('displayOrder');
        expect(copy).not.toHaveProperty('sharedWithSchool');
        expect(copy.attachmentIds).toEqual([]);
        expect(copy.name).toBe('Essay (Copy)');
    });

    it('keeps the scoring settings', () => {
        expect(copy).toMatchObject({ scoringMode: 'total-points', totalMaxPoints: 100, comparativeMatchupLimit: 4 });
    });

    it('gives every nested record a fresh id', () => {
        const [c] = copy.criteria;
        expect(c.id).not.toBe('c1');
        expect(c.levels[0].id).not.toBe('l1');
        expect(c.levels[0].subItems[0].id).not.toBe('s1');
        expect(copy.vocabularyItems!.map((v) => v.id)).not.toContain('v1');
    });

    it('points vocabulary links at the copied criterion and sub-item', () => {
        const [c] = copy.criteria;
        expect(copy.vocabularyItems![0]).toMatchObject({
            linkedCriterionId: c.id,
            linkedSubItemId: c.levels[0].subItems[0].id,
        });
        expect(copy.vocabularyItems![1].linkedCriterionId).toBe('gone');
    });

    it('leaves vocabulary out when the source has none', () => {
        expect(cloneRubricForCopy({ ...source, vocabularyItems: undefined })).not.toHaveProperty('vocabularyItems');
    });
});
