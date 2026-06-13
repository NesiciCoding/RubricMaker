import { describe, it, expect } from 'vitest';
import { aggregatePeerReviews } from './peerReviewAggregator';
import type { Rubric, StudentRubric } from '../types';

const rubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    gradeScaleId: '1',
    format: {} as any,
    attachmentIds: [],
    createdAt: '',
    updatedAt: '',
    totalMaxPoints: 20,
    scoringMode: 'total-points',
    criteria: [
        {
            id: 'c1',
            title: 'Structure',
            description: '',
            weight: 50,
            levels: [
                { id: 'l1', label: 'Good', minPoints: 8, maxPoints: 10, description: '', subItems: [] },
                { id: 'l2', label: 'Weak', minPoints: 0, maxPoints: 5, description: '', subItems: [] },
            ],
        },
        {
            id: 'c2',
            title: 'Grammar',
            description: '',
            weight: 50,
            levels: [
                { id: 'l1', label: 'Good', minPoints: 8, maxPoints: 10, description: '', subItems: [] },
                { id: 'l2', label: 'Weak', minPoints: 0, maxPoints: 5, description: '', subItems: [] },
            ],
        },
    ],
};

function baseline(studentId: string, c1Points: number, c2Points: number): StudentRubric {
    return {
        id: `baseline-${studentId}`,
        rubricId: 'r1',
        studentId,
        overallComment: '',
        isPeerReview: false,
        entries: [
            { criterionId: 'c1', levelId: 'l1', overridePoints: c1Points, checkedSubItems: [], comment: '' },
            { criterionId: 'c2', levelId: 'l1', overridePoints: c2Points, checkedSubItems: [], comment: '' },
        ],
    };
}

function peerReview(
    id: string,
    studentId: string,
    gradedBy: string | undefined,
    round: number | undefined,
    c1: { points: number; comment?: string },
    c2: { points: number; comment?: string }
): StudentRubric {
    return {
        id,
        rubricId: 'r1',
        studentId,
        overallComment: '',
        isPeerReview: true,
        gradedBy,
        round,
        entries: [
            {
                criterionId: 'c1',
                levelId: 'l1',
                overridePoints: c1.points,
                checkedSubItems: [],
                comment: c1.comment ?? '',
            },
            {
                criterionId: 'c2',
                levelId: 'l1',
                overridePoints: c2.points,
                checkedSubItems: [],
                comment: c2.comment ?? '',
            },
        ],
    };
}

describe('peerReviewAggregator', () => {
    it('returns empty stats when there are no peer reviews', () => {
        const result = aggregatePeerReviews(rubric, [], [baseline('s1', 9, 9)]);
        expect(result.totalReviews).toBe(0);
        expect(result.totalComparisons).toBe(0);
        expect(result.reviewers).toHaveLength(0);
        expect(result.criteria.every((c) => c.commentCount === 0 && c.comparisonCount === 0)).toBe(true);
    });

    it('computes consistency and leniency bias against the teacher baseline', () => {
        const baselines = [baseline('s1', 8, 8)];
        const reviews = [
            // reviewer "r2" scores s1 slightly higher than teacher on both criteria (lenient)
            peerReview('pr1', 's1', 'r2', 1, { points: 10, comment: 'Great structure' }, { points: 9 }),
        ];

        const result = aggregatePeerReviews(rubric, reviews, baselines);

        expect(result.totalReviews).toBe(1);
        expect(result.totalComparisons).toBe(2);
        expect(result.totalMissingBaseline).toBe(0);

        const reviewer = result.reviewers.find((r) => r.reviewerId === 'r2');
        expect(reviewer).toBeDefined();
        // deltas: c1 = 10-8=2, c2 = 9-8=1 → mean abs = 1.5, mean signed = 1.5
        expect(reviewer!.consistency).toBeCloseTo(1.5);
        expect(reviewer!.leniencyBias).toBeCloseTo(1.5);
        expect(reviewer!.comparisonCount).toBe(2);
        expect(reviewer!.reviewCount).toBe(1);

        // comment frequency per criterion
        const c1Stat = result.criteria.find((c) => c.criterionId === 'c1')!;
        const c2Stat = result.criteria.find((c) => c.criterionId === 'c2')!;
        expect(c1Stat.commentCount).toBe(1);
        expect(c2Stat.commentCount).toBe(0);

        // inter-rater spread per criterion
        expect(c1Stat.interRaterSpread).toBeCloseTo(2);
        expect(c2Stat.interRaterSpread).toBeCloseTo(1);
    });

    it('excludes students with no teacher baseline from deviation but counts them separately', () => {
        const baselines: StudentRubric[] = []; // no baseline for s1 at all
        const reviews = [peerReview('pr1', 's1', 'r2', 1, { points: 10 }, { points: 9 })];

        const result = aggregatePeerReviews(rubric, reviews, baselines);

        expect(result.totalComparisons).toBe(0);
        expect(result.totalMissingBaseline).toBe(2); // both criteria missing baseline

        const reviewer = result.reviewers.find((r) => r.reviewerId === 'r2')!;
        expect(reviewer.consistency).toBeNull();
        expect(reviewer.leniencyBias).toBeNull();
        expect(reviewer.missingBaselineCount).toBe(2);
        expect(reviewer.reviewCount).toBe(1);
    });

    it('groups reviews with missing gradedBy under a null/anonymous reviewer key', () => {
        const baselines = [baseline('s1', 8, 8)];
        const reviews = [peerReview('pr1', 's1', undefined, 1, { points: 8 }, { points: 8 })];

        const result = aggregatePeerReviews(rubric, reviews, baselines);

        expect(result.reviewers).toHaveLength(1);
        expect(result.reviewers[0].reviewerId).toBeNull();
        expect(result.reviewers[0].consistency).toBeCloseTo(0);
    });

    it('aggregates round-over-round trends across multiple rounds', () => {
        const baselines = [baseline('s1', 8, 8), baseline('s2', 6, 6)];
        const reviews = [
            // Round 1: reviewer overshoots by 2 on average
            peerReview('pr1', 's1', 'rA', 1, { points: 10 }, { points: 10 }),
            // Round 2: same reviewer is more accurate (overshoots by 0.5 on average)
            peerReview('pr2', 's2', 'rA', 2, { points: 6 }, { points: 7 }),
        ];

        const result = aggregatePeerReviews(rubric, reviews, baselines);

        expect(result.rounds).toHaveLength(2);
        const round1 = result.rounds.find((r) => r.round === 1)!;
        const round2 = result.rounds.find((r) => r.round === 2)!;

        expect(round1.consistency).toBeCloseTo(2); // |10-8|, |10-8| → mean 2
        expect(round1.leniencyBias).toBeCloseTo(2);
        expect(round1.reviewCount).toBe(1);
        expect(round1.comparisonCount).toBe(2);

        expect(round2.consistency).toBeCloseTo(0.5); // |6-6|=0, |7-6|=1 → mean 0.5
        expect(round2.leniencyBias).toBeCloseTo(0.5);
        expect(round2.reviewCount).toBe(1);
        expect(round2.comparisonCount).toBe(2);

        // reviewer aggregate spans both rounds
        const reviewer = result.reviewers.find((r) => r.reviewerId === 'rA')!;
        expect(reviewer.comparisonCount).toBe(4);
        expect(reviewer.consistency).toBeCloseTo((2 + 2 + 0 + 1) / 4);
    });
});
