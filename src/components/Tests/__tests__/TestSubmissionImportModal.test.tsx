import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TestSubmissionImportModal from '../TestSubmissionImportModal';
import { encodeTestSubmission } from '../../../utils/shareCode';
import { calcStudentTestRawPoints } from '../../../utils/testCalc';
import type { Test as RmTest, TestSubmissionPayload } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

const test: RmTest = {
    id: 't1',
    name: 'Test',
    questions: [
        {
            id: 'q1',
            prompt: 'Pick the correct option',
            type: 'multiple-choice',
            points: 4,
            options: [
                { id: 'a', text: 'Wrong', isCorrect: false },
                { id: 'b', text: 'Right', isCorrect: true },
            ],
        },
    ],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
};

const submission: TestSubmissionPayload = {
    testId: 't1',
    studentId: 's1',
    teacherKey: 'tk1',
    answers: [{ questionId: 'q1', response: 'b' }],
    startedAt: '2026-01-01T09:00:00.000Z',
    submittedAt: '2026-01-01T09:30:00.000Z',
};

describe('TestSubmissionImportModal', () => {
    it('decodes a pasted submission code and creates a StudentTest via the save helper', () => {
        const onSave = vi.fn();
        const code = encodeTestSubmission(submission);
        render(<TestSubmissionImportModal test={test} studentTests={[]} onSave={onSave} onClose={vi.fn()} />);

        const textarea = screen.getByLabelText('tests.results.import_code_label');
        fireEvent.change(textarea, { target: { value: code } });
        fireEvent.click(screen.getByText(/tests.results.import_btn/));

        expect(onSave).toHaveBeenCalledTimes(1);
        const saved = onSave.mock.calls[0][0];
        expect(saved.testId).toBe('t1');
        expect(saved.studentId).toBe('s1');
        expect(saved.answers).toEqual(submission.answers);
        expect(saved.rawTotalPoints).toBe(calcStudentTestRawPoints(test, submission.answers));
        expect(screen.getByText('tests.results.import_success')).toBeInTheDocument();
    });

    it('shows an error for an invalid code', () => {
        const onSave = vi.fn();
        render(<TestSubmissionImportModal test={test} studentTests={[]} onSave={onSave} onClose={vi.fn()} />);

        const textarea = screen.getByLabelText('tests.results.import_code_label');
        fireEvent.change(textarea, { target: { value: 'not-a-valid-code' } });
        fireEvent.click(screen.getByText(/tests.results.import_btn/));

        expect(onSave).not.toHaveBeenCalled();
        expect(screen.getByText('tests.results.import_error_invalid')).toBeInTheDocument();
    });

    it('shows an error when the code is for a different test', () => {
        const onSave = vi.fn();
        const code = encodeTestSubmission({ ...submission, testId: 'other-test' });
        render(<TestSubmissionImportModal test={test} studentTests={[]} onSave={onSave} onClose={vi.fn()} />);

        const textarea = screen.getByLabelText('tests.results.import_code_label');
        fireEvent.change(textarea, { target: { value: code } });
        fireEvent.click(screen.getByText(/tests.results.import_btn/));

        expect(onSave).not.toHaveBeenCalled();
        expect(screen.getByText('tests.results.import_error_wrong_test')).toBeInTheDocument();
    });
});
