import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, DocumentAnalysisResult, Rubric, Student } from '../../types';

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockStudents: Student[] = [
    { id: 's1', name: 'Alice', classId: 'c1' },
    { id: 's2', name: 'Bob', classId: 'c1' },
];

const mockClasses: Class[] = [{ id: 'c1', name: 'Class A' }];

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
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
    vocabularyItems: [
        { id: 'v1', phrase: 'phenomenon', category: 'vocabulary', cefrLevel: 'C1', definition: 'an event' },
    ],
};

const ADVANCED_TEXT =
    'The phenomenon of globalisation has fundamentally transformed contemporary economic structures. ' +
    'Significant disparities in wealth distribution persist despite unprecedented technological advancement.';

const mockAnalysisResults: DocumentAnalysisResult[] = [
    {
        id: 'a1',
        studentId: 's1',
        rubricId: 'r1',
        attachmentId: 'att1',
        extractedText: ADVANCED_TEXT,
        analyzedAt: '2024-01-01T00:00:00Z',
        detectedItems: [],
        grammarErrors: [],
        grammarCheckerUsed: 'none',
    },
];

vi.mock('../../context/AppContext', () => ({
    useApp: () => ({
        rubrics: [mockRubric],
        students: mockStudents,
        classes: mockClasses,
        studentRubrics: [],
        settings: mockSettings,
        analysisResults: mockAnalysisResults,
        updateSettings: vi.fn(),
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

describe('VocabularyDashboardPage', () => {
    it('renders without crashing showing class distribution', async () => {
        const { default: VocabularyDashboardPage } = await import('../VocabularyDashboardPage');
        render(
            <MemoryRouter>
                <VocabularyDashboardPage />
            </MemoryRouter>
        );
        expect(screen.getByText('vocabProfile.page_title')).toBeInTheDocument();
        expect(screen.getByText('vocabProfile.class_distribution_title')).toBeInTheDocument();
    });

    it('shows the student drill-down when a class is selected', async () => {
        const { default: VocabularyDashboardPage } = await import('../VocabularyDashboardPage');
        render(
            <MemoryRouter>
                <VocabularyDashboardPage />
            </MemoryRouter>
        );
        const select = screen.getByLabelText('vocabProfile.label_class_filter');
        const { fireEvent } = await import('@testing-library/react');
        fireEvent.change(select, { target: { value: 'c1' } });
        expect(screen.getByText('vocabProfile.student_drilldown_title')).toBeInTheDocument();
        expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
    });

    it('renders export button', async () => {
        const { default: VocabularyDashboardPage } = await import('../VocabularyDashboardPage');
        render(
            <MemoryRouter>
                <VocabularyDashboardPage />
            </MemoryRouter>
        );
        expect(screen.getByText('vocabProfile.export_csv')).toBeInTheDocument();
    });
});
