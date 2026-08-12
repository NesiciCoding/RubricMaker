import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, GradeScale, Test as RmTest, QuestionBankItem } from '../../types';

function renderBuilder(TestBuilderPage: React.ComponentType, route = '/tests/new') {
    const router = createMemoryRouter(
        [
            { path: '/tests/new', element: <TestBuilderPage /> },
            { path: '/tests/:id', element: <TestBuilderPage /> },
        ],
        { initialEntries: [route] }
    );
    return { router, ...render(<RouterProvider router={router} />) };
}

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 0, max: 100, label: 'A', color: '#22c55e' }],
};

const mockExistingTest: RmTest = {
    id: 't1',
    name: 'Existing Test',
    description: 'desc',
    questions: [],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2024-01-01T00:00:00Z',
};

const mockAddTest = vi.fn((t: Omit<RmTest, 'id' | 'createdAt' | 'updatedAt'>) => ({
    ...t,
    id: 'new-test',
    createdAt: '2024-01-02T00:00:00Z',
}));
const mockUpdateTest = vi.fn();
const mockDeleteTest = vi.fn();
const mockShowToast = vi.fn();
const noop = vi.fn();

let mockTests: RmTest[] = [];
let mockQuestionBank: QuestionBankItem[] = [];

const mockUseApp = {
    get tests() {
        return mockTests;
    },
    students: [],
    classes: [],
    gradeScales: [mockGradeScale],
    studentRubrics: [],
    settings: mockSettings,
    addTest: mockAddTest,
    updateTest: mockUpdateTest,
    deleteTest: mockDeleteTest,
    updateSettings: noop,
    get questionBank() {
        return mockQuestionBank;
    },
    addSectionBankItem: noop,
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockUseApp,
    useRoster: () => mockUseApp,
    useStudents: () => mockUseApp,
    useClasses: () => mockUseApp,
    useGrading: () => mockUseApp,
    useAuthoring: () => mockUseApp,
    useAssessment: () => mockUseApp,
    useEssays: () => mockUseApp,
    useFlashcards: () => mockUseApp,
    useSettings: () => mockUseApp,
    usePlatform: () => mockUseApp,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => {
            if (params) return `${key}:${JSON.stringify(params)}`;
            return key;
        },
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
}));

vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: mockShowToast }) }));

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: false, status: 'idle', lastSyncAt: null, userId: null, currentUser: null }),
}));

vi.mock('../../services/database', () => ({
    loadSupabaseConfig: vi.fn(() => null),
}));

vi.mock('../../components/Standards/StandardsPickerModal', () => ({
    default: () => null,
}));

vi.mock('../../components/CEFR/CefrPickerModal', () => ({
    default: () => null,
}));

// Replace TipTap-heavy editor with a plain textarea (same pattern as StudentEssayPage.test.tsx)
vi.mock('../../components/Editor/EssayEditor', () => ({
    default: ({
        content,
        onChange,
        placeholder,
    }: {
        content: string;
        onChange: (html: string) => void;
        placeholder?: string;
    }) => (
        <textarea
            aria-label={placeholder || 'tests.question_prompt_label'}
            placeholder={placeholder}
            value={content}
            onChange={(e) => onChange(e.target.value)}
        />
    ),
}));

const mockBankItem: QuestionBankItem = {
    id: 'bank-1',
    kind: 'question',
    cefrLevel: 'B1',
    question: {
        id: 'q-bank-1',
        prompt: 'Bank question prompt',
        type: 'multiple-choice',
        points: 5,
        options: [
            { id: 'opt-a', text: 'A', isCorrect: false },
            { id: 'opt-b', text: 'B', isCorrect: true },
        ],
    },
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
};

