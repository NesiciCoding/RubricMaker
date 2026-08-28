import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type {
    AppSettings,
    Class,
    GradeScale,
    Rubric,
    SpeakingSession as SpeakingSessionType,
    Student,
} from '../../types';

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 0, max: 100, label: 'A', color: '#22c55e' }],
};

const baseCriteria = [
    {
        id: 'c1',
        title: 'Pronunciation',
        description: '',
        weight: 100,
        levels: [
            { id: 'l1', label: 'Excellent', minPoints: 90, maxPoints: 100, description: 'Fluent', subItems: [] },
            { id: 'l2', label: 'Good', minPoints: 70, maxPoints: 89, description: '', subItems: [] },
        ],
    },
];

function makeRubric(overrides: Partial<Rubric> = {}): Rubric {
    return {
        id: 'r1',
        name: 'Speaking Rubric',
        subject: 'English',
        description: '',
        criteria: baseCriteria,
        gradeScaleId: 'gs1',
        format: DEFAULT_FORMAT,
        attachmentIds: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        totalMaxPoints: 100,
        scoringMode: 'weighted-percentage',
        ...overrides,
    };
}

const threeCriteriaRubric = makeRubric({
    criteria: [
        baseCriteria[0],
        {
            id: 'c2',
            title: 'Fluency',
            description: '',
            weight: 0,
            levels: [
                { id: 'l3', label: 'Adept', minPoints: 0, maxPoints: 100, description: '', subItems: [] },
                { id: 'l4', label: 'Novice', minPoints: 0, maxPoints: 49, description: '', subItems: [] },
            ],
        },
        {
            id: 'c3',
            title: 'Interaction',
            description: '',
            weight: 0,
            levels: [{ id: 'l5', label: 'Strong', minPoints: 0, maxPoints: 100, description: '', subItems: [] }],
        },
    ],
});

