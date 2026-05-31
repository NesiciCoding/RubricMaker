import { describe, it, expect } from 'vitest';
import { aggregateFrameworkScores } from './frameworkAggregator';
import { BLOOM_LEVELS } from '../data/bloomsTaxonomy';
import { IB_ATTRIBUTES } from '../data/ibLearnerProfile';
import type { RubricCriterion, StudentRubric } from '../types';

const level = (id: string, max: number) => ({
    id,
    label: id,
    minPoints: 0,
    maxPoints: max,
    description: '',
    subItems: [],
});

const criterion = (id: string, categoryId: string, framework: 'blooms' | 'ib', max = 10): RubricCriterion => ({
    id,
    title: id,
    description: '',
    weight: 100,
    levels: [level('l-best', max), level('l-worst', 0)],
    frameworkDescriptors: [
        {
            descriptorId: `${id}-d`,
            framework,
            categoryId,
            categoryLabelEn: categoryId,
            categoryLabelNl: categoryId,
            categoryColor: '#000',
            descriptionEn: '',
            descriptionNl: '',
        },
    ],
});

const sr = (id: string, criterionId: string, levelId: string, points: number): StudentRubric => ({
    id,
    rubricId: 'r1',
    studentId: 's1',
    overallComment: '',
    isPeerReview: false,
    gradedAt: '2024-01-01',
    entries: [{ criterionId, levelId, selectedPoints: points, checkedSubItems: [], comment: '' }],
});

describe('aggregateFrameworkScores', () => {
    it('returns a bucket for every canonical Bloom level', () => {
        const result = aggregateFrameworkScores('blooms', [], []);
        expect(result).toHaveLength(BLOOM_LEVELS.length);
        result.forEach((b) => expect(b.count).toBe(0));
    });

    it('returns a bucket for every canonical IB attribute', () => {
        const result = aggregateFrameworkScores('ib', [], []);
        expect(result).toHaveLength(IB_ATTRIBUTES.length);
    });

    it('computes avgPercentage correctly for a single grade', () => {
        const bloomId = BLOOM_LEVELS[0].id; // 'remember'
        const criteria = [criterion('c1', bloomId, 'blooms', 10)];
        const rubrics = [sr('sr1', 'c1', 'l-best', 8)]; // 8/10 = 80%

        const result = aggregateFrameworkScores('blooms', rubrics, criteria);
        const bucket = result.find((b) => b.categoryId === bloomId)!;
        expect(bucket.avgPercentage).toBeCloseTo(80);
        expect(bucket.count).toBe(1);
    });

    it('averages multiple grades for the same category', () => {
        const bloomId = BLOOM_LEVELS[0].id;
        const criteria = [criterion('c1', bloomId, 'blooms', 10)];
        const rubrics = [
            sr('sr1', 'c1', 'l-best', 10), // 100%
            sr('sr2', 'c1', 'l-best', 0), // 0%
        ];

        const result = aggregateFrameworkScores('blooms', rubrics, criteria);
        const bucket = result.find((b) => b.categoryId === bloomId)!;
        expect(bucket.avgPercentage).toBeCloseTo(50);
        expect(bucket.count).toBe(2);
    });

    it('ignores criteria with no frameworkDescriptors', () => {
        const criteria: RubricCriterion[] = [
            {
                id: 'c1',
                title: 'c1',
                description: '',
                weight: 100,
                levels: [level('l1', 10)],
                frameworkDescriptors: [],
            },
        ];
        const rubrics = [sr('sr1', 'c1', 'l1', 10)];
        const result = aggregateFrameworkScores('blooms', rubrics, criteria);
        result.forEach((b) => expect(b.count).toBe(0));
    });

    it('ignores criteria whose framework does not match', () => {
        const bloomId = BLOOM_LEVELS[0].id;
        const criteria = [criterion('c1', bloomId, 'blooms', 10)];
        const rubrics = [sr('sr1', 'c1', 'l-best', 10)];

        // Ask for 'ib' — the criterion is tagged 'blooms', should not count
        const result = aggregateFrameworkScores('ib', rubrics, criteria);
        result.forEach((b) => expect(b.count).toBe(0));
    });

    it('uses rubricSnapshot criteria when present', () => {
        const bloomId = BLOOM_LEVELS[0].id;
        const snapshotCriterion = criterion('c1', bloomId, 'blooms', 10);
        const rubricWithSnapshot: StudentRubric = {
            ...sr('sr1', 'c1', 'l-best', 8),
            rubricSnapshot: {
                id: 'r1',
                name: '',
                subject: '',
                description: '',
                gradeScaleId: '',
                format: {} as any,
                attachmentIds: [],
                createdAt: '',
                updatedAt: '',
                totalMaxPoints: 10,
                scoringMode: 'total-points',
                criteria: [snapshotCriterion],
            },
        };

        // Pass empty criteria — snapshot should be used instead
        const result = aggregateFrameworkScores('blooms', [rubricWithSnapshot], []);
        const bucket = result.find((b) => b.categoryId === bloomId)!;
        expect(bucket.count).toBe(1);
        expect(bucket.avgPercentage).toBeCloseTo(80);
    });

    it('returns NaN avgPercentage and count 0 for untouched categories', () => {
        const bloomId = BLOOM_LEVELS[0].id;
        const result = aggregateFrameworkScores('blooms', [], []);
        const bucket = result.find((b) => b.categoryId === bloomId)!;
        expect(bucket.avgPercentage).toBeNaN();
        expect(bucket.count).toBe(0);
    });

    it('skips criteria where maxPoints is 0', () => {
        const bloomId = BLOOM_LEVELS[0].id;
        const zeroCrit: RubricCriterion = {
            ...criterion('c1', bloomId, 'blooms', 0),
            levels: [level('l1', 0)],
        };
        const rubrics = [sr('sr1', 'c1', 'l1', 0)];
        const result = aggregateFrameworkScores('blooms', rubrics, [zeroCrit]);
        const bucket = result.find((b) => b.categoryId === bloomId)!;
        expect(bucket.count).toBe(0);
    });
});
