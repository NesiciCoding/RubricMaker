import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import EssayAssignmentModal from '../EssayAssignmentModal';

let mockDbConnected = false;
vi.mock('../../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: mockDbConnected }),
}));

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

describe('EssayAssignmentModal header scope (#697)', () => {
    const baseProps = {
        rubricId: 'rubric1',
        rubricName: 'Writing Test',
        studentId: 'student1',
        studentName: 'Jane',
        onClose: () => {},
        onOpenSlipSheet: () => {},
    };

    it('names the whole class when every student is being assigned', () => {
        render(
            <EssayAssignmentModal
                {...baseProps}
                assignmentScope="class"
                classStudents={[
                    { id: 'student1', name: 'Jane' },
                    { id: 'student2', name: 'Ahmed' },
                ]}
            />
        );
        // Naming the first student in the class read as if only they were being assigned.
        expect(screen.getByRole('heading', { name: 'essay_assignment.modal_title_class' })).toBeInTheDocument();
    });

    it('names the single student for a one-student assignment', () => {
        render(<EssayAssignmentModal {...baseProps} classStudents={[{ id: 'student1', name: 'Jane' }]} />);
        expect(screen.getByRole('heading', { name: 'essay_assignment.modal_title' })).toBeInTheDocument();
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
        expect(screen.getByLabelText('essay_assignment.essay_link_label')).toHaveValue('');
    });

    it('saves the DB-mode assignment once invalid limits are corrected', async () => {
        mockDbConnected = true;
        try {
            const onSaveAssignment = vi.fn().mockResolvedValue(undefined);
            render(
                <EssayAssignmentModal
                    rubricId="rubric1"
                    rubricName="Writing Test"
                    studentId="student1"
                    studentName="Jane"
                    onClose={() => {}}
                    onOpenSlipSheet={() => {}}
                    onSaveAssignment={onSaveAssignment}
                    classStudents={[{ id: 'student1', name: 'Jane' }]}
                    initialValues={{ title: 'Essay', minWords: 500, maxWords: 100 }}
                />
            );
            expect(onSaveAssignment).not.toHaveBeenCalled();
            fireEvent.change(screen.getByLabelText(/min_words_label/), { target: { value: '50' } });
            await waitFor(() => expect(onSaveAssignment).toHaveBeenCalledTimes(1));
            expect(onSaveAssignment.mock.calls[0][0]).toMatchObject({ minWords: 50, maxWords: 100 });
        } finally {
            mockDbConnected = false;
        }
    });
});
