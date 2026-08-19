import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, Rubric, SelfAssessment, Student } from '../../types';

const baseRubric: Rubric = {
    id: 'r0',
    name: 'Base',
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

// No CEFR links at all → the no-descriptors state.
const mockPlainRubric: Rubric = { ...baseRubric, id: 'r1', name: 'Plain Rubric' };

// Rubric with a duplicated descriptor (two criteria sharing d1 → dedup) plus a bare criterion
// without a cefrDescriptors property (exercises the `?? []` arm).
const mockDedupRubric: Rubric = {
    ...baseRubric,
    id: 'r3',
    name: 'Dedup Rubric',
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
        {
            id: 'c2',
            title: 'Writing (duplicate)',
            description: '',
            weight: 0,
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
        { id: 'c3', title: 'Bare', description: '', weight: 0, levels: [] },
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

let mockLanguage = 'en';
// Mutated in place so the module-level mock sees updates.
const mockSelfAssessments: SelfAssessment[] = [];

const mockAppValue = {
    rubrics: [mockPlainRubric, mockDedupRubric],
    students: [mockStudent],
    classes: [mockClass],
    studentRubrics: [],
    settings: mockSettings,
    selfAssessments: mockSelfAssessments,
    saveSelfAssessment: mockSaveSelfAssessment,
};

vi.mock('../../context/AppContext', () => ({
    useRoster: () => mockAppValue,
    useStudents: () => mockAppValue,
    useClasses: () => mockAppValue,
    useGrading: () => mockAppValue,
    useAuthoring: () => mockAppValue,
    useAssessment: () => mockAppValue,
    useEssays: () => mockAppValue,
    useFlashcards: () => mockAppValue,
    useSettings: () => mockAppValue,
    usePlatform: () => mockAppValue,
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
        i18n: { language: mockLanguage },
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

function setSelfAssessments(items: SelfAssessment[]) {
    mockSelfAssessments.length = 0;
    mockSelfAssessments.push(...items);
}

describe('SelfAssessPage coverage', () => {
    beforeEach(async () => {
        mockSaveSelfAssessment.mockClear();
        mockNavigate.mockClear();
        mockLanguage = 'en';
        setSelfAssessments([]);
        const mod = await import('../SelfAssessPage');
        SelfAssessPageComp = mod.default;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('dedupes shared descriptors and tolerates bare criteria', () => {
        renderAt('r3', 's1');
        // d1 appears once despite being linked from two criteria.
        expect(screen.getAllByText('Can write simple connected text')).toHaveLength(1);
        expect(screen.getByText('Writing')).toBeInTheDocument();
        expect(screen.getByText('0/1')).toBeInTheDocument();
    });

    it('loads existing ratings, including legacy confident flags', () => {
        setSelfAssessments([
            // rubricId mismatch → first && operand false.
            { id: 'saX', rubricId: 'other', studentId: 's1', ratings: [], submittedAt: '2024-01-01T00:00:00Z' },
            // rubricId matches but studentId does not → second && operand false.
            { id: 'saY', rubricId: 'r3', studentId: 's2', ratings: [], submittedAt: '2024-01-01T00:00:00Z' },
            {
                id: 'sa1',
                rubricId: 'r3',
                studentId: 's1',
                ratings: [
                    { descriptorId: 'd1', level: 'B1', skill: 'writing', confident: false, confidenceLevel: 2 },
                    { descriptorId: 'd2', level: 'B1', skill: 'writing', confident: true },
                    // Neither field set → the `else if (r.confident)` false arm.
                    { descriptorId: 'd3', level: 'B1', skill: 'writing', confident: false },
                ],
                submittedAt: '2024-01-01T00:00:00Z',
            },
        ]);
        renderAt('r3', 's1');
        // d1 → confidenceLevel 2 ("Sometimes" selected). d2 → legacy confident → 3,
        // which lands in the confidence map even though no d2 descriptor card exists.
        expect(screen.getByText('Sometimes').closest('button')?.style.background).toBe('rgb(245, 158, 11)');
        // ratedCount = confidence.size (2) over 1 descriptor → proves the legacy arm ran.
        expect(screen.getByText('2/1')).toBeInTheDocument();
    });

    it('restores the saved reflection when an existing assessment is found', () => {
        setSelfAssessments([
            {
                id: 'sa1',
                rubricId: 'r3',
                studentId: 's1',
                ratings: [],
                reflection: 'My reflection',
                submittedAt: '2024-01-01T00:00:00Z',
            },
        ]);
        renderAt('r3', 's1');
        expect(screen.getByPlaceholderText('selfAssess.reflection_placeholder')).toHaveValue('My reflection');
    });

    it('renders Dutch descriptions and skill labels', () => {
        mockLanguage = 'nl';
        renderAt('r3', 's1');
        expect(screen.getByText('Kan eenvoudige teksten schrijven')).toBeInTheDocument();
        expect(screen.getByText('Schrijven')).toBeInTheDocument();
    });

    it('deselects a confidence level when re-clicked', () => {
        renderAt('r3', 's1');
        expect(screen.getByText('0/1')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Not yet'));
        expect(screen.getByText('1/1')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Not yet'));
        expect(screen.getByText('0/1')).toBeInTheDocument();
    });

    it('saves ratings and reverts the saved state after 2.5s', () => {
        vi.useFakeTimers();
        renderAt('r3', 's1');
        fireEvent.click(screen.getByText('Usually'));
        fireEvent.click(screen.getByText('gradeStudent.action_save'));
        expect(mockSaveSelfAssessment).toHaveBeenCalledWith(
            expect.objectContaining({
                rubricId: 'r3',
                studentId: 's1',
                ratings: [{ descriptorId: 'd1', level: 'B1', skill: 'writing', confident: true, confidenceLevel: 3 }],
                reflection: undefined,
            })
        );
        expect(screen.getAllByText('gradeStudent.action_saved')).toHaveLength(2);
        act(() => {
            vi.advanceTimersByTime(2500);
        });
        expect(screen.getByText('gradeStudent.action_save')).toBeInTheDocument();
    });

    it('navigates back from the not-found state', () => {
        renderAt('bad-id', 's1');
        fireEvent.click(screen.getByText('gradeStudent.action_back'));
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('navigates back from the no-descriptors state', () => {
        renderAt('r1', 's1');
        fireEvent.click(screen.getByText('gradeStudent.action_back'));
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('navigates back from the main view', () => {
        renderAt('r3', 's1');
        fireEvent.click(screen.getByText('gradeStudent.action_back'));
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('updates the reflection and saves it trimmed', () => {
        renderAt('r3', 's1');
        fireEvent.change(screen.getByPlaceholderText('selfAssess.reflection_placeholder'), {
            target: { value: '  Reflecting...  ' },
        });
        expect(screen.getByPlaceholderText('selfAssess.reflection_placeholder')).toHaveValue('  Reflecting...  ');
        fireEvent.click(screen.getByText('selfAssess.action_submit'));
        expect(mockSaveSelfAssessment).toHaveBeenCalledWith(expect.objectContaining({ reflection: 'Reflecting...' }));
    });
});
