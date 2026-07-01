import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, Rubric, Student } from '../../types';

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
};

// Rubric with a cefrTargetLevel so that the page fetches descriptors from static data.
const mockCefrRubric: Rubric = {
    ...mockRubric,
    id: 'r2',
    name: 'CEFR Rubric',
    cefrTargetLevel: 'B1',
    cefrSkill: 'writing',
};

// Rubric with explicit cefrDescriptors on a criterion.
const mockRubricWithDescriptors: Rubric = {
    ...mockRubric,
    id: 'r3',
    name: 'Descriptor Rubric',
    criteria: [
        {
            id: 'c1',
            title: 'Writing',
            description: '',
            weight: 100,
            levels: [],
            cefrDescriptors: [
                {
                    descriptorId: 'd1',
                    level: 'B1',
                    skill: 'writing',
                    descriptionEn: 'Can write simple connected text',
                    descriptionNl: 'Kan eenvoudige teksten schrijven',
                },
            ],
        },
    ],
};

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockSaveSelfAssessment = vi.fn();
const mockNavigate = vi.fn();

const mockStudentsArr = [mockStudent];
const mockClassesArr = [mockClass];
const emptyArr: never[] = [];

const mockAppValue = {
    rubrics: [mockRubric, mockCefrRubric, mockRubricWithDescriptors],
    students: mockStudentsArr,
    classes: mockClassesArr,
    studentRubrics: emptyArr,
    settings: mockSettings,
    selfAssessments: emptyArr,
    saveSelfAssessment: mockSaveSelfAssessment,
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

let SelfAssessPageComp: React.ComponentType;

function renderAt(rubricId: string, studentId: string) {
    const router = createMemoryRouter(
        [{ path: '/rubrics/:rubricId/self-assess/:studentId', element: <SelfAssessPageComp /> }],
        { initialEntries: [`/rubrics/${rubricId}/self-assess/${studentId}`] }
    );
    return render(<RouterProvider router={router} />);
}

describe('SelfAssessPage', () => {
    beforeEach(async () => {
        mockSaveSelfAssessment.mockClear();
        mockNavigate.mockClear();
        const mod = await import('../SelfAssessPage');
        SelfAssessPageComp = mod.default;
    });

    it('shows not-found when rubric or student is missing', () => {
        renderAt('bad-id', 's1');
        expect(screen.getByText('gradeStudent.error_not_found')).toBeInTheDocument();
    });

    it('shows the no-descriptors state when the rubric has no CEFR links', () => {
        renderAt('r1', 's1');
        expect(screen.getByText('selfAssess.no_descriptors')).toBeInTheDocument();
    });

    it('renders CEFR descriptors from explicit criterion links', () => {
        renderAt('r3', 's1');
        expect(screen.getByText('Can write simple connected text')).toBeInTheDocument();
    });

    it('renders CEFR descriptors via cefrTargetLevel fallback', () => {
        renderAt('r2', 's1');
        // The page fetches from getCefrDescriptors() — at least one descriptor should render.
        expect(screen.getByText('selfAssess.title')).toBeInTheDocument();
        // Confidence buttons render their string fallback (t() mock returns 2nd arg when it's a string).
        expect(screen.getAllByText('Not yet').length).toBeGreaterThan(0);
    });

    it('saves a self-assessment after rating a descriptor', () => {
        renderAt('r3', 's1');
        // Click the "Usually" confidence button for the first descriptor.
        fireEvent.click(screen.getAllByText('Usually')[0]);
        // Save button uses t('gradeStudent.action_save') with no fallback → key is returned.
        fireEvent.click(screen.getByText('gradeStudent.action_save'));
        expect(mockSaveSelfAssessment).toHaveBeenCalledWith(
            expect.objectContaining({ rubricId: 'r3', studentId: 's1' })
        );
    });
});
