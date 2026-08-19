import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, Rubric, Student, StudentRubric } from '../../types';

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: 'Rubric description',
    criteria: [
        {
            id: 'c1',
            title: 'Criterion 1',
            description: 'Criterion description',
            weight: 100,
            levels: [
                { id: 'l1', label: 'Excellent', minPoints: 90, maxPoints: 100, description: '', subItems: [] },
                { id: 'l2', label: 'Good', minPoints: 70, maxPoints: 89, description: '', subItems: [] },
            ],
        },
    ],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
};

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockSavePeerReview = vi.fn();
const mockNavigate = vi.fn();

const peerReviews: StudentRubric[] = [];

const mockAppValue = {
    rubrics: [mockRubric],
    students: [mockStudent],
    classes: [mockClass],
    studentRubrics: [],
    peerReviews,
    settings: mockSettings,
    savePeerReview: mockSavePeerReview,
};

vi.mock('../../context/AppContext', () => ({
    useRoster: () => mockAppValue,
    useStudents: () => mockAppValue,
    useClasses: () => mockAppValue,
    useGrading: () => mockAppValue,
    useAuthoring: () => mockAppValue,
    useAssessment: () => mockAppValue,
    useEssays: () => mockAppValue,
    useFlashcards: () => mockAppValue,
    useSettings: () => mockAppValue,
    usePlatform: () => mockAppValue,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../components/Editor/TiptapEditor', () => ({
    default: ({ content, onChange }: { content: string; onChange: (html: string) => void }) =>
        React.createElement('textarea', {
            'data-testid': 'tiptap-mock',
            value: content,
            onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value),
        }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

let PeerReviewViewComp: React.ComponentType;

function renderAt(rubricId: string, studentId: string, query = '') {
    const router = createMemoryRouter(
        [{ path: '/peer-review/:rubricId/:studentId', element: <PeerReviewViewComp /> }],
        { initialEntries: [`/peer-review/${rubricId}/${studentId}${query}`] }
    );
    return render(<RouterProvider router={router} />);
}

function existingReview(partial: Partial<StudentRubric>): StudentRubric {
    return {
        id: 'pr1',
        rubricId: 'r1',
        studentId: 's1',
        entries: [{ criterionId: 'c1', levelId: 'l1', comment: 'pre-filled comment', checkedSubItems: [] }],
        overallComment: 'overall pre-filled',
        isPeerReview: true,
        round: 1,
        ...partial,
    };
}

describe('PeerReviewView coverage', () => {
    beforeEach(async () => {
        mockSavePeerReview.mockClear();
        mockNavigate.mockClear();
        peerReviews.length = 0;
        const mod = await import('../PeerReviewView');
        PeerReviewViewComp = mod.default;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('navigates back from the not-found state', () => {
        renderAt('bad-rubric', 's1');
        fireEvent.click(screen.getByText('gradeStudent.action_back'));
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('guards against unsaved changes on beforeunload and lets clean state through', () => {
        renderAt('r1', 's1');
        const cleanEvent = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(cleanEvent);
        expect(cleanEvent.defaultPrevented).toBe(false);

        fireEvent.click(screen.getByText('Excellent'));
        const dirtyEvent = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(dirtyEvent);
        expect(dirtyEvent.defaultPrevented).toBe(true);
    });

    it('loads an existing peer review for the current round and reviewer', () => {
        // A legacy review without a round falls back to round 1 via the ?? arm.
        peerReviews.push(existingReview({ round: undefined }));
        renderAt('r1', 's1');
        expect(screen.getByText('Excellent').closest('.card')).toHaveClass('active');
        expect(screen.getAllByTestId('tiptap-mock')[0]).toHaveValue('pre-filled comment');
        expect(screen.getAllByTestId('tiptap-mock')[1]).toHaveValue('overall pre-filled');
    });

    it('loads an existing review by gradedBy when a reviewerId is present', () => {
        peerReviews.push(existingReview({ id: 'pr2', gradedBy: 'peer1', overallComment: 'peer comment' }));
        renderAt('r1', 's1', '?reviewerId=peer1');
        expect(screen.getAllByTestId('tiptap-mock')[1]).toHaveValue('peer comment');
    });

    it('renders round tabs from existing reviews and switches rounds, confirming when dirty', async () => {
        peerReviews.push(existingReview({}), existingReview({ id: 'pr3', round: 3, overallComment: 'round three' }));
        renderAt('r1', 's1');
        // maxRound 3 → tabs 1, 2, 3.
        expect(screen.getByText('peerReview.round_n:{"n":3}')).toBeInTheDocument();
        expect(screen.getByText('peerReview.round_n:{"n":2}')).toBeInTheDocument();

        // Clean switch to round 2 → no confirm.
        fireEvent.click(screen.getByText('peerReview.round_n:{"n":2}'));
        expect(screen.getAllByTestId('tiptap-mock')[1]).toHaveValue('');

        // Dirty switch to round 3 → confirm dialog; cancel keeps round 2.
        fireEvent.click(screen.getByText('Excellent'));
        fireEvent.click(screen.getByText('peerReview.round_n:{"n":3}'));
        await act(async () => {
            fireEvent.click(screen.getByText('common.cancel'));
        });
        expect(screen.getAllByTestId('tiptap-mock')[1]).toHaveValue('');

        // Confirm the dirty switch → round 3 loads.
        fireEvent.click(screen.getByText('Excellent'));
        fireEvent.click(screen.getByText('peerReview.round_n:{"n":3}'));
        await act(async () => {
            fireEvent.click(screen.getByText('common.confirm'));
        });
        expect(screen.getAllByTestId('tiptap-mock')[1]).toHaveValue('round three');
    });

    it('adds a new round above the current maximum', () => {
        peerReviews.push(existingReview({}));
        renderAt('r1', 's1');
        expect(screen.getByText('peerReview.round_n:{"n":1}')).toBeInTheDocument();
        fireEvent.click(screen.getByText('+ peerReview.add_round'));
        expect(screen.getByText('peerReview.round_n:{"n":2}')).toBeInTheDocument();
        fireEvent.click(screen.getByText('gradeStudent.action_save'));
        expect(mockSavePeerReview).toHaveBeenCalledWith(expect.objectContaining({ round: 2 }));
    });

    it('updates criterion comments and the overall comment, then saves them', () => {
        renderAt('r1', 's1');
        const editors = screen.getAllByTestId('tiptap-mock');
        fireEvent.change(editors[0], { target: { value: 'criterion feedback' } });
        fireEvent.change(editors[1], { target: { value: 'overall feedback' } });
        fireEvent.click(screen.getByText('gradeStudent.action_save'));
        expect(mockSavePeerReview).toHaveBeenCalledWith(
            expect.objectContaining({
                overallComment: 'overall feedback',
                entries: [expect.objectContaining({ comment: 'criterion feedback' })],
            })
        );
    });

    it('shows the saved state for 2 seconds and then reverts', () => {
        vi.useFakeTimers();
        renderAt('r1', 's1');
        fireEvent.click(screen.getByText('gradeStudent.action_save'));
        expect(screen.getByText('gradeStudent.action_saved')).toBeInTheDocument();
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(screen.getByText('gradeStudent.action_save')).toBeInTheDocument();
    });

    it('navigates to the peer analytics view', () => {
        renderAt('r1', 's1');
        fireEvent.click(screen.getByText('peerReview.view_analytics'));
        expect(mockNavigate).toHaveBeenCalledWith('/peer-analytics/r1');
        expect(mockSavePeerReview).not.toHaveBeenCalled();
    });

    it('leaves sibling criteria untouched when updating one criterion', () => {
        const twoCriterionRubric: Rubric = {
            ...mockRubric,
            criteria: [
                ...mockRubric.criteria,
                {
                    id: 'c2',
                    title: 'Criterion 2',
                    description: '',
                    weight: 100,
                    levels: [
                        { id: 'l1', label: 'Excellent', minPoints: 90, maxPoints: 100, description: '', subItems: [] },
                    ],
                },
            ],
        };
        mockAppValue.rubrics = [twoCriterionRubric];
        renderAt('r1', 's1');
        const editors = screen.getAllByTestId('tiptap-mock');
        expect(editors).toHaveLength(3);

        fireEvent.click(screen.getAllByText('Excellent')[0]);
        fireEvent.change(editors[0], { target: { value: 'only criterion one' } });
        fireEvent.click(screen.getByText('gradeStudent.action_save'));
        expect(mockSavePeerReview).toHaveBeenCalledWith(
            expect.objectContaining({
                entries: [
                    expect.objectContaining({ criterionId: 'c1', levelId: 'l1', comment: 'only criterion one' }),
                    expect.objectContaining({ criterionId: 'c2', levelId: null, comment: '' }),
                ],
            })
        );
    });
});