describe('TestBuilderPage', () => {
    beforeEach(() => {
        mockTests = [];
        mockQuestionBank = [];
        mockAddTest.mockClear();
        mockUpdateTest.mockClear();
        mockShowToast.mockClear();
    });

    it('configures a generator-engine placement test: range, question counts, skills, and starter item', async () => {
        mockQuestionBank = [mockBankItem];
        const { default: TestBuilderPage } = await import('../TestBuilderPage');
        renderBuilder(TestBuilderPage);

        fireEvent.change(screen.getByLabelText('tests.name_label'), { target: { value: 'Generator Test' } });
        fireEvent.change(screen.getByLabelText('tests.mode_label'), { target: { value: 'placement' } });
        fireEvent.change(screen.getByLabelText('tests.placement_engine_label'), { target: { value: 'generator' } });

        fireEvent.change(screen.getByLabelText('tests.generator_min_level_label'), { target: { value: 'B1' } });
        fireEvent.change(screen.getByLabelText('tests.generator_max_level_label'), { target: { value: 'C1' } });

        // Raising min above the current max should pull max up with it.
        fireEvent.change(screen.getByLabelText('tests.generator_min_questions_label'), { target: { value: '15' } });
        expect(screen.getByLabelText('tests.generator_max_questions_label')).toHaveValue(15);

        fireEvent.change(screen.getByLabelText('tests.generator_max_questions_label'), { target: { value: '20' } });
        expect(screen.getByLabelText('tests.generator_max_questions_label')).toHaveValue(20);

        const skillCheckboxes = screen
            .getAllByRole('checkbox')
            .filter((el) => el.closest('.form-group')?.textContent?.includes('tests.generator_skills_label'));
        expect(skillCheckboxes.length).toBeGreaterThan(0);
        fireEvent.click(skillCheckboxes[0]);
        fireEvent.click(skillCheckboxes[0]);

        expect(screen.getByText('tests.generator_starter_item_none')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /tests.generator_pick_starter_button/ }));
        fireEvent.click(screen.getByText('Bank question prompt'));

        expect(screen.getByText('Bank question prompt')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'common.clear' }));
        expect(screen.getByText('tests.generator_starter_item_none')).toBeInTheDocument();

        fireEvent.click(screen.getByText('common.save'));

        expect(mockAddTest).toHaveBeenCalledTimes(1);
        const payload = mockAddTest.mock.calls[0][0];
        expect(payload.placementEngine).toBe('generator');
        expect(payload.generatorConfig).toMatchObject({
            minCefrLevel: 'B1',
            maxCefrLevel: 'C1',
            minQuestions: 15,
            maxQuestions: 20,
        });
    });

    it('creates a new test, adds a multiple-choice question, marks an option correct, and saves', async () => {
        const { default: TestBuilderPage } = await import('../TestBuilderPage');
        renderBuilder(TestBuilderPage);

        fireEvent.change(screen.getByLabelText('tests.name_label'), { target: { value: 'My New Test' } });

        fireEvent.click(screen.getAllByText(/tests.add_question/)[0]);

        const promptInputs = screen.getAllByLabelText('tests.question_prompt_label');
        fireEvent.change(promptInputs[0], { target: { value: 'What is the capital of France?' } });

        const correctButtons = screen.getAllByLabelText('tests.mark_correct_option');
        expect(correctButtons.length).toBeGreaterThanOrEqual(2);
        fireEvent.click(correctButtons[1]);

        fireEvent.click(screen.getByText('common.save'));

        expect(mockAddTest).toHaveBeenCalledTimes(1);
        const payload = mockAddTest.mock.calls[0][0];
        expect(payload.name).toBe('My New Test');
        expect(payload.questions).toHaveLength(1);
        expect(payload.questions[0].prompt).toBe('What is the capital of France?');
        expect(payload.questions[0].options?.[1].isCorrect).toBe(true);
        expect(payload.questions[0].options?.[0].isCorrect).toBe(false);
    });

    it('does not show the unsaved-changes prompt after saving a new test (redirect)', async () => {
        const { default: TestBuilderPage } = await import('../TestBuilderPage');
        const { router } = renderBuilder(TestBuilderPage);

        fireEvent.change(screen.getByLabelText('tests.name_label'), { target: { value: 'Draft' } });
        fireEvent.click(screen.getByText('common.save'));

        expect(mockAddTest).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(router.state.location.pathname).not.toBe('/tests/new'));
        expect(screen.queryByText('common.unsaved_title')).not.toBeInTheDocument();
    });

    it('shows a validation error when saving without a name', async () => {
        const { default: TestBuilderPage } = await import('../TestBuilderPage');
        renderBuilder(TestBuilderPage);

        fireEvent.click(screen.getByText('common.save'));

        expect(mockAddTest).not.toHaveBeenCalled();
        expect(screen.getByText('tests.name_required')).toBeInTheDocument();
    });

    it('loads an existing test and saves via updateTest', async () => {
        mockTests = [mockExistingTest];
        const { default: TestBuilderPage } = await import('../TestBuilderPage');
        renderBuilder(TestBuilderPage, '/tests/t1');

        expect(screen.getByDisplayValue('Existing Test')).toBeInTheDocument();

        fireEvent.click(screen.getByText('common.save'));

        expect(mockUpdateTest).toHaveBeenCalledTimes(1);
        const payload = mockUpdateTest.mock.calls[0][0];
        expect(payload.id).toBe('t1');
        expect(payload.name).toBe('Existing Test');
    });
});
