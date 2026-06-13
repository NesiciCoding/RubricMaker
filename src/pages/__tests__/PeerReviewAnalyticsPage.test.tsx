import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { Rubric, Student, StudentRubric } from '../../types';
import PeerReviewAnalyticsPage from '../PeerReviewAnalyticsPage';

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: 'Assess the essay',
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
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '',
    updatedAt: '',
    totalMaxPoints: 20,
    scoringMode: 'total-points',
};

const mockStudentA: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockStudentReviewer: Student = { id: 's2', name: 'Bob', classId: 'c1' };

const teacherBaseline: StudentRubric = {
    id: 'sr-baseline',
    rubricId: 'r1',
    studentId: 's1',
    overallComment: '',
    isPeerReview: false,
    entries: [
        { criterionId: 'c1', levelId: 'l1', overridePoints: 8, checkedSubItems: [], comment: '' },
        { criterionId: 'c2', levelId: 'l1', overridePoints: 8, checkedSubItems: [], comment: '' },
    ],
};

const peerReview: StudentRubric = {
    id: 'pr1',
    rubricId: 'r1',
    studentId: 's1',
    overallComment: '',
    isPeerReview: true,
    gradedBy: 's2',
    round: 1,
    entries: [
        { criterionId: 'c1', levelId: 'l1', overridePoints: 10, checkedSubItems: [], comment: 'Nice intro' },
        { criterionId: 'c2', levelId: 'l1', overridePoints: 9, checkedSubItems: [], comment: '' },
    ],
};

let mockUseApp: any;

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockUseApp,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => {
            if (opts && 'count' in opts) return `${key} (${opts.count})`;
            if (opts && 'n' in opts) return `${key} ${opts.n}`;
            if (opts && 'rubricName' in opts) return `${key}: ${opts.rubricName}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

function renderPage(initialEntries: string[] = ['/peer-analytics/r1']) {
    return render(
        <MemoryRouter initialEntries={initialEntries}>
            <Routes>
                <Route path="/peer-analytics/:rubricId" element={<PeerReviewAnalyticsPage />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('PeerReviewAnalyticsPage', () => {
    const baseApp = {
        settings: { theme: 'dark', overdueReminderThreshold: 7 },
        updateSettings: vi.fn(),
    };

    it('shows the empty state when there are no peer reviews', () => {
        mockUseApp = {
            ...baseApp,
            rubrics: [mockRubric],
            students: [mockStudentA, mockStudentReviewer],
            peerReviews: [],
            studentRubrics: [teacherBaseline],
        };

        renderPage();

        expect(screen.getByText('peerAnalytics.empty_state')).toBeInTheDocument();
    });

    it('shows rubric-not-found state for an unknown rubric', () => {
        mockUseApp = {
            ...baseApp,
            rubrics: [],
            students: [],
            peerReviews: [],
            studentRubrics: [],
        };

        renderPage(['/peer-analytics/unknown']);

        expect(screen.getByText('peerAnalytics.rubric_not_found')).toBeInTheDocument();
    });

    it('renders reviewer table and heatmap when peer reviews exist', () => {
        mockUseApp = {
            ...baseApp,
            rubrics: [mockRubric],
            students: [mockStudentA, mockStudentReviewer],
            peerReviews: [peerReview],
            studentRubrics: [teacherBaseline],
        };

        renderPage();

        // Reviewer name resolved via gradedBy
        expect(screen.getByText('Bob')).toBeInTheDocument();
        // Heatmap renders the criteria headers
        expect(screen.getByText('Structure')).toBeInTheDocument();
        expect(screen.getByText('Grammar')).toBeInTheDocument();
    });

    it('shows "Anonymous reviewer" when gradedBy is missing', () => {
        const anonymousReview: StudentRubric = { ...peerReview, id: 'pr2', gradedBy: undefined };
        mockUseApp = {
            ...baseApp,
            rubrics: [mockRubric],
            students: [mockStudentA, mockStudentReviewer],
            peerReviews: [anonymousReview],
            studentRubrics: [teacherBaseline],
        };

        renderPage();

        expect(screen.getByText('peerAnalytics.anonymous_reviewer')).toBeInTheDocument();
    });
});
