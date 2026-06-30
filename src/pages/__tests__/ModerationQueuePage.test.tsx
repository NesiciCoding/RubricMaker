import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Rubric, Student, StudentRubric } from '../../types';

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

const mockSaveStudentRubric = vi.fn();
const mockDeletePeerReview = vi.fn();
const mockFetchSchoolMembers = vi.fn().mockResolvedValue([]);

let appOverrides: Record<string, unknown> = {};

vi.mock('../../context/AppContext', () => ({
    useApp: () => ({
        rubrics: [mockRubric],
        studentRubrics: [baseline],
        peerReviews: [secondMarker],
        students: mockStudents,
        settings: mockSettings,
        saveStudentRubric: mockSaveStudentRubric,
        deletePeerReview: mockDeletePeerReview,
        fetchSchoolMembers: mockFetchSchoolMembers,
        ...appOverrides,
    }),
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
        mockDeletePeerReview.mockClear();
    });

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
        expect(mockDeletePeerReview).toHaveBeenCalledWith('sr-second');
    });

    it('reconciles a queue item', async () => {
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        renderWithRouter(<ModerationQueuePage />);
        fireEvent.click(screen.getByText('coGrading.action_reconcile'));
        expect(mockSaveStudentRubric).toHaveBeenCalled();
        expect(mockDeletePeerReview).toHaveBeenCalledWith('sr-second');
    });

    it('updates the threshold input', async () => {
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        renderWithRouter(<ModerationQueuePage />);
        const input = screen.getByLabelText('coGrading.threshold_label');
        fireEvent.change(input, { target: { value: '5' } });
        expect(input).toHaveValue(5);
    });
});
