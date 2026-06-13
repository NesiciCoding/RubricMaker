import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ClassAverageAdjuster from '../ClassAverageAdjuster';
import { calcTestPercentage, calcStudentTestRawPoints } from '../../../utils/testCalc';
import type { Test as RmTest, StudentTest, Student } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

const mcQuestion = {
    id: 'q1',
    prompt: 'Pick the correct option',
    type: 'multiple-choice' as const,
    points: 4,
    options: [
        { id: 'a', text: 'Wrong', isCorrect: false },
        { id: 'b', text: 'Right', isCorrect: true },
    ],
};

const openQuestion = {
    id: 'q2',
    prompt: 'Explain',
    type: 'open' as const,
    points: 6,
};

const test: RmTest = {
    id: 't1',
    name: 'Test',
    questions: [mcQuestion, openQuestion],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
};

const students: Student[] = [
    { id: 's1', name: 'Alice', classId: 'c1' },
    { id: 's2', name: 'Bob', classId: 'c1' },
];

function makeStudentTests(): StudentTest[] {
    return [
        {
            id: 'st1',
            testId: 't1',
            studentId: 's1',
            answers: [
                { questionId: 'q1', response: 'b' },
                { questionId: 'q2', response: 'x', pointsEarned: 2 },
            ],
            status: 'graded',
            startedAt: '2026-01-01T09:00:00.000Z',
            rawTotalPoints: calcStudentTestRawPoints(test, [
                { questionId: 'q1', response: 'b' },
                { questionId: 'q2', response: 'x', pointsEarned: 2 },
            ]),
        },
        {
            id: 'st2',
            testId: 't1',
            studentId: 's2',
            answers: [
                { questionId: 'q1', response: 'a' },
                { questionId: 'q2', response: 'y', pointsEarned: 1 },
            ],
            status: 'graded',
            startedAt: '2026-01-01T09:00:00.000Z',
            rawTotalPoints: calcStudentTestRawPoints(test, [
                { questionId: 'q1', response: 'a' },
                { questionId: 'q2', response: 'y', pointsEarned: 1 },
            ]),
        },
    ];
}

describe('ClassAverageAdjuster', () => {
    it('shows the current class average and a preview table', () => {
        const studentTests = makeStudentTests();
        render(
            <ClassAverageAdjuster
                test={test}
                studentTests={studentTests}
                students={students}
                onSaveStudentTest={vi.fn()}
            />
        );

        const expectedAvg = (calcTestPercentage(6, 10) + calcTestPercentage(1, 10)) / 2;
        expect(screen.getByText(`${expectedAvg.toFixed(1)}%`)).toBeInTheDocument();
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('applies the adjustment and saves adjustment + moves percentages toward target', () => {
        const studentTests = makeStudentTests();
        const onSave = vi.fn();
        render(
            <ClassAverageAdjuster
                test={test}
                studentTests={studentTests}
                students={students}
                onSaveStudentTest={onSave}
            />
        );

        const targetInput = screen.getByLabelText('tests.results.target_average') as HTMLInputElement;
        fireEvent.change(targetInput, { target: { value: '100' } });

        const applyBtn = screen.getByText(/tests.results.apply_adjustment/);
        fireEvent.click(applyBtn);

        expect(onSave).toHaveBeenCalledTimes(2);
        for (const call of onSave.mock.calls) {
            const saved = call[0] as StudentTest;
            expect(saved.adjustment).toBeDefined();
            expect(saved.adjustment?.points).toBeGreaterThan(0);
            expect(saved.adjustmentPoints).toBe(saved.adjustment?.points);

            const original = studentTests.find((st) => st.id === saved.id)!;
            const before = calcTestPercentage(original.rawTotalPoints ?? 0, 10);
            const after = calcTestPercentage((saved.rawTotalPoints ?? 0) + (saved.adjustmentPoints ?? 0), 10);
            expect(after).toBeGreaterThanOrEqual(before);
        }
    });

    it('reverts an applied adjustment and restores raw points', () => {
        const studentTests: StudentTest[] = makeStudentTests().map((st) => ({
            ...st,
            adjustmentPoints: 1,
            adjustment: { points: 1, appliedAt: '2026-06-01T00:00:00.000Z' },
        }));
        const onSave = vi.fn();
        render(
            <ClassAverageAdjuster
                test={test}
                studentTests={studentTests}
                students={students}
                onSaveStudentTest={onSave}
            />
        );

        const revertBtn = screen.getByText(/tests.results.revert_adjustment/);
        fireEvent.click(revertBtn);

        expect(onSave).toHaveBeenCalledTimes(2);
        for (const call of onSave.mock.calls) {
            const saved = call[0] as StudentTest;
            expect(saved.adjustment).toBeUndefined();
            expect(saved.adjustmentPoints).toBeUndefined();
        }
    });
});
