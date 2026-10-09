import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ComparativeGradingDefault from '../ComparativeGrading';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { Class, Rubric, Student, StudentRubric, AppSettings } from '../../types';

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [
        {
            id: 'c1',
            title: 'Criterion 1',
            description: '',
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

const mockClassA: Class = { id: 'c1', name: 'Class A', rubricIds: ['r1'] };
const mockStudentA: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockStudentB: Student = { id: 's2', name: 'Bob', classId: 'c1' };

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockSaveStudentRubric = vi.fn();
const mockDeleteStudentRubric = vi.fn();
const mockAddComparativeMatchup = vi.fn();
const mockUpdateRubric = vi.fn();
const mockNavigate = vi.fn();

// Stable references — a domain-hook mock that builds new array literals on every call
// defeats this page's useMemo/useEffect deps and causes infinite render loops.
const mockRubricsArr = [mockRubric];
const mockStudentsArr = [mockStudentA, mockStudentB];
const mockClassesArr = [mockClassA];
const mockStudentRubricsArr: StudentRubric[] = [];
const mockAttachmentsArr: never[] = [];
const mockComparativeMatchupsArr: never[] = [];

const mockAppValue = {
    rubrics: mockRubricsArr,
    students: mockStudentsArr,
    classes: mockClassesArr,
    studentRubrics: mockStudentRubricsArr,
    attachments: mockAttachmentsArr,
    comparativeMatchups: mockComparativeMatchupsArr,
    saveStudentRubric: mockSaveStudentRubric,
    deleteStudentRubric: mockDeleteStudentRubric,
    addComparativeMatchup: mockAddComparativeMatchup,
    updateRubric: mockUpdateRubric,
    gradeScales: [],
    settings: mockSettings,
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

function renderAt(path: string) {
    const router = createMemoryRouter(
        [{ path: '/grade-comparative/:classId/:rubricId', element: <ComparativeGradingDefault /> }],
        { initialEntries: [path] }
    );
    return render(<RouterProvider router={router} />);
}

describe('ComparativeGrading', () => {
    let mathRandomSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        mockSaveStudentRubric.mockClear();
        mockDeleteStudentRubric.mockClear();
        mockAddComparativeMatchup.mockClear();
        mockUpdateRubric.mockClear();
        mockNavigate.mockClear();
        mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    });

    afterEach(() => {
        mathRandomSpy.mockRestore();
    });

    it('shows the class picker when no class is chosen, then the student picker', () => {
        renderAt('/grade-comparative/all/r1');
        expect(screen.getByText('comparativeGrading.select_class_title')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Class A' }));
        expect(screen.getByText('comparativeGrading.select_student_title')).toBeInTheDocument();
        expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('starts a random session from the class picker', () => {
        renderAt('/grade-comparative/all/r1');
        fireEvent.click(screen.getByRole('button', { name: 'Class A' }));
        fireEvent.click(screen.getByText('comparativeGrading.action_start_random'));
        expect(mockNavigate).toHaveBeenCalledWith('/grade-comparative/c1/r1', { replace: true });
    });

    it('renders the grading session with two students and compares a criterion', () => {
        renderAt('/grade-comparative/c1/r1');
        expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
        fireEvent.click(screen.getByText('comparativeGrading.action_equal'));
        fireEvent.click(screen.getByText(/comparativeGrading.action_save_next/));
        expect(mockSaveStudentRubric).toHaveBeenCalledTimes(2);
    });

    describe('unsaved-changes guard (#658)', () => {
        function renderWithElsewhere() {
            const router = createMemoryRouter(
                [
                    { path: '/grade-comparative/:classId/:rubricId', element: <ComparativeGradingDefault /> },
                    { path: '/tests', element: <div>tests page</div> },
                ],
                { initialEntries: ['/grade-comparative/c1/r1'] }
            );
            render(<RouterProvider router={router} />);
            return router;
        }

        it('leaves a freshly loaded matchup without a prompt', async () => {
            const router = renderWithElsewhere();
            await act(async () => {
                await router.navigate('/tests');
            });
            expect(await screen.findByText('tests page')).toBeInTheDocument();
        });

        it('asks before leaving a matchup with an unsaved comparison', async () => {
            const router = renderWithElsewhere();
            fireEvent.click(screen.getByText('comparativeGrading.action_equal'));
            await act(async () => {
                await router.navigate('/tests');
            });
            expect(await screen.findByText('common.unsaved_title')).toBeInTheDocument();
            fireEvent.click(screen.getByText('common.unsaved_leave'));
            expect(await screen.findByText('tests page')).toBeInTheDocument();
        });
    });

    describe('existing grade records (#618)', () => {
        const graded = (id: string, studentId: string, levelId: string): StudentRubric => ({
            id,
            rubricId: 'r1',
            studentId,
            entries: [{ criterionId: 'c1', levelId, comment: '', checkedSubItems: [] }],
            overallComment: '',
            isPeerReview: false,
            gradedAt: '2024-02-01T00:00:00Z',
        });
        afterEach(() => {
            mockStudentRubricsArr.length = 0;
        });

        it("loads both students' existing grades and saves onto the same record ids", () => {
            mockStudentRubricsArr.push(graded('sr-alice', 's1', 'l1'), graded('sr-bob', 's2', 'l2'));
            renderAt('/grade-comparative/c1/r1');
            // Pre-loaded: Alice is on Excellent (90-100), Bob on Good (70-89), not 0 pts.
            expect(screen.queryByText(/^0 pts/)).not.toBeInTheDocument();
            fireEvent.click(screen.getByText(/comparativeGrading.action_save_next/));
            const savedIds = mockSaveStudentRubric.mock.calls.map(([sr]) => sr.id).sort();
            expect(savedIds).toEqual(['sr-alice', 'sr-bob']);
        });

        it('reuses the records it just created when the same pair comes up again', () => {
            renderAt('/grade-comparative/c1/r1');
            fireEvent.click(screen.getByText(/comparativeGrading.action_save_next/));
            fireEvent.click(screen.getByText(/comparativeGrading.action_save_next/));
            const idsFor = (studentId: string) =>
                new Set(
                    mockSaveStudentRubric.mock.calls.filter(([sr]) => sr.studentId === studentId).map(([sr]) => sr.id)
                );
            expect(mockSaveStudentRubric).toHaveBeenCalledTimes(4);
            expect(idsFor('s1').size).toBe(1);
            expect(idsFor('s2').size).toBe(1);
        });

        it('adds entries for criteria created after an existing grade was saved', () => {
            const old = { ...graded('sr-alice', 's1', 'l1'), entries: [] };
            mockStudentRubricsArr.push(old, graded('sr-bob', 's2', 'l2'));
            renderAt('/grade-comparative/c1/r1');
            fireEvent.click(screen.getByText('comparativeGrading.action_equal'));
            fireEvent.click(screen.getByText(/comparativeGrading.action_save_next/));
            const alice = mockSaveStudentRubric.mock.calls.map(([sr]) => sr).find((sr) => sr.id === 'sr-alice');
            expect(alice.entries).toEqual([expect.objectContaining({ criterionId: 'c1', levelId: 'l2' })]);
        });

        it('flags duplicate records and keeps only the one shown', () => {
            mockStudentRubricsArr.push(
                graded('sr-alice', 's1', 'l1'),
                graded('sr-bob', 's2', 'l2'),
                graded('sr-bob-dup', 's2', 'l1')
            );
            renderAt('/grade-comparative/c1/r1');
            expect(screen.getAllByRole('status').map((el) => el.textContent)).toContainEqual(
                expect.stringContaining('comparativeGrading.duplicate_records:{"count":2}')
            );
            fireEvent.click(screen.getByText('comparativeGrading.duplicate_records_keep'));
            expect(mockDeleteStudentRubric).toHaveBeenCalledTimes(1);
            expect(mockDeleteStudentRubric).toHaveBeenCalledWith('sr-bob-dup', 'student');
        });
    });

    it('renders the combined-classes session scope', () => {
        renderAt('/grade-comparative/__combined__/r1');
        expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
    });

    it('shows the rubric-not-found state for a missing rubricId param', () => {
        const router = createMemoryRouter(
            [{ path: '/grade-comparative/:classId', element: <ComparativeGradingDefault /> }],
            {
                initialEntries: ['/grade-comparative/c1'],
            }
        );
        render(<RouterProvider router={router} />);
        expect(screen.getByText('comparativeGrading.rubric_not_found')).toBeInTheDocument();
    });
});
