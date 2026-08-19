import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, GradeScale, Test as RmTest, QuestionBankItem, TestQuestion, TestSection } from '../../types';

// ---- Hoisted mocks ----
const dndState = vi.hoisted(() => ({ onDragEnd: null as null | ((r: unknown) => void) }));
const mockLangState = vi.hoisted(() => ({ value: 'en' }));
const joyrideState = vi.hoisted(() => ({ onEvent: null as null | ((d: { status: string }) => void) }));

vi.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({ onDragEnd, children }: { onDragEnd: (r: unknown) => void; children: React.ReactNode }) => {
        dndState.onDragEnd = onDragEnd;
        return React.createElement(React.Fragment, null, children);
    },
    Droppable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
        React.createElement(
            React.Fragment,
            null,
            children({ innerRef: { current: null }, droppableProps: {}, placeholder: null })
        ),
    Draggable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
        React.createElement(
            React.Fragment,
            null,
            children({ innerRef: { current: null }, draggableProps: {}, dragHandleProps: {} })
        ),
}));

vi.mock('react-joyride', () => {
    const STATUS = { FINISHED: 'finished', SKIPPED: 'skipped', RUNNING: 'running' };
    return {
        STATUS,
        Joyride: ({ onEvent }: { onEvent: (d: { status: string }) => void }) => {
            joyrideState.onEvent = onEvent;
            return React.createElement('div', { 'data-testid': 'joyride-mock' });
        },
    };
});

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

const mockAddTest = vi.fn((t: Omit<RmTest, 'id' | 'createdAt' | 'updatedAt'>) => ({
    ...t,
    id: 'new-test',
    createdAt: '2024-01-02T00:00:00Z',
}));
const mockUpdateTest = vi.fn();
const mockShowToast = vi.fn();
const mockAddSectionBankItem = vi.fn();
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
    deleteTest: vi.fn(),
    updateSettings: noop,
    get questionBank() {
        return mockQuestionBank;
    },
    addSectionBankItem: mockAddSectionBankItem,
};

