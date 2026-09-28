import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import StudentSnapshotTable from '../StudentSnapshotTable';
import { DEFAULT_FORMAT } from '../../../types';
import type { Student, Class, StudentRubric, Rubric, Test, StudentTest } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

const emptyProps = {
    classes: [] as Class[],
    studentRubrics: [] as StudentRubric[],
    rubrics: [] as Rubric[],
    selfAssessments: [],
    analysisResults: [],
    tests: [] as Test[],
    studentTests: [] as StudentTest[],
    flashcardDecks: [],
    flashcardAssignments: [],
    flashcardReviews: [],
    cefrAchieveThreshold: 70,
};

const alice: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const bob: Student = { id: 's2', name: 'Bob', classId: 'c1' };
const cls: Class = { id: 'c1', name: 'English 3A' };

describe('StudentSnapshotTable', () => {
    it('renders an empty state when there are no students', () => {
        render(<StudentSnapshotTable {...emptyProps} students={[]} />);
        expect(screen.getByText('dashboard.snapshot_empty')).toBeTruthy();
    });

    it('renders one row per student, with a dash for grammar/vocab when there is no evidence', () => {
        render(<StudentSnapshotTable {...emptyProps} students={[alice, bob]} classes={[cls]} />);
        expect(screen.getByText('Alice')).toBeTruthy();
        expect(screen.getByText('Bob')).toBeTruthy();
        expect(screen.getAllByText('dashboard.snapshot_no_data_short')).toHaveLength(4); // grammar + vocab x2
    });

    it('navigates to the student profile when the name cell is clicked', () => {
        render(<StudentSnapshotTable {...emptyProps} students={[alice]} classes={[cls]} />);
        fireEvent.click(screen.getByText('Alice'));
        expect(mockNavigate).toHaveBeenCalledWith('/students/s1');
    });

    it('navigates to the student profile when the trailing chevron is clicked', () => {
        render(<StudentSnapshotTable {...emptyProps} students={[alice]} classes={[cls]} />);
        const chevron = screen.getByLabelText('dashboard.snapshot_open_profile:{"name":"Alice"}');
        fireEvent.click(chevron);
        expect(mockNavigate).toHaveBeenCalledWith('/students/s1');
    });

    it('shows a grammar mastery score and links to the learning path when there is test evidence', () => {
        const test: Test = {
            id: 't1',
            name: 'Grammar test',
            questions: [
                {
                    id: 'q1',
                    prompt: '...',
                    type: 'cloze',
                    points: 1,
                    linkedGrammarItemId: 'gr-present-simple-affirmative',
                },
            ],
            requireSEB: false,
            shuffleQuestions: false,
            createdAt: '2026-01-01T00:00:00.000Z',
        };
        const studentTests: StudentTest[] = [
            {
                id: 'st1',
                testId: 't1',
                studentId: 's1',
                answers: [{ questionId: 'q1', response: 'x', pointsEarned: 1 }],
                status: 'graded',
                startedAt: '2026-01-01T00:00:00.000Z',
            },
        ];
        render(
            <StudentSnapshotTable
                {...emptyProps}
                students={[alice]}
                classes={[cls]}
                tests={[test]}
                studentTests={studentTests}
            />
        );
        const cell = screen.getByText('100%');
        fireEvent.click(cell);
        expect(mockNavigate).toHaveBeenCalledWith('/students/s1/learning-path');
    });

    it('shows a needs-attention flag when the student has an intervention streak, and none otherwise', () => {
        const rubric: Rubric = {
            id: 'r1',
            name: 'Essay rubric',
            subject: 'English',
            description: '',
            criteria: [
                {
                    id: 'c1',
                    title: 'Grammar accuracy',
                    description: '',
                    weight: 100,
                    levels: [{ id: 'l1', label: 'Weak', minPoints: 1, maxPoints: 4, description: '', subItems: [] }],
                },
            ],
            gradeScaleId: 'none',
            format: DEFAULT_FORMAT,
            attachmentIds: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            totalMaxPoints: 4,
            scoringMode: 'weighted-percentage',
        };
        // Three consecutive low (25%) grades on the same criterion trips getCriterionInterventionFlags'
        // default 3-in-a-row-at-or-below-60% threshold.
        const studentRubrics: StudentRubric[] = [1, 2, 3].map((n) => ({
            id: `sr${n}`,
            rubricId: 'r1',
            studentId: 's1',
            entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' }],
            overallComment: '',
            gradedAt: `2026-01-0${n}T00:00:00.000Z`,
            isPeerReview: false,
        }));

        render(
            <StudentSnapshotTable
                {...emptyProps}
                students={[alice, bob]}
                classes={[cls]}
                rubrics={[rubric]}
                studentRubrics={studentRubrics}
            />
        );
        const flagButton = screen.getByRole('button', { name: /snapshot_needs_attention_tooltip/ });
        expect(flagButton.textContent).toContain('1');
        fireEvent.click(flagButton);
        expect(mockNavigate).toHaveBeenCalledWith('/students/s1/learning-path');
    });
});