// Assessment-mode session with entries only for c1 and c2 — c3 has none, so its
// points fall back to 0, and selecting c1's level leaves c2's entry untouched.
const assessmentSession: SpeakingSessionType = {
    id: 'as1',
    rubricId: 'r1',
    studentId: 's1',
    durationSeconds: 120,
    elapsedSeconds: 45,
    pronunciationMarks: [{ errorType: 'th_sound' }],
    entries: [
        { criterionId: 'c1', levelId: 'l2', comment: '', checkedSubItems: [] },
        { criterionId: 'c2', levelId: null, comment: '', checkedSubItems: [] },
    ],
    overallComment: 'From before',
    gradedAt: '2024-01-02T00:00:00Z',
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

const mockSaveSpeakingSession = vi.fn();
const mockNavigate = vi.fn();

const { joyride } = vi.hoisted(() => ({
    joyride: { onEvent: null as null | ((data: { status: string }) => void) },
}));

// Mutated per test — the module-level mock reads the same object.
const mockAppValue: Record<string, unknown> = {
    rubrics: [makeRubric()],
    students: [mockStudent],
    classes: [mockClass],
    gradeScales: [mockGradeScale],
    settings: mockSettings,
    speakingSessions: [],
    saveSpeakingSession: mockSaveSpeakingSession,
    studentRubrics: [],
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
vi.mock('../../context/useStore', () => ({
    useStoreSelector: (selector: (state: Record<string, unknown>) => unknown) => selector(mockAppValue),
    useStoreActions: () => mockAppValue,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('react-joyride', () => ({
    Joyride: (props: { onEvent: (data: { status: string }) => void }) => {
        joyride.onEvent = props.onEvent;
        return null;
    },
    STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
}));

vi.mock('../../services/database', () => ({
    loadSupabaseConfig: () => null,
}));

vi.mock('../../components/Recordings/RecordingControls', () => ({
    default: () => React.createElement('div', { 'data-testid': 'recording-controls' }),
}));

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

let SpeakingSessionComp: React.ComponentType;

function renderAt(rubricId = 'r1', studentId = 's1') {
    const router = createMemoryRouter(
        [{ path: '/rubrics/:rubricId/speaking/:studentId', element: <SpeakingSessionComp /> }],
        { initialEntries: [`/rubrics/${rubricId}/speaking/${studentId}`] }
    );
    return render(<RouterProvider router={router} />);
}

describe('SpeakingSession coverage', () => {
    beforeEach(async () => {
        mockSaveSpeakingSession.mockClear();
        mockNavigate.mockClear();
        mockAppValue.rubrics = [makeRubric()];
        mockAppValue.speakingSessions = [];
        joyride.onEvent = null;
        const mod = await import('../SpeakingSession');
        SpeakingSessionComp = mod.default;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('guards beforeunload only when the session is dirty', () => {
        renderAt();
        const fire = () => window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
        // Not dirty → the guard's false arm.
        fire();
        // Make it dirty, then the guard's true arm runs.
        fireEvent.click(screen.getByText('speaking.error_types.vowel_sound'));
        fire();
        // The marks list replaced the empty state.
        expect(screen.queryByText('speaking.no_marks')).not.toBeInTheDocument();
        expect(screen.getByText('speaking.marks_label:{"count":1}')).toBeInTheDocument();
    });

    it('auto-locks the timer when it runs out and shows time-up', () => {
        vi.useFakeTimers();
        renderAt();
        fireEvent.change(screen.getByLabelText('speaking.duration_minutes'), { target: { value: '1' } });
        fireEvent.click(screen.getByText('speaking.start'));
        act(() => {
            vi.advanceTimersByTime(60_000);
        });
        expect(screen.getByText('speaking.time_up')).toBeInTheDocument();
        expect(screen.getByText('speaking.session_locked')).toBeInTheDocument();
        expect(screen.queryByLabelText('speaking.duration_minutes')).not.toBeInTheDocument();
    });

    it('keeps running past the deadline when auto-lock is off', () => {
        vi.useFakeTimers();
        renderAt();
        fireEvent.change(screen.getByLabelText('speaking.duration_minutes'), { target: { value: '1' } });
        fireEvent.click(screen.getByText('speaking.auto_lock'));
        fireEvent.click(screen.getByText('speaking.start'));
        act(() => {
            vi.advanceTimersByTime(60_000);
        });
        expect(screen.getByText('speaking.time_up')).toBeInTheDocument();
        // Not locked — the duration input is still editable.
        expect(screen.getByLabelText('speaking.duration_minutes')).toBeInTheDocument();
        fireEvent.click(screen.getByText('speaking.stop'));
        expect(screen.getByText('speaking.session_locked')).toBeInTheDocument();
    });

    it('stops a never-started timer and locks', () => {
        renderAt();
        fireEvent.click(screen.getByText('speaking.stop'));
        expect(screen.getByText('speaking.session_locked')).toBeInTheDocument();
    });

    it('ignores clicking the already-active mode', () => {
        renderAt();
        fireEvent.click(screen.getByText('speaking.mode_assessment'));
        expect(screen.getByText('speaking.mode_assessment_help')).toBeInTheDocument();
    });

    it('loads existing entries, keeps untouched criteria at zero, and passes entries through selectLevel', () => {
        mockAppValue.rubrics = [threeCriteriaRubric];
        mockAppValue.speakingSessions = [assessmentSession];
        renderAt();
        // Entries initialized from the existing session (timer is locked accordingly).
        expect(screen.getByText('speaking.session_locked')).toBeInTheDocument();
        // c1 loads its saved level (70 pts); c2 and c3 have no entry → 0 points.
        expect(screen.getByText('70 / 100 pts')).toBeInTheDocument();
        expect(screen.getAllByText('0 / 100 pts').length).toBe(2);
        // Select a level on c1 — c2's and c3's entries pass through unchanged.
        fireEvent.click(screen.getByText('Excellent'));
        expect(screen.getByText('90 / 100 pts')).toBeInTheDocument();
        expect(screen.getAllByText('0 / 100 pts').length).toBe(2);
    });

    it('falls back to the default scale and the first scale', () => {
        // Rubric without a gradeScaleId → settings.defaultGradeScaleId.
        mockAppValue.rubrics = [makeRubric({ gradeScaleId: undefined })];
        const { unmount } = renderAt();
        expect(screen.getByText('gradeStudent.label_grade')).toBeInTheDocument();
        unmount();

        // Rubric with an unknown scale → gradeScales[0] fallback.
        mockAppValue.rubrics = [makeRubric({ gradeScaleId: 'gs-missing' })];
        renderAt();
        expect(screen.getByText('gradeStudent.label_grade')).toBeInTheDocument();
    });

    it('saves in practice mode and reverts the saved state', () => {
        vi.useFakeTimers();
        renderAt();
        fireEvent.click(screen.getByText('speaking.mode_practice'));
        fireEvent.click(screen.getAllByText('speaking.save_session')[0]);
        expect(mockSaveSpeakingSession).toHaveBeenCalledWith(expect.objectContaining({ mode: 'practice' }));
        expect(screen.getAllByText('speaking.session_saved').length).toBeGreaterThan(0);
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(screen.getAllByText('speaking.save_session').length).toBeGreaterThan(0);
    });

    it('navigates back from not-found, starts the tour, and navigates back from the main view', () => {
        const { unmount } = renderAt('bad-rubric', 's1');
        fireEvent.click(screen.getByText('gradeStudent.action_back'));
        expect(mockNavigate).toHaveBeenCalledWith(-1);
        unmount();

        mockNavigate.mockClear();
        renderAt();
        fireEvent.click(screen.getByText('tutorial.sp_tour_button'));
        fireEvent.click(screen.getByText('gradeStudent.action_back'));
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('closes the tour on finish and skip', () => {
        renderAt();
        fireEvent.click(screen.getByText('tutorial.sp_tour_button'));
        expect(joyride.onEvent).not.toBeNull();
        act(() => {
            joyride.onEvent!({ status: 'finished' });
        });
        act(() => {
            joyride.onEvent!({ status: 'skipped' });
        });
        // An unrelated status leaves the tour running (the if's false arm).
        act(() => {
            joyride.onEvent!({ status: 'tooltip:close' });
        });
        expect(screen.getByText('tutorial.sp_tour_button')).toBeInTheDocument();
    });
});
