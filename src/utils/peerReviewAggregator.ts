import { Rubric, StudentRubric } from '../types';
import { calcEntryPoints } from './gradeCalc';

export interface CriterionFeedbackStat {
    criterionId: string;
    title: string;
    commentCount: number;
    /** Mean absolute deviation between peer and teacher points for this criterion, across all reviews with a baseline */
    interRaterSpread: number;
    /** Number of (student, reviewer, round) comparisons that had a teacher baseline */
    comparisonCount: number;
}

export interface ReviewerStat {
    reviewerId: string | null;
    /** Mean absolute deviation between this reviewer's points and the teacher baseline, across all graded criteria */
    consistency: number | null;
    /** Signed mean delta (peer - teacher); positive = lenient, negative = harsh */
    leniencyBias: number | null;
    /** Number of (student, criterion, round) entries with a teacher baseline */
    comparisonCount: number;
    /** Total peer review entries submitted by this reviewer (regardless of baseline availability) */
    reviewCount: number;
    /** Entries for which no teacher baseline existed for that student */
    missingBaselineCount: number;
}

export interface RoundAggregate {
    round: number;
    /** Mean absolute deviation between peer and teacher points across all reviewers/criteria for this round */
    consistency: number | null;
    /** Signed mean delta (peer - teacher) across all reviewers/criteria for this round */
    leniencyBias: number | null;
    comparisonCount: number;
    reviewCount: number;
}

export interface PeerReviewAnalytics {
    rubricId: string;
    criteria: CriterionFeedbackStat[];
    reviewers: ReviewerStat[];
    rounds: RoundAggregate[];
    /** Total number of peer review submissions for this rubric */
    totalReviews: number;
    /** Total number of (student, criterion, round) comparisons with a teacher baseline */
    totalComparisons: number;
    /** Total number of entries that could not be compared because no teacher baseline exists for the student */
    totalMissingBaseline: number;
}

export function aggregatePeerReviews(
    rubric: Rubric,
    peerReviews: StudentRubric[],
    studentRubrics: StudentRubric[]
): PeerReviewAnalytics {
    const relevantPeerReviews = peerReviews.filter((pr) => pr.rubricId === rubric.id);
    const relevantBaselines = studentRubrics.filter((sr) => !sr.isPeerReview && sr.rubricId === rubric.id);

    const baselineByStudent = new Map<string, StudentRubric>();
    relevantBaselines.forEach((sr) => baselineByStudent.set(sr.studentId, sr));

    const criterionStats = new Map<string, CriterionFeedbackStat>();
    rubric.criteria.forEach((c) => {
        criterionStats.set(c.id, {
            criterionId: c.id,
            title: c.title,
            commentCount: 0,
            interRaterSpread: 0,
            comparisonCount: 0,
        });
    });
    const criterionDeviationSums = new Map<string, number>();

    const reviewerStats = new Map<string | null, ReviewerStat>();
    const roundStats = new Map<
        number,
        { deltaSum: number; absSum: number; comparisonCount: number; reviewCount: number }
    >();

    for (const pr of relevantPeerReviews) {
        const reviewerKey = pr.gradedBy ?? null;
        const round = pr.round ?? 1;

        if (!reviewerStats.has(reviewerKey)) {
            reviewerStats.set(reviewerKey, {
                reviewerId: reviewerKey,
                consistency: null,
                leniencyBias: null,
                comparisonCount: 0,
                reviewCount: 0,
                missingBaselineCount: 0,
            });
        }
        const reviewerStat = reviewerStats.get(reviewerKey)!;
        reviewerStat.reviewCount += 1;

        if (!roundStats.has(round)) {
            roundStats.set(round, { deltaSum: 0, absSum: 0, comparisonCount: 0, reviewCount: 0 });
        }
        const roundStat = roundStats.get(round)!;
        roundStat.reviewCount += 1;

        const baseline = baselineByStudent.get(pr.studentId);

        let reviewerDeltaSum = 0;
        let reviewerAbsSum = 0;
        let reviewerComparisons = 0;
        let reviewerMissingBaseline = 0;

        for (const entry of pr.entries) {
            const criterion = rubric.criteria.find((c) => c.id === entry.criterionId);
            if (!criterion) continue;

            if (entry.comment && entry.comment.trim().length > 0) {
                const cStat = criterionStats.get(criterion.id);
                if (cStat) cStat.commentCount += 1;
            }

            if (!baseline) {
                reviewerMissingBaseline += 1;
                continue;
            }

            const baselineEntry = baseline.entries.find((e) => e.criterionId === criterion.id);
            if (!baselineEntry) {
                reviewerMissingBaseline += 1;
                continue;
            }

            const peerPoints = calcEntryPoints(entry, criterion);
            const teacherPoints = calcEntryPoints(baselineEntry, criterion);
            const delta = peerPoints - teacherPoints;
            const absDelta = Math.abs(delta);

            reviewerDeltaSum += delta;
            reviewerAbsSum += absDelta;
            reviewerComparisons += 1;

            const cDevSum = criterionDeviationSums.get(criterion.id) ?? 0;
            criterionDeviationSums.set(criterion.id, cDevSum + absDelta);
            const cStat = criterionStats.get(criterion.id);
            if (cStat) cStat.comparisonCount += 1;

            roundStat.deltaSum += delta;
            roundStat.absSum += absDelta;
            roundStat.comparisonCount += 1;
        }

        reviewerStat.missingBaselineCount += reviewerMissingBaseline;
        if (reviewerComparisons > 0) {
            const prevAbsSum = (reviewerStat.consistency ?? 0) * reviewerStat.comparisonCount;
            const prevDeltaSum = (reviewerStat.leniencyBias ?? 0) * reviewerStat.comparisonCount;
            const totalComparisons = reviewerStat.comparisonCount + reviewerComparisons;
            reviewerStat.consistency = (prevAbsSum + reviewerAbsSum) / totalComparisons;
            reviewerStat.leniencyBias = (prevDeltaSum + reviewerDeltaSum) / totalComparisons;
            reviewerStat.comparisonCount = totalComparisons;
        }
    }

    criterionStats.forEach((stat, criterionId) => {
        const devSum = criterionDeviationSums.get(criterionId) ?? 0;
        stat.interRaterSpread = stat.comparisonCount > 0 ? devSum / stat.comparisonCount : 0;
    });

    const rounds: RoundAggregate[] = Array.from(roundStats.entries())
        .sort(([a], [b]) => a - b)
        .map(([round, stat]) => ({
            round,
            consistency: stat.comparisonCount > 0 ? stat.absSum / stat.comparisonCount : null,
            leniencyBias: stat.comparisonCount > 0 ? stat.deltaSum / stat.comparisonCount : null,
            comparisonCount: stat.comparisonCount,
            reviewCount: stat.reviewCount,
        }));

    const totalComparisons = Array.from(criterionStats.values()).reduce((sum, c) => sum + c.comparisonCount, 0);
    const totalMissingBaseline = Array.from(reviewerStats.values()).reduce((sum, r) => sum + r.missingBaselineCount, 0);

    return {
        rubricId: rubric.id,
        criteria: Array.from(criterionStats.values()),
        reviewers: Array.from(reviewerStats.values()),
        rounds,
        totalReviews: relevantPeerReviews.length,
        totalComparisons,
        totalMissingBaseline,
    };
}
