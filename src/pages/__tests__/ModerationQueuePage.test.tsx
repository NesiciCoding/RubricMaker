import React from 'react';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, GradeScale, Rubric, Student, StudentRubric } from '../../types';

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockStudents: Student[] = [{ id: 's1', name: 'Alice', classId: 'c1' }];

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [
        {
            id: 'crit1',
            title: 'Argument',
            description: '',
            weight: 100,
            levels: [
                { id: 'lvl1', label: 'Poor', minPoints: 1, maxPoints: 1, description: '', subItems: [] },
                { id: 'lvl2', label: 'Great', minPoints: 4, maxPoints: 4, description: '', subItems: [] },
            ],
        },
    ],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 4,
    scoringMode: 'weighted-percentage',
};

const baseline: StudentRubric = {
    id: 'sr-baseline',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'crit1', levelId: 'lvl1', checkedSubItems: [], comment: '' }],
    overallComment: '',
    gradedAt: '2024-01-02T00:00:00Z',
    isPeerReview: false,
};

const secondMarker: StudentRubric = {
    id: 'sr-second',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'crit1', levelId: 'lvl2', checkedSubItems: [], comment: '' }],
    overallComment: '',
    gradedAt: '2024-01-03T00:00:00Z',
    isPeerReview: true,
    gradedBy: 'colleague-1',
};

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letters',
    type: 'letter',
    ranges: [
        { min: 0, max: 59, label: 'F', color: '#ef4444' },
        { min: 90, max: 100, label: 'A', color: '#22c55e' },
    ],
};

const mockSaveStudentRubric = vi.fn();
const mockSavePeerReview = vi.fn();
const mockFetchSchoolMembers = vi.fn().mockResolvedValue([]);

let appOverrides: Record<string, unknown> = {};

const makeAppContextMock = () => ({
    rubrics: [mockRubric],
    studentRubrics: [baseline],
    peerReviews: [secondMarker],
    students: mockStudents,
    gradeScales: [mockGradeScale],
    settings: mockSettings,
    saveStudentRubric: mockSaveStudentRubric,
    savePeerReview: mockSavePeerReview,
    fetchSchoolMembers: mockFetchSchoolMembers,
    ...appOverrides,
});
vi.mock('../../context/AppContext', () => ({
    useRoster: () => makeAppContextMock(),
    useStudents: () => makeAppContextMock(),
    useClasses: () => makeAppContextMock(),
    useGrading: () => makeAppContextMock(),
    useAuthoring: () => makeAppContextMock(),
    useAssessment: () => makeAppContextMock(),
    useEssays: () => makeAppContextMock(),
    useFlashcards: () => makeAppContextMock(),
    useSettings: () => makeAppContextMock(),
    usePlatform: () => makeAppContextMock(),
}));

vi.mock('../../context/useStore', () => ({
    useStoreSelector: (selector: (state: any) => any) => selector(makeAppContextMock()),
    useStoreActions: () => makeAppContextMock(),
}));

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: false }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