vi.mock('../../context/AppContext', () => ({
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
        i18n: {
            get language() {
                return mockLangState.value;
            },
            changeLanguage: vi.fn(),
        },
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

let TestBuilderPageComp: React.ComponentType;

function renderBuilder(route = '/tests/new', state?: Record<string, unknown>) {
    const initialEntries = state ? [{ pathname: route, state }] : [route];
    const router = createMemoryRouter(
        [
            { path: '/tests/new', element: <TestBuilderPageComp /> },
            { path: '/tests/:id', element: <TestBuilderPageComp /> },
            { path: '/tests', element: <div /> },
            { path: '*', element: <div /> },
        ],
        { initialEntries }
    );
    return { router, ...render(<RouterProvider router={router} />) };
}

const sectionItem: QuestionBankItem = {
    id: 'bank-section',
    kind: 'section',
    cefrLevel: 'B1',
    section: {
        title: 'Bank Passage',
        content: '<p>Passage</p>',
        questions: [
            {
                id: 'qs1',
                prompt: 'Section question',
                type: 'multiple-choice',
                points: 1,
                options: [
                    { id: 'o1', text: 'A', isCorrect: true },
                    { id: 'o2', text: 'B', isCorrect: false },
                ],
            },
        ],
    },
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
};

const questionItem: QuestionBankItem = {
    id: 'bank-question',
    kind: 'question',
    cefrLevel: 'A1',
    // invalid skill probes the bank filter fallback; CefrSkill is a closed union
    cefrSkill: 'reading_production' as QuestionBankItem['cefrSkill'],
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

const nonAutoItem: QuestionBankItem = {
    id: 'bank-open',
    kind: 'question',
    cefrLevel: 'C2',
    question: {
        id: 'q-bank-open',
        prompt: 'Open question',
        type: 'open',
        points: 3,
    },
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
};

const s1: TestSection = { id: 's1', title: 'Reading' };
const s2: TestSection = { id: 's2', title: 'Listening' };

const q1: TestQuestion = {
    id: 'qq1',
    prompt: 'Question one',
    type: 'multiple-choice',
    points: 2,
    options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: false },
    ],
};
const q2: TestQuestion = {
    id: 'qq2',
    prompt: 'Question two',
    type: 'multiple-choice',
    points: 3,
    options: [
        { id: 'c', text: 'C', isCorrect: true },
        { id: 'd', text: 'D', isCorrect: false },
    ],
};

describe('TestBuilderPage extended', () => {
    beforeEach(async () => {
        mockTests = [];
        mockQuestionBank = [];
        mockAddTest.mockClear();
        mockUpdateTest.mockClear();
        mockShowToast.mockClear();
        mockAddSectionBankItem.mockClear();
        dndState.onDragEnd = null;
        joyrideState.onEvent = null;
        mockLangState.value = 'en';
        const mod = await import('../TestBuilderPage');
        TestBuilderPageComp = mod.default;
    });

    it('shows the not-found state for an unknown test id', () => {
        renderBuilder('/tests/missing');
        expect(screen.getByText('tests.not_found')).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.back_to_list'));
    });

    it('expands generated passages and toasts generator shortfalls', () => {
        renderBuilder('/tests/new', {
            generated: {
                name: 'Generated',
                sections: [{ id: 'gs1', title: 'Gen Section', content: '<p>Body</p>' }],
                questions: [q1],
            },
            generatedShortfalls: ['Missing A2 items', 'Missing B1 items'],
        });
        expect(mockShowToast).toHaveBeenCalledWith('Missing A2 items Missing B1 items', 'info');
        // The generated passage section is expanded, so its editor renders.
        expect(screen.getByLabelText('tests.section_passage_placeholder')).toBeInTheDocument();
    });

    it('renders generator pool warnings from mixed bank items', () => {
        mockQuestionBank = [sectionItem, questionItem, nonAutoItem];
        renderBuilder();
        fireEvent.change(screen.getByLabelText('tests.mode_label'), { target: { value: 'placement' } });
        fireEvent.change(screen.getByLabelText('tests.placement_engine_label'), { target: { value: 'generator' } });
        // A1 has 1 autoscore (questionItem), B1 has 1 (sectionItem counts its section question),
        // C2 has 0 (non-auto open question) — all below MIN_QUESTIONS_PER_LEVEL (3).
        expect(screen.getAllByText(/tests.generator_pool_warning/).length).toBeGreaterThan(0);
    });

    it('labels a section-kind starter item with its title', () => {
        mockQuestionBank = [sectionItem];
        renderBuilder();
        fireEvent.change(screen.getByLabelText('tests.mode_label'), { target: { value: 'placement' } });
        fireEvent.change(screen.getByLabelText('tests.placement_engine_label'), { target: { value: 'generator' } });
        fireEvent.click(screen.getByRole('button', { name: /tests.generator_pick_starter_button/ }));
        fireEvent.click(screen.getByText('questionBank.section_bundle_title:{"title":"Bank Passage"}'));
        // The modal closes and the starter label resolves to the section title.
        expect(screen.getByText('Bank Passage')).toBeInTheDocument();
        expect(screen.queryByText('questionBank.insert_title')).not.toBeInTheDocument();
    });

    it('manages sections: add, rename, collapse, remove with routing cleanup', () => {
        const routingTest: RmTest = {
            id: 't1',
            name: 'Existing',
            questions: [
                { ...q1, sectionId: 's1' },
                { ...q1, id: 'q2', prompt: 'Question two', sectionId: 's2' },
            ],
            sections: [{ ...s1, routing: { thresholdPct: 60, passSectionId: 's2', failSectionId: 's2' } }, s2],
            requireSEB: false,
            shuffleQuestions: false,
            createdAt: '2024-01-01T00:00:00Z',
        };
        mockTests = [routingTest];
        renderBuilder('/tests/t1');

        // add a section via the input + Enter
        fireEvent.change(screen.getByPlaceholderText('tests.new_section_placeholder'), {
            target: { value: 'New Section' },
        });
        fireEvent.keyDown(screen.getByPlaceholderText('tests.new_section_placeholder'), { key: 'Enter' });
        expect(screen.getAllByLabelText('tests.section_name_label').length).toBe(3);

        // rename the first section
        fireEvent.change(screen.getAllByLabelText('tests.section_name_label')[0], {
            target: { value: 'Renamed Reading' },
        });
        expect(screen.getAllByDisplayValue('Renamed Reading').length).toBeGreaterThan(0);

        // collapse/expand the section header in the questions panel
        fireEvent.click(screen.getAllByText('Renamed Reading')[0]);
        fireEvent.click(screen.getAllByText('Renamed Reading')[0]);

        // remove the routing-referenced section (s2): the remaining section's routing is cleaned
        const removeButtons = screen.getAllByLabelText('tests.remove_section');
        fireEvent.click(removeButtons[1]);
        fireEvent.click(screen.getByText('common.save'));
        const payload = mockUpdateTest.mock.calls[0][0];
        const remaining = payload.sections.find((s: TestSection) => s.id === 's1');
        expect(remaining.routing.passSectionId).toBe('');
        expect(remaining.routing.failSectionId).toBe('');
        // the question that lived in the removed section s2 is detached
        expect(payload.questions.find((q: TestQuestion) => q.id === 'q2').sectionId).toBeUndefined();
        expect(payload.questions.find((q: TestQuestion) => q.id === 'qq1').sectionId).toBe('s1');
    });

    it('toggles section routing, edits thresholds, and saves sanitized values', () => {
        mockTests = [
            {
                id: 't1',
                name: 'Routing',
                questions: [],
                sections: [s1, s2],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-01T00:00:00Z',
            },
        ];
        renderBuilder('/tests/t1');
        fireEvent.change(screen.getByLabelText('tests.mode_label'), { target: { value: 'placement' } });

        // enable routing on the first section
        fireEvent.click(screen.getAllByText('tests.section_routing_toggle')[0]);
        // set an out-of-range threshold, then a NaN one
        fireEvent.change(screen.getByLabelText(/tests.section_routing_threshold_label/), { target: { value: '150' } });
        fireEvent.change(screen.getByLabelText(/tests.section_routing_threshold_label/), { target: { value: 'abc' } });
        // change pass/fail targets to the empty option
        fireEvent.change(screen.getByLabelText(/tests.section_routing_pass_label/), { target: { value: '' } });
        fireEvent.change(screen.getByLabelText(/tests.section_routing_fail_label/), { target: { value: '' } });
        // disable routing again
        fireEvent.click(screen.getAllByText('tests.section_routing_toggle')[0]);

        fireEvent.click(screen.getByText('common.save'));
        const payload = mockUpdateTest.mock.calls[0][0];
        expect(payload.sections[0].routing).toBeUndefined();
    });

    it('shows staircase pool warnings for untagged or thin sections', () => {
        mockTests = [
            {
                id: 't1',
                name: 'Staircase',
                questions: [{ ...q1, sectionId: 's1' }],
                sections: [s1, s2],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-01T00:00:00Z',
            },
        ];
        renderBuilder('/tests/t1');
        fireEvent.change(screen.getByLabelText('tests.mode_label'), { target: { value: 'placement' } });
        fireEvent.change(screen.getByLabelText('tests.placement_engine_label'), { target: { value: 'staircase' } });
        expect(screen.getAllByText('tests.section_level_pool_untagged').length).toBeGreaterThan(0);
        // tag the first section
        const selects = screen.getAllByRole('combobox');
        const cefrSelect = selects.find((s) => s.id.startsWith('section-cefr-')) as HTMLSelectElement;
        fireEvent.change(cefrSelect, { target: { value: 'A1' } });
        expect(screen.getByText(/tests.section_level_pool_count/)).toBeInTheDocument();
    });

    it('saves practice-mode extras and invalid durations', () => {
        renderBuilder();
        fireEvent.change(screen.getByLabelText('tests.mode_label'), { target: { value: 'practice' } });
        fireEvent.change(screen.getByLabelText('tests.name_label'), { target: { value: 'Practice Test' } });
        fireEvent.change(screen.getByLabelText('tests.content_area_label'), { target: { value: 'reading' } });
        fireEvent.click(screen.getByText('tests.allow_multiple_attempts_label'));
        fireEvent.click(screen.getByText('tests.shuffle_questions_label'));
        fireEvent.click(screen.getByText('tests.require_seb_label'));
        fireEvent.change(screen.getByLabelText('tests.duration_label'), { target: { value: 'not-a-number' } });
        fireEvent.change(screen.getByLabelText('tests.grade_scale_label'), { target: { value: '' } });
        fireEvent.change(screen.getByLabelText('tests.due_date_label'), { target: { value: '2025-01-15T10:00' } });
        fireEvent.change(screen.getByLabelText('cefr.target_level_label'), { target: { value: 'B2' } });
        fireEvent.change(screen.getByLabelText('cefr.skill_label'), { target: { value: 'writing' } });
        fireEvent.change(screen.getByLabelText(/tests.description_label/), { target: { value: 'A description' } });

        fireEvent.click(screen.getByText('common.save'));
        const payload = mockAddTest.mock.calls[0][0];
        expect(payload.mode).toBe('practice');
        expect(payload.contentArea).toBe('reading');
        expect(payload.allowMultipleAttempts).toBe(true);
        expect(payload.shuffleQuestions).toBe(true);
        expect(payload.requireSEB).toBe(true);
        expect(payload.durationMinutes).toBeUndefined();
        expect(payload.gradeScaleId).toBeUndefined();
        // The page converts the local datetime input to ISO; mirror that conversion so the
        // assertion holds in every timezone (CI runs UTC, dev machines do not).
        expect(payload.dueDate).toBe(new Date('2025-01-15T10:00').toISOString());
        expect(payload.cefrTargetLevel).toBe('B2');
        expect(payload.cefrSkill).toBe('writing');
        expect(payload.description).toBe('A description');
        expect(payload.placementEngine).toBeUndefined();
    });

    it('clears the name error on typing and saves a valid duration', () => {
        renderBuilder();
        fireEvent.click(screen.getByText('common.save'));
        expect(screen.getByText('tests.name_required')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('tests.name_label'), { target: { value: 'Named' } });
        expect(screen.queryByText('tests.name_required')).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('tests.duration_label'), { target: { value: '45' } });
        fireEvent.click(screen.getByText('common.save'));
        expect(mockAddTest.mock.calls[0][0].durationMinutes).toBe(45);
    });

    it('runs the tour and closes via back button', () => {
        renderBuilder();
        fireEvent.click(screen.getByText('tutorial.tb_tour_button'));
        joyrideState.onEvent!({ status: 'finished' });
        joyrideState.onEvent!({ status: 'skipped' });
        joyrideState.onEvent!({ status: 'running' });
        fireEvent.click(screen.getByText('tests.back_to_list'));
    });

    it('adds and edits two questions, then removes one', () => {
        renderBuilder();
        fireEvent.change(screen.getByLabelText('tests.name_label'), { target: { value: 'Two Questions' } });
        fireEvent.click(screen.getAllByText(/tests.add_question/)[0]);
        fireEvent.click(screen.getAllByText(/tests.add_question/)[1]);
        const prompts = screen.getAllByLabelText('tests.question_prompt_label');
        fireEvent.change(prompts[0], { target: { value: 'Edited first' } });
        fireEvent.click(screen.getAllByLabelText('tests.remove_question')[0]);
        expect(screen.queryByDisplayValue('Edited first')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('common.save'));
        expect(mockAddTest.mock.calls[0][0].questions).toHaveLength(1);
    });

    it('moves questions between the uncategorised pool and sections via drag and drop', () => {
        mockTests = [
            {
                id: 't1',
                name: 'Drag',
                questions: [{ ...q1, sectionId: 's1' }, { ...q2 }],
                sections: [s1, s2],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-01T00:00:00Z',
            },
        ];
        renderBuilder('/tests/t1');

        const drag = (result: unknown) => dndState.onDragEnd!(result);

        // no destination → no-op
        drag({ source: { droppableId: '__none__', index: 0 } });
        // same position → no-op
        drag({ source: { droppableId: '__none__', index: 0 }, destination: { droppableId: '__none__', index: 0 } });
        // reorder within __none__
        drag({ source: { droppableId: '__none__', index: 0 }, destination: { droppableId: '__none__', index: 1 } });
        // move __none__ → section
        drag({ source: { droppableId: '__none__', index: 0 }, destination: { droppableId: 's2', index: 0 } });
        // move section → __none__
        drag({ source: { droppableId: 's1', index: 0 }, destination: { droppableId: '__none__', index: 0 } });
        // move section → other section
        drag({ source: { droppableId: 's1', index: 0 }, destination: { droppableId: 's2', index: 0 } });
        // reorder within a section
        drag({ source: { droppableId: 's2', index: 0 }, destination: { droppableId: 's2', index: 1 } });

        fireEvent.click(screen.getByText('common.save'));
        expect(mockUpdateTest).toHaveBeenCalledTimes(1);
    });

    it('inserts a section bundle from the bank and saves it to the bank', () => {
        mockQuestionBank = [sectionItem];
        renderBuilder();
        fireEvent.change(screen.getByLabelText('tests.name_label'), { target: { value: 'Bundle' } });
        // insert a section bundle via the bank
        fireEvent.click(screen.getByText('questionBank.insert_button'));
        fireEvent.click(screen.getByText('questionBank.section_bundle_title:{"title":"Bank Passage"}'));
        // Selecting an item inserts it and closes the bank modal; the section title now shows in the test.
        expect(screen.getAllByText('Bank Passage').length).toBeGreaterThan(0);

        // open the bank again and close it via the X
        fireEvent.click(screen.getByText('questionBank.insert_button'));
        fireEvent.click(screen.getByLabelText('common.close'));

        // save the section back to the bank
        fireEvent.click(screen.getByText('questionBank.save_section_to_bank'));
        expect(mockAddSectionBankItem).toHaveBeenCalled();
        expect(mockShowToast).toHaveBeenCalledWith('questionBank.saved_toast', 'success');
    });

    it('expands a passage editor and sets its content and audio url', () => {
        mockTests = [
            {
                id: 't1',
                name: 'Passage',
                questions: [{ ...q1, sectionId: 's1' }],
                sections: [{ ...s1, content: '<p>Orig</p>' }],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-01T00:00:00Z',
            },
        ];
        renderBuilder('/tests/t1');
        // section passage is expanded by default (has content)
        const passageEditor = screen.getByLabelText('tests.section_passage_placeholder');
        fireEvent.change(passageEditor, { target: { value: '<p>New body</p>' } });
        // collapse then re-expand
        fireEvent.click(screen.getAllByText('Reading')[0]);
        fireEvent.click(screen.getAllByText('Reading')[0]);
        // set an audio url
        fireEvent.change(screen.getByLabelText(/tests.section_audio_label/), {
            target: { value: 'https://example.com/audio.mp3' },
        });
        expect(screen.getByLabelText('tests.question_audio_preview_alt')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.save'));
        const payload = mockUpdateTest.mock.calls[0][0];
        expect(payload.sections[0].content).toBe('<p>New body</p>');
        expect(payload.sections[0].audioUrl).toBe('https://example.com/audio.mp3');
    });

    it('shows the empty-section hint and adds a question to a section', () => {
        mockTests = [
            {
                id: 't1',
                name: 'Empty',
                questions: [{ ...q1 }],
                sections: [s1],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-01T00:00:00Z',
            },
        ];
        renderBuilder('/tests/t1');
        expect(screen.getByText('tests.section_empty_hint')).toBeInTheDocument();
        // add a question to the section via the section's add button (header, pool, then section)
        fireEvent.click(screen.getAllByText(/tests.add_question/)[2]);
        fireEvent.click(screen.getByText('common.save'));
        expect(mockUpdateTest.mock.calls[0][0].questions[1].sectionId).toBe('s1');
    });

    it('detaches questions from a removed section and handles stale section ids', () => {
        mockTests = [
            {
                id: 't1',
                name: 'Stale',
                questions: [{ ...q1, sectionId: 'gone' }],
                sections: [s1],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-01T00:00:00Z',
            },
        ];
        renderBuilder('/tests/t1');
        // The stale-section question renders in the uncategorised pool.
        expect(screen.getByDisplayValue('Question one')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.save'));
        const payload = mockUpdateTest.mock.calls[0][0];
        expect(payload.questions[0].sectionId).toBe('gone');
    });

    it('prefills duration and due date from an existing test', () => {
        mockTests = [
            {
                id: 't1',
                name: 'Prefill',
                questions: [],
                sections: [],
                durationMinutes: 45,
                dueDate: '2025-01-15T10:00:00.000Z',
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-01T00:00:00Z',
            },
        ];
        renderBuilder('/tests/t1');
        expect((screen.getByLabelText('tests.duration_label') as HTMLInputElement).value).toBe('45');
        expect((screen.getByLabelText('tests.due_date_label') as HTMLInputElement).value).not.toBe('');
    });

    it('seeds generator state from a saved test with a stale starter', () => {
        mockTests = [
            {
                id: 't1',
                name: 'Gen',
                mode: 'placement',
                placementEngine: 'generator',
                generatorConfig: {
                    minCefrLevel: 'C2',
                    maxCefrLevel: 'A1',
                    skills: ['reading'],
                    minQuestions: 2,
                    maxQuestions: 5,
                    starterBankItemId: 'ghost',
                },
                questions: [],
                sections: [],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-01T00:00:00Z',
            },
        ];
        renderBuilder('/tests/t1');
        // min > max → the pool computation bails out, so no warnings render
        expect(screen.queryByText(/tests.generator_pool_warning/)).not.toBeInTheDocument();
        // stale starter id (not in the bank) falls back to the raw id
        expect(screen.getByText('ghost')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.save'));
        const payload = mockUpdateTest.mock.calls[0][0];
        expect(payload.generatorConfig.skills).toEqual(['reading']);
    });

    it('inserts a question-kind bank item without creating a section', () => {
        mockQuestionBank = [questionItem];
        renderBuilder();
        fireEvent.click(screen.getByText('questionBank.insert_button'));
        fireEvent.click(screen.getByText('Bank question prompt'));
        // no section was created — the sections panel still shows its none-hint
        expect(screen.getByText('tests.sections_none_hint')).toBeInTheDocument();
        // the question landed in the uncategorised pool
        expect(screen.getByDisplayValue('Bank question prompt')).toBeInTheDocument();
    });

    it('adds a question from the empty state', () => {
        renderBuilder();
        fireEvent.change(screen.getByLabelText('tests.name_label'), { target: { value: 'Fresh' } });
        // empty state renders its own primary add button (header button + empty-state button)
        fireEvent.click(screen.getAllByText('tests.add_question')[1]);
        expect(screen.getAllByLabelText('tests.question_prompt_label').length).toBe(1);
        fireEvent.click(screen.getByText('common.save'));
        expect(mockAddTest.mock.calls[0][0].questions.length).toBe(1);
    });

    it('totals zero-point questions via the fallback', () => {
        mockTests = [
            {
                id: 't1',
                name: 'Zero',
                questions: [{ ...q1, points: 0 }],
                sections: [],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-01T00:00:00Z',
            },
        ];
        renderBuilder('/tests/t1');
        expect(screen.getByText(/tests.questions_summary/)).toBeInTheDocument();
    });

    it('removing a referenced section cleans only its own routing edges', () => {
        const s3: TestSection = { id: 's3', title: 'Speaking' };
        const s4: TestSection = { id: 's4', title: 'Writing' };
        const s5: TestSection = { id: 's5', title: 'Grammar' };
        mockTests = [
            {
                id: 't1',
                name: 'RoutingMatrix',
                mode: 'placement',
                questions: [
                    { ...q1, sectionId: 's1' },
                    { ...q1, id: 'q2', prompt: 'Q2', sectionId: 's2' },
                    { ...q1, id: 'q3', prompt: 'Q3', sectionId: 's3' },
                ],
                sections: [
                    // both edges point at s2 → both cleaned
                    { ...s1, routing: { thresholdPct: 60, passSectionId: 's2', failSectionId: 's2' } },
                    s2,
                    // pass points elsewhere, fail at s2 → pass kept, fail cleaned
                    { ...s3, routing: { thresholdPct: 60, passSectionId: 's1', failSectionId: 's2' } },
                    // pass at s2, fail elsewhere → pass cleaned, fail kept
                    { ...s4, routing: { thresholdPct: 60, passSectionId: 's2', failSectionId: 's1' } },
                    // neither edge references s2 → untouched keep-path
                    { ...s5, routing: { thresholdPct: 60, passSectionId: 's1', failSectionId: 's1' } },
                ],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-01T00:00:00Z',
            },
        ];
        renderBuilder('/tests/t1');
        fireEvent.click(screen.getAllByLabelText('tests.remove_section')[1]);
        fireEvent.click(screen.getByText('common.save'));
        const payload = mockUpdateTest.mock.calls[0][0];
        const get = (id: string) => payload.sections.find((s: TestSection) => s.id === id);
        expect(get('s1').routing.passSectionId).toBe('');
        expect(get('s1').routing.failSectionId).toBe('');
        expect(get('s3').routing.passSectionId).toBe('s1');
        expect(get('s3').routing.failSectionId).toBe('');
        expect(get('s4').routing.passSectionId).toBe('');
        expect(get('s4').routing.failSectionId).toBe('s1');
        expect(get('s5').routing.passSectionId).toBe('s1');
        expect(get('s5').routing.failSectionId).toBe('s1');
        // the question that lived in s2 is detached
        expect(payload.questions.find((q: TestQuestion) => q.id === 'q2').sectionId).toBeUndefined();
    });

    it('enables routing on a lone section with an empty target', () => {
        mockTests = [
            {
                id: 't1',
                name: 'Lone',
                mode: 'placement',
                questions: [{ ...q1, sectionId: 's1' }],
                sections: [s1],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-01T00:00:00Z',
            },
        ];
        renderBuilder('/tests/t1');
        fireEvent.click(screen.getByText('tests.section_routing_toggle'));
        // single section → the target falls back to ''
        expect((screen.getByLabelText(/tests.section_routing_pass_label/) as HTMLSelectElement).value).toBe('');
        expect((screen.getByLabelText(/tests.section_routing_fail_label/) as HTMLSelectElement).value).toBe('');
        // disable routing again → controls unmount
        fireEvent.click(screen.getByText('tests.section_routing_toggle'));
        expect(screen.queryByLabelText(/tests.section_routing_pass_label/)).not.toBeInTheDocument();
    });

    it('shows the routing cycle warning in mst mode', () => {
        mockTests = [
            {
                id: 't1',
                name: 'Cycle',
                mode: 'placement',
                placementEngine: 'mst',
                questions: [],
                sections: [s1, s2],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-01T00:00:00Z',
            },
        ];
        renderBuilder('/tests/t1');
        fireEvent.click(screen.getAllByText('tests.section_routing_toggle')[0]);
        fireEvent.click(screen.getAllByText('tests.section_routing_toggle')[1]);
        expect(screen.getByText('tests.section_routing_warning_cycle')).toBeInTheDocument();
    });

    it('clears a section CEFR level back to untagged', () => {
        mockTests = [
            {
                id: 't1',
                name: 'Tag',
                mode: 'placement',
                placementEngine: 'staircase',
                questions: [{ ...q1, sectionId: 's1' }],
                sections: [s1],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-01T00:00:00Z',
            },
        ];
        renderBuilder('/tests/t1');
        const cefrSelect = screen
            .getAllByRole('combobox')
            .find((s) => s.id.startsWith('section-cefr-')) as HTMLSelectElement;
        fireEvent.change(cefrSelect, { target: { value: 'A1' } });
        expect(screen.getByText(/tests.section_level_pool_count/)).toBeInTheDocument();
        fireEvent.change(cefrSelect, { target: { value: '' } });
        expect(screen.getByText(/tests.section_level_pool_untagged/)).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.save'));
        expect(mockUpdateTest.mock.calls[0][0].sections[0].cefrLevel).toBeUndefined();
    });

    it('expands and collapses the passage editor and clears the audio url', () => {
        mockTests = [
            {
                id: 't1',
                name: 'Passage',
                questions: [{ ...q1, sectionId: 's1' }],
                sections: [{ ...s1, content: '<p>Orig</p>' }, s2],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-01T00:00:00Z',
            },
        ];
        renderBuilder('/tests/t1');
        // s1 has content → expanded by default; s2 has none → collapsed
        expect(screen.getAllByLabelText('tests.section_passage_placeholder').length).toBe(1);
        fireEvent.click(screen.getAllByText('tests.section_passage_label')[0]);
        expect(screen.queryAllByLabelText('tests.section_passage_placeholder').length).toBe(0);
        fireEvent.click(screen.getAllByText('tests.section_passage_label')[0]);
        expect(screen.getAllByLabelText('tests.section_passage_placeholder').length).toBe(1);
        // expand the content-less section → content ?? '' fallback
        fireEvent.click(screen.getAllByText('tests.section_passage_label')[1]);
        expect(screen.getAllByLabelText('tests.section_passage_placeholder').length).toBe(2);
        // set then clear an audio url (first section's field)
        fireEvent.change(screen.getAllByLabelText(/tests.section_audio_label/)[0], {
            target: { value: 'https://example.com/a.mp3' },
        });
        expect(screen.getByLabelText('tests.question_audio_preview_alt')).toBeInTheDocument();
        fireEvent.change(screen.getAllByLabelText(/tests.section_audio_label/)[0], { target: { value: '' } });
        fireEvent.click(screen.getByText('common.save'));
        const payload = mockUpdateTest.mock.calls[0][0];
        expect(payload.sections[0].audioUrl).toBeUndefined();
    });

    it('clamps generator level ranges and question counts', () => {
        renderBuilder();
        fireEvent.change(screen.getByLabelText('tests.mode_label'), { target: { value: 'placement' } });
        fireEvent.change(screen.getByLabelText('tests.placement_engine_label'), { target: { value: 'generator' } });
        // raise the min above the max → the max follows
        fireEvent.change(screen.getByLabelText('tests.generator_max_level_label'), { target: { value: 'B1' } });
        fireEvent.change(screen.getByLabelText('tests.generator_min_level_label'), { target: { value: 'C1' } });
        expect((screen.getByLabelText('tests.generator_max_level_label') as HTMLSelectElement).value).toBe('C1');
        // lower the max below the min → the min follows
        fireEvent.change(screen.getByLabelText('tests.generator_max_level_label'), { target: { value: 'A1' } });
        expect((screen.getByLabelText('tests.generator_min_level_label') as HTMLSelectElement).value).toBe('A1');
        // min questions clamps to at least 1
        fireEvent.change(screen.getByLabelText('tests.generator_min_questions_label'), { target: { value: '0' } });
        expect((screen.getByLabelText('tests.generator_min_questions_label') as HTMLInputElement).value).toBe('1');
        // clearing max questions falls back to the min
        fireEvent.change(screen.getByLabelText('tests.generator_max_questions_label'), { target: { value: '' } });
        expect((screen.getByLabelText('tests.generator_max_questions_label') as HTMLInputElement).value).toBe('1');
    });

    it('renders generator skill labels in Dutch', () => {
        mockLangState.value = 'nl';
        renderBuilder();
        fireEvent.change(screen.getByLabelText('tests.mode_label'), { target: { value: 'placement' } });
        fireEvent.change(screen.getByLabelText('tests.placement_engine_label'), { target: { value: 'generator' } });
        expect(screen.getAllByText('Lezen').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Schrijven').length).toBeGreaterThan(0);
    });

    it('ignores empty and non-Enter section titles', () => {
        renderBuilder();
        const input = screen.getByPlaceholderText('tests.new_section_placeholder');
        fireEvent.keyDown(input, { key: 'Enter' });
        fireEvent.keyDown(input, { key: 'a' });
        expect(screen.queryByLabelText('tests.section_name_label')).not.toBeInTheDocument();
        fireEvent.change(input, { target: { value: 'New' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(screen.getByLabelText('tests.section_name_label')).toBeInTheDocument();
    });

    it('closes the starter modal without selecting', () => {
        mockQuestionBank = [questionItem];
        renderBuilder();
        fireEvent.change(screen.getByLabelText('tests.mode_label'), { target: { value: 'placement' } });
        fireEvent.change(screen.getByLabelText('tests.placement_engine_label'), { target: { value: 'generator' } });
        fireEvent.click(screen.getByRole('button', { name: /tests.generator_pick_starter_button/ }));
        expect(screen.getByText('questionBank.insert_title')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByText('questionBank.insert_title')).not.toBeInTheDocument();
    });

    it('rejects zero durations and skips an empty content area', () => {
        renderBuilder();
        fireEvent.change(screen.getByLabelText('tests.mode_label'), { target: { value: 'practice' } });
        fireEvent.change(screen.getByLabelText('tests.name_label'), { target: { value: 'Dur' } });
        fireEvent.change(screen.getByLabelText('tests.duration_label'), { target: { value: '0' } });
        fireEvent.click(screen.getByText('common.save'));
        const payload = mockAddTest.mock.calls[0][0];
        expect(payload.durationMinutes).toBeUndefined();
        expect(payload.contentArea).toBeUndefined();
    });

    it('filters generator pools by selected skills', () => {
        mockQuestionBank = [
            sectionItem,
            { ...questionItem, id: 'reading-item', cefrLevel: 'A1', cefrSkill: 'reading' },
        ];
        renderBuilder();
        fireEvent.change(screen.getByLabelText('tests.mode_label'), { target: { value: 'placement' } });
        fireEvent.change(screen.getByLabelText('tests.placement_engine_label'), { target: { value: 'generator' } });
        // pick the Reading skill — sectionItem has no skill facet, reading-item matches
        fireEvent.click(screen.getByLabelText('Reading'));
        expect(screen.getAllByText(/tests.generator_pool_warning/).length).toBeGreaterThan(0);
    });

    it('hides the pool warning for a well-stocked tagged section', () => {
        mockTests = [
            {
                id: 't1',
                name: 'Stocked',
                mode: 'placement',
                placementEngine: 'staircase',
                questions: [
                    { ...q1, sectionId: 's1' },
                    { ...q2, sectionId: 's1' },
                    { ...q1, id: 'qq3', prompt: 'Q3', sectionId: 's1' },
                ],
                sections: [{ ...s1, cefrLevel: 'A1' }],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-01T00:00:00Z',
            },
        ];
        renderBuilder('/tests/t1');
        // tagged with >= 3 auto-scorable questions → the count line renders without the warning state
        expect(screen.getByText(/tests.section_level_pool_count/)).toBeInTheDocument();
    });

    it('falls back to the raw id for malformed starter items', () => {
        mockQuestionBank = [
            { id: 'mal-sec', kind: 'section', tags: [], createdAt: '2026-01-01T00:00:00.000Z' },
            { id: 'mal-q', kind: 'question', tags: [], createdAt: '2026-01-01T00:00:00.000Z' },
        ];
        renderBuilder();
        fireEvent.change(screen.getByLabelText('tests.mode_label'), { target: { value: 'placement' } });
        fireEvent.change(screen.getByLabelText('tests.placement_engine_label'), { target: { value: 'generator' } });
        fireEvent.click(screen.getByRole('button', { name: /tests.generator_pick_starter_button/ }));
        // both malformed items render with the untitled-prompt fallback
        const untitled = screen.getAllByText('questionBank.untitled_prompt');
        fireEvent.click(untitled[0]);
        // section-kind item without a payload → label falls back to the raw id
        expect(screen.getByText('mal-sec')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /tests.generator_pick_starter_button/ }));
        fireEvent.click(screen.getAllByText('questionBank.untitled_prompt')[1]);
        // question-kind item without a payload → label falls back to the raw id
        expect(screen.getByText('mal-q')).toBeInTheDocument();
    });

    it('edits and removes a question inside a section', () => {
        mockTests = [
            {
                id: 't1',
                name: 'SectionQ',
                questions: [{ ...q1, sectionId: 's1' }],
                sections: [s1],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-01T00:00:00Z',
            },
        ];
        renderBuilder('/tests/t1');
        fireEvent.change(screen.getByLabelText('tests.question_prompt_label'), { target: { value: 'Edited prompt' } });
        fireEvent.change(screen.getByLabelText('tests.question_points_label'), { target: { value: '0' } });
        expect(screen.getByDisplayValue('Edited prompt')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.save'));
        const payload = mockUpdateTest.mock.calls[0][0];
        expect(payload.questions[0].prompt).toBe('Edited prompt');
        expect(payload.questions[0].points).toBe(0);
        // remove the section question
        fireEvent.click(screen.getByLabelText('tests.remove_question'));
        expect(screen.queryByDisplayValue('Edited prompt')).not.toBeInTheDocument();
    });
});
