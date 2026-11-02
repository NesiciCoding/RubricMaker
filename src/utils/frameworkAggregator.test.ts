import { describe, it, expect } from 'vitest';
import { aggregateFrameworkScores } from './frameworkAggregator';
import { BLOOM_LEVELS } from '../data/bloomsTaxonomy';
import { IB_ATTRIBUTES } from '../data/ibLearnerProfile';
import { GRAMMAR_CATEGORIES } from '../data/grammarStandards';
import { SLO_KERNDOELEN } from '../data/sloKerndoelen';
import type { AssessmentFramework, RubricCriterion, StudentRubric } from '../types';

const level = (id: string, max: number) => ({
    id,
    label: id,
    minPoints: 0,
    maxPoints: max,
    description: '',
    subItems: [],
});

const criterion = (id: string, categoryId: string, framework: AssessmentFramework, max = 10): RubricCriterion => ({
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

    it('returns a bucket for every SLO kerndoel, keeping primary and secondary 34 apart', () => {
        const criteria = [criterion('c1', 'slo-vo-34', 'slo', 10)];
        const result = aggregateFrameworkScores('slo', [sr('sr1', 'c1', 'l-best', 6)], criteria);
        expect(result.map((b) => b.categoryId)).toEqual(SLO_KERNDOELEN.map((kd) => kd.id));
        expect(result.find((b) => b.categoryId === 'slo-vo-34')).toMatchObject({ count: 1, avgPercentage: 60 });
        expect(result.find((b) => b.categoryId === 'slo-po-34')?.count).toBe(0);
    });

    it('counts a criterion once per category even when it links several of its descriptors', () => {
        const twoGoals = criterion('c1', 'slo-vo-35', 'slo', 10);
        twoGoals.frameworkDescriptors = [
            ...twoGoals.frameworkDescriptors!,
            { ...twoGoals.frameworkDescriptors![0], descriptorId: 'c1-d2' },
        ];
        const oneGoal = criterion('c2', 'slo-vo-35', 'slo', 10);
        const rubric: StudentRubric = {
            ...sr('sr1', 'c1', 'l-best', 10),
            entries: [
                { criterionId: 'c1', levelId: 'l-best', selectedPoints: 10, checkedSubItems: [], comment: '' },
                { criterionId: 'c2', levelId: 'l-best', selectedPoints: 0, checkedSubItems: [], comment: '' },
            ],
        };
        const bucket = aggregateFrameworkScores('slo', [rubric], [twoGoals, oneGoal]).find(
            (b) => b.categoryId === 'slo-vo-35'
        )!;
        expect(bucket.count).toBe(2);
        expect(bucket.avgPercentage).toBeCloseTo(50);
    });

    it('buckets grammar by grammar category rather than by IB attribute', () => {
        const result = aggregateFrameworkScores('grammar', [], []);
        expect(result.map((b) => b.categoryId)).toEqual(GRAMMAR_CATEGORIES.map((c) => c.id));
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

    it('skips criteria that have no entry in the student rubric', () => {
        const bloomId = BLOOM_LEVELS[0].id;
        const criteria = [criterion('c1', bloomId, 'blooms', 10), criterion('c2', bloomId, 'blooms', 10)];
        // Only c1 has an entry — c2's missing entry must be skipped, not crash
        const rubrics = [sr('sr1', 'c1', 'l-best', 8)];
        const result = aggregateFrameworkScores('blooms', rubrics, criteria);
        const bucket = result.find((b) => b.categoryId === bloomId)!;
        expect(bucket.count).toBe(1);
        expect(bucket.avgPercentage).toBeCloseTo(80);
    });

    it('treats a criterion with undefined frameworkDescriptors as having none', () => {
        const bloomId = BLOOM_LEVELS[0].id;
        const noDescriptors: RubricCriterion = {
            id: 'c1',
            title: 'c1',
            description: '',
            weight: 100,
            levels: [level('l1', 10)],
            // frameworkDescriptors omitted entirely → undefined → defaulted to []
        };
        const rubrics = [sr('sr1', 'c1', 'l1', 10)];
        const result = aggregateFrameworkScores('blooms', rubrics, [noDescriptors]);
        result.forEach((b) => expect(b.count).toBe(0));
    });
});
