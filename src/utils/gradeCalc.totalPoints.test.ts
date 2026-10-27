import { describe, expect, it } from 'vitest';
import { calcGradeSummary } from './gradeCalc';
import {
    TOTAL_POINTS_PERCENT,
    WEIGHTED_PERCENT,
    makeTotalPointsGrade,
    makeTotalPointsRubric,
    totalPointsScale,
} from '../test-utils/totalPointsRubric';

describe('calcGradeSummary on a total-points rubric', () => {
    const rubric = makeTotalPointsRubric();
    const sr = makeTotalPointsGrade();

    it('scores against totalMaxPoints only when the rubric is passed', () => {
        const withRubric = calcGradeSummary(sr, rubric.criteria, totalPointsScale, rubric);
        const withoutRubric = calcGradeSummary(sr, rubric.criteria, totalPointsScale);

        expect(withRubric.percentage).toBe(TOTAL_POINTS_PERCENT);
        expect(withRubric.letterGrade).toBe('B');
        expect(withoutRubric.percentage).toBe(WEIGHTED_PERCENT);
        expect(withoutRubric.letterGrade).toBe('F');
    });
});
