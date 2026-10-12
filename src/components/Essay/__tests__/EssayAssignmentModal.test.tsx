import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import EssayAssignmentModal from '../EssayAssignmentModal';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

describe('EssayAssignmentModal prompt pre-fill', () => {
    it('pre-fills the prompt from initialValues (e.g. an existing assignment for the rubric)', () => {
        render(
            <EssayAssignmentModal
                rubricId="rubric1"
                rubricName="Writing Test"
                studentId="student1"
                studentName="Jane"
                onClose={() => {}}
                onOpenSlipSheet={() => {}}
                classStudents={[{ id: 'student1', name: 'Jane' }]}
                initialValues={{ title: 'Essay Test', prompt: 'Write a short story...' }}
            />
        );
        expect(screen.getByLabelText(/prompt_label/)).toHaveValue('Write a short story...');
        expect(screen.getByLabelText(/title_label/)).toHaveValue('Essay Test');
    });

    it('leaves the prompt blank when neither a template nor initialValues supply one', () => {
        render(
            <EssayAssignmentModal
                rubricId="rubric1"
                rubricName="Writing Test"
                studentId="student1"
                studentName="Jane"
                onClose={() => {}}
                onOpenSlipSheet={() => {}}
                classStudents={[{ id: 'student1', name: 'Jane' }]}
            />
        );
        expect(screen.getByLabelText(/prompt_label/)).toHaveValue('');
    });
});

describe('EssayAssignmentModal word limits (#676)', () => {
    it('disables assigning while the minimum exceeds the maximum', () => {
        const onAssign = vi.fn();
        render(
            <EssayAssignmentModal
                rubricId="rubric1"
                rubricName="Writing Test"
                studentId="student1"
                studentName="Jane"
                onClose={() => {}}
                onOpenSlipSheet={() => {}}
                onAssignToStudents={onAssign}
                classStudents={[{ id: 'student1', name: 'Jane' }]}
                initialValues={{ title: 'Essay', minWords: 500, maxWords: 100 }}
            />
        );
        expect(screen.getByText('essays.error_min_exceeds_max')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'essays.assign_to_students' })).toBeDisabled();
        expect(screen.getByRole('button', { name: /essay_assignment.copy_link/ })).toBeDisabled();
    });
});
