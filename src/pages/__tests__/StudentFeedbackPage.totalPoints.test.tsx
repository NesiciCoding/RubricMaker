import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import StudentFeedbackPage from '../StudentFeedbackPage';
import { encodeFeedbackCode } from '../../utils/shareCode';
import { calcGradeSummary } from '../../utils/gradeCalc';
import {
    TOTAL_POINTS_PERCENT,
    WEIGHTED_PERCENT,
    makeTotalPointsGrade,
    makeTotalPointsRubric,
    totalPointsScale,
} from '../../test-utils/totalPointsRubric';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

describe('StudentFeedbackPage on a total-points rubric', () => {
    it('shows the same percentage and letter as GradeStudent', () => {
        const rubric = makeTotalPointsRubric();
        const sr = makeTotalPointsGrade();
        const expected = calcGradeSummary(sr, rubric.criteria, totalPointsScale, rubric);
        const code = encodeFeedbackCode({
            sr,
            rubric,
            student: { id: 'tp-student', name: 'Alice', classId: 'k1' },
            scale: totalPointsScale,
        });
        const router = createMemoryRouter([{ path: '/feedback/:code', element: <StudentFeedbackPage /> }], {
            initialEntries: [`/feedback/${code}`],
        });
        render(<RouterProvider router={router} />);

        expect(expected.modifiedPercentage).toBe(TOTAL_POINTS_PERCENT);
        expect(screen.getByText(`${TOTAL_POINTS_PERCENT.toFixed(1)}%`)).toBeInTheDocument();
        expect(screen.getByText(expected.letterGrade)).toBeInTheDocument();
        expect(screen.queryByText(`${WEIGHTED_PERCENT.toFixed(1)}%`)).not.toBeInTheDocument();
    });
});