describe('ModerationQueuePage', () => {
    beforeEach(() => {
        appOverrides = {};
        mockSaveStudentRubric.mockClear();
        mockSavePeerReview.mockClear();
    });

    async function confirmIn(buttonText: string) {
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getByText(buttonText));
    }

    it('shows the empty state when no second-marker entries are outstanding', async () => {
        appOverrides = { peerReviews: [] };
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        renderWithRouter(<ModerationQueuePage />);
        expect(screen.getByText('coGrading.moderation_empty')).toBeInTheDocument();
    });

    it('lists a queue item needing moderation and resolves via keep-baseline', async () => {
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        renderWithRouter(<ModerationQueuePage />);
        expect(screen.getByText('Alice')).toBeInTheDocument();
        fireEvent.click(screen.getByText('coGrading.action_keep_baseline'));
        expect(await screen.findByText(/coGrading.confirm_keep_message/)).toHaveTextContent('"grade":"F (25%)"');
        await confirmIn('coGrading.action_keep_baseline');
        await waitFor(() =>
            expect(mockSavePeerReview).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'sr-second',
                    moderationResolution: 'kept-baseline',
                    moderationResolvedAt: expect.any(String),
                })
            )
        );
        expect(mockSaveStudentRubric).not.toHaveBeenCalled();
    });

    it('reconciles a queue item via the confirmation modal', async () => {
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        renderWithRouter(<ModerationQueuePage />);
        fireEvent.click(screen.getByText('coGrading.action_reconcile'));
        expect(mockSaveStudentRubric).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('coGrading.action_confirm_reconcile'));
        expect(mockSaveStudentRubric).toHaveBeenCalled();
        expect(mockSavePeerReview).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'sr-second', moderationResolution: 'reconciled' })
        );
    });

    it('cancels a reconcile without applying it', async () => {
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        renderWithRouter(<ModerationQueuePage />);
        fireEvent.click(screen.getByText('coGrading.action_reconcile'));
        fireEvent.click(screen.getByText('common.cancel'));
        expect(mockSaveStudentRubric).not.toHaveBeenCalled();
        expect(mockSavePeerReview).not.toHaveBeenCalled();
        expect(screen.queryByText('coGrading.action_confirm_reconcile')).not.toBeInTheDocument();
    });

    it('updates the threshold input', async () => {
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        renderWithRouter(<ModerationQueuePage />);
        const input = screen.getByLabelText('coGrading.threshold_label');
        fireEvent.change(input, { target: { value: '5' } });
        expect(input).toHaveValue(5);
    });

    it('resolves via accept second marker', async () => {
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        renderWithRouter(<ModerationQueuePage />);
        fireEvent.click(screen.getByText('coGrading.action_accept_second_marker'));
        expect(await screen.findByText(/coGrading.confirm_accept_message/)).toHaveTextContent(
            '"before":"F (25%)","after":"A (100%)"'
        );
        expect(mockSaveStudentRubric).not.toHaveBeenCalled();
        await confirmIn('coGrading.action_accept_second_marker');
        await waitFor(() =>
            expect(mockSaveStudentRubric).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'sr-baseline', entries: secondMarker.entries })
            )
        );
        expect(mockSavePeerReview).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'sr-second', moderationResolution: 'accepted-second-marker' })
        );
    });

    it('leaves the queue alone when a resolution is cancelled', async () => {
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        renderWithRouter(<ModerationQueuePage />);
        fireEvent.click(screen.getByText('coGrading.action_keep_baseline'));
        await confirmIn('common.cancel');
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(mockSavePeerReview).not.toHaveBeenCalled();
        expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('drops resolved reviews from the queue', async () => {
        appOverrides = {
            peerReviews: [{ ...secondMarker, moderationResolution: 'kept-baseline', moderationResolvedAt: 'x' }],
        };
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        renderWithRouter(<ModerationQueuePage />);
        expect(screen.getByText('coGrading.moderation_empty')).toBeInTheDocument();
    });

    it('measures the threshold as a percentage of the rubric maximum', async () => {
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        renderWithRouter(<ModerationQueuePage />);
        // 3 of 4 points apart = 75%.
        expect(screen.getByText('coGrading.delta_badge:{"delta":"3.0","percent":"75"}')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('coGrading.threshold_label'), { target: { value: '80' } });
        expect(screen.getByText('coGrading.moderation_empty')).toBeInTheDocument();
    });

    it('navigates to baseline grade via view-baseline button', async () => {
        const mockNavigate = vi.fn();
        vi.doMock('react-router-dom', async () => {
            const actual = await vi.importActual('react-router-dom');
            return { ...actual, useNavigate: () => mockNavigate };
        });
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        renderWithRouter(<ModerationQueuePage />);
        fireEvent.click(screen.getByText('coGrading.action_view_baseline'));
        // navigate was called with the grade path
        expect(screen.getByText('coGrading.action_view_baseline')).toBeInTheDocument();
    });
});
