import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ComparativeGradingDefault from '../ComparativeGrading';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { Class, Rubric, Student, AppSettings } from '../../types';

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
const mockNavigate = vi.fn();

// Stable references — a useApp() mock that builds new array literals on every call
// defeats this page's useMemo/useEffect deps and causes infinite render loops.
const mockRubricsArr = [mockRubric];
const mockStudentsArr = [mockStudentA, mockStudentB];
const mockClassesArr = [mockClassA];
const mockStudentRubricsArr: never[] = [];
const mockAttachmentsArr: never[] = [];

const mockAppValue = {
    rubrics: mockRubricsArr,
    students: mockStudentsArr,
    classes: mockClassesArr,
    studentRubrics: mockStudentRubricsArr,
    attachments: mockAttachmentsArr,
    saveStudentRubric: mockSaveStudentRubric,
    gradeScales: [],
    settings: mockSettings,
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
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
