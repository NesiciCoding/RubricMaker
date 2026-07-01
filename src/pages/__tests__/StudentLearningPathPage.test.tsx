import React from 'react';
import { screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, Student } from '../../types';

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockClasses: Class[] = [{ id: 'c1', name: 'Class A' }];
const mockStudents: Student[] = [{ id: 's1', name: 'Alice', classId: 'c1' }];

const mockNavigate = vi.fn();
let routeParams: Record<string, string | undefined> = { id: 's1' };

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate, useParams: () => routeParams };
});

vi.mock('../../context/AppContext', () => ({
    useApp: () => ({
        students: mockStudents,
        classes: mockClasses,
        rubrics: [],
        studentRubrics: [],
        selfAssessments: [],
        analysisResults: [],
        settings: mockSettings,
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

describe('StudentLearningPathPage', () => {
    beforeEach(() => {
        routeParams = { id: 's1' };
        mockNavigate.mockClear();
    });

    it('shows the not-found state for an unknown student id', async () => {
        routeParams = { id: 'missing' };
        const { default: StudentLearningPathPage } = await import('../StudentLearningPathPage');
        renderWithRouter(<StudentLearningPathPage />);
        expect(screen.getByText('learningPath.student_not_found')).toBeInTheDocument();
    });

    it('renders the path view for a known student with no data, showing empty states', async () => {
        const { default: StudentLearningPathPage } = await import('../StudentLearningPathPage');
        renderWithRouter(<StudentLearningPathPage />);
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getAllByText('Class A').length).toBeGreaterThan(0);
        expect(screen.getByText('learningPath.recommendations_empty')).toBeInTheDocument();
        expect(screen.getByText('learningPath.interventions_empty')).toBeInTheDocument();
    });
});
