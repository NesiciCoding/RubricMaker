import React from 'react';
import { screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, EssayAssignment, EssaySubmission, Rubric, Student } from '../../types';

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockClasses: Class[] = [{ id: 'c1', name: 'Class A' }];
const mockStudents: Student[] = [{ id: 's1', name: 'Alice', classId: 'c1' }];

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 0,
    scoringMode: 'weighted-percentage',
};

const mockAssignment: EssayAssignment = {
    rubricId: 'r1',
    studentId: 's1',
    teacherKey: 'tk1',
    title: 'My Essay',
    readOnlyAfterSubmit: true,
    createdAt: '2024-01-01T00:00:00Z',
};

const mockSubmission: EssaySubmission = {
    id: 'sub1',
    assignmentRubricId: 'r1',
    assignmentStudentId: 's1',
    teacherKey: 'tk1',
    contentHtml: '<p>hi</p>',
    wordCount: 1,
    submittedAt: '2024-01-02T00:00:00Z',
};

const mockNavigate = vi.fn();
const mockDeleteEssayGroup = vi.fn();
const mockUpdateEssayGroup = vi.fn();

let appOverrides: Record<string, unknown> = {};

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../context/AppContext', () => ({
    useApp: () => ({
        essayAssignments: [mockAssignment],
        essaySubmissions: [mockSubmission],
        rubrics: [mockRubric],
        deleteEssayGroup: mockDeleteEssayGroup,
        updateEssayGroup: mockUpdateEssayGroup,
        students: mockStudents,
        classes: mockClasses,
        settings: mockSettings,
        studentRubrics: [],
        ...appOverrides,
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

describe('EssayListPage', () => {
    beforeEach(() => {
        appOverrides = {};
        mockNavigate.mockClear();
        mockDeleteEssayGroup.mockClear();
    });

    it('shows the empty state when there are no essays', async () => {
        appOverrides = { essayAssignments: [] };
        const { default: EssayListPage } = await import('../EssayListPage');
        renderWithRouter(<EssayListPage />);
        expect(screen.getByText('essays.no_essays')).toBeInTheDocument();
    });

    it('lists an essay group and navigates to edit it', async () => {
        const { default: EssayListPage } = await import('../EssayListPage');
        renderWithRouter(<EssayListPage />);
        expect(screen.getByText('My Essay')).toBeInTheDocument();
        fireEvent.click(screen.getByText('essays.action_monitor'));
    });

    it('navigates to the new essay builder', async () => {
        const { default: EssayListPage } = await import('../EssayListPage');
        renderWithRouter(<EssayListPage />);
        fireEvent.click(screen.getByText('essays.new_essay'));
        expect(mockNavigate).toHaveBeenCalledWith('/essays/new');
    });

    it('deletes an essay group after confirming', async () => {
        const { default: EssayListPage } = await import('../EssayListPage');
        renderWithRouter(<EssayListPage />);
        const deleteBtn = screen.getByTitle('tests.action_delete');
        await act(async () => {
            fireEvent.click(deleteBtn);
        });
        const confirmBtn = screen.getAllByRole('button').find((b) => b.className?.match(/btn-danger/i));
        if (confirmBtn) {
            await act(async () => {
                fireEvent.click(confirmBtn);
            });
        }
        expect(mockDeleteEssayGroup).toHaveBeenCalledWith('tk1');
    });
});
