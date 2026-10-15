import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { StoreData } from '../../store/storage';
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

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Speaking Rubric',
    subject: 'English',
    description: '',
    criteria: [
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
    ],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
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

const practiceSession: SpeakingSessionType = {
    id: 'ps1',
    rubricId: 'r1',
    studentId: 's1',
    mode: 'practice',
    durationSeconds: 120,
    elapsedSeconds: 45,
    pronunciationMarks: [{ errorType: 'th_sound' }],
    entries: [{ criterionId: 'c1', levelId: 'l2', comment: '', checkedSubItems: [] }],
    overallComment: 'From before',
    gradedAt: '2024-01-02T00:00:00Z',
};

const mockRubricsArr = [mockRubric];
const mockStudentsArr = [mockStudent];
const mockClassesArr = [mockClass];
const mockGradeScalesArr = [mockGradeScale];
const emptyArr: never[] = [];

const mockAppValue: Partial<StoreData> = {
    rubrics: mockRubricsArr,
    students: mockStudentsArr,
    classes: mockClassesArr,
    gradeScales: mockGradeScalesArr,
    settings: mockSettings,
    speakingSessions: emptyArr,
    studentRubrics: emptyArr,
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
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
    useStoreSelector: <T,>(selector: (state: StoreData) => T): T => selector(mockAppValue as StoreData),
    // SpeakingSession only triggers saveSpeakingSession; keep the action mock narrow.
    useStoreActions: () => ({ saveSpeakingSession: mockSaveSpeakingSession }),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('react-joyride', () => ({
    Joyride: () => null,
    STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
}));

vi.mock('../../services/database', () => ({
    loadSupabaseConfig: () => null,
}));

vi.mock('../../components/Recordings/RecordingControls', () => ({
    default: ({
        onChange,
    }: {
        onChange: (recs: { id: string; url: string; durationSeconds: number; createdAt: string }[]) => void;
    }) =>
        React.createElement(
            'div',
            { 'data-testid': 'recording-controls' },
            React.createElement(
                'button',
                {
                    onClick: () =>
                        onChange([
                            {
                                id: 'rec1',
                                url: 'blob://test',
                                durationSeconds: 10,
                                createdAt: new Date().toISOString(),
                            },
                        ]),
                },
                'Add Recording'
            )
        ),
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

// `createMemoryRouter` caches the route element it is handed, and React bails out of re-rendering a
// subtree whose element is identical to the previous render's — so a bare `rerender` of the same
// router never re-runs the page. This harness makes the page a fresh element on every render, which
// is what a store notification looks like to it, without remounting and losing its state.
const lateHydration = { refresh: () => {} };

function LateHydrationHarness() {
    const [, setTick] = React.useState(0);
    // Published from an effect rather than during render: mutating anything outside the component
    // while rendering is what the react-hooks/immutability rule (and React itself) forbid.
    React.useEffect(() => {
        lateHydration.refresh = () => setTick((n) => n + 1);
    }, []);
    return <SpeakingSessionComp />;
}

function renderLateHydrationPage() {
    const router = createMemoryRouter(
        [{ path: '/rubrics/:rubricId/speaking/:studentId', element: <LateHydrationHarness /> }],
        {
            initialEntries: ['/rubrics/r1/speaking/s1'],
        }
    );
    render(<RouterProvider router={router} />);
}

function refreshLateHydration() {
    act(() => lateHydration.refresh());
}

function lateAssessmentSession(id: string): SpeakingSessionType {
    return {
        id,
        rubricId: 'r1',
        studentId: 's1',
        durationSeconds: 600,
        elapsedSeconds: 120,
        pronunciationMarks: [],
        entries: [],
        overallComment: '',
        gradedAt: '2024-01-02T00:00:00Z',
    };
}

describe('SpeakingSession extended', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockAppValue.speakingSessions = emptyArr;
        const mod = await import('../SpeakingSession');
        SpeakingSessionComp = mod.default;
    });

    it('runs the timer through start, pause and stop, then locks the session', () => {
        renderAt();
        fireEvent.click(screen.getByText('speaking.start'));
        // Pause button appears while running
        expect(screen.getByText('speaking.pause')).toBeInTheDocument();
        fireEvent.click(screen.getByText('speaking.pause'));
        expect(screen.getByText('speaking.start')).toBeInTheDocument();

        // Stop locks the timer: duration input disappears and badge appears
        fireEvent.click(screen.getByText('speaking.stop'));
        expect(screen.getByText('speaking.session_locked')).toBeInTheDocument();
        expect(screen.queryByLabelText('speaking.duration_minutes')).not.toBeInTheDocument();
    });

    it('edits the duration and resets elapsed time', () => {
        renderAt();
        fireEvent.change(screen.getByLabelText('speaking.duration_minutes'), { target: { value: '5' } });
        expect(screen.getByText('05:00')).toBeInTheDocument(); // 5 minutes remaining, elapsed reset
    });

    it('adds, counts, and removes pronunciation marks', () => {
        renderAt();
        expect(screen.getByText('speaking.no_marks')).toBeInTheDocument();

        fireEvent.click(screen.getByText('speaking.error_types.word_stress'));
        fireEvent.click(screen.getByText('speaking.error_types.th_sound'));
        expect(screen.getByText('speaking.marks_label:{"count":2}')).toBeInTheDocument();
        expect(screen.getByText('speaking.pronunciationFeedback.word_stress')).toBeInTheDocument();

        // Remove one mark
        fireEvent.click(screen.getAllByLabelText('common.delete')[0]);
        expect(screen.getByText('speaking.marks_label:{"count":1}')).toBeInTheDocument();

        // Clear all
        fireEvent.click(screen.getByText('speaking.clear_marks'));
        expect(screen.getByText('speaking.no_marks')).toBeInTheDocument();
    });

    it('switches between assessment and practice modes', () => {
        renderAt();
        expect(screen.getByText('speaking.mode_assessment_help')).toBeInTheDocument();
        fireEvent.click(screen.getByText('speaking.mode_practice'));
        expect(screen.getByText('speaking.mode_practice_help')).toBeInTheDocument();
        fireEvent.click(screen.getByText('speaking.mode_assessment'));
    });

    it('disables mode switching once the session is dirty', () => {
        renderAt();
        fireEvent.click(screen.getByText('speaking.error_types.vowel_sound'));
        expect(screen.getByText('speaking.mode_practice').closest('button')).toBeDisabled();
    });

    it('loads an existing practice session with locked timer and pre-filled state', () => {
        mockAppValue.speakingSessions = [practiceSession];
        renderAt();
        fireEvent.click(screen.getByText('speaking.mode_practice'));
        expect(screen.getByText('speaking.session_locked')).toBeInTheDocument();
        expect(screen.queryByLabelText('speaking.duration_minutes')).not.toBeInTheDocument();
        // Pre-filled marks and overall comment
        expect(screen.getByText('speaking.marks_label:{"count":1}')).toBeInTheDocument();
        expect(screen.getByLabelText('gradeStudent.overall_comment_label')).toHaveValue('From before');
        // Elapsed carries over: 120 - 45 = 1:15
        expect(screen.getByText('01:15')).toBeInTheDocument();
    });

    it('saves the session with an overall comment and shows the saved state', () => {
        renderAt();
        fireEvent.change(screen.getByLabelText('gradeStudent.overall_comment_label'), {
            target: { value: 'Nice fluency' },
        });
        fireEvent.click(screen.getAllByText('speaking.save_session')[0]);
        expect(mockSaveSpeakingSession).toHaveBeenCalledWith(
            expect.objectContaining({
                rubricId: 'r1',
                studentId: 's1',
                overallComment: 'Nice fluency',
                mode: undefined,
            })
        );
        expect(screen.getAllByText('speaking.session_saved').length).toBeGreaterThan(0);
    });

    it('shows the grade summary and updates it once a level is selected', () => {
        renderAt();
        expect(screen.getByText('gradeStudent.label_grade')).toBeInTheDocument();
        expect(screen.getByText('gradeStudent.label_percentage')).toBeInTheDocument();
        expect(screen.getByText('gradeStudent.label_total_points')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Excellent'));
        expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('adds a recording through the controls panel', () => {
        renderAt();
        fireEvent.click(screen.getByText('Add Recording'));
        fireEvent.click(screen.getAllByText('speaking.save_session')[0]);
        expect(mockSaveSpeakingSession.mock.calls[0][0].recordings).toHaveLength(1);
    });

    it('reopens a saved session with its own duration, not the 2-minute default', () => {
        // A 5-minute session saved with 1 min elapsed must show 04:00 remaining, not 01:00.
        const assessmentSession: SpeakingSessionType = {
            id: 'as1',
            rubricId: 'r1',
            studentId: 's1',
            durationSeconds: 300,
            elapsedSeconds: 60,
            pronunciationMarks: [],
            entries: [],
            overallComment: '',
            gradedAt: '2024-01-02T00:00:00Z',
        };
        mockAppValue.speakingSessions = [assessmentSession];
        renderAt();
        expect(screen.getByText('04:00')).toBeInTheDocument();
        expect(screen.getByText('speaking.elapsed_time:{"elapsed":60,"duration":300}')).toBeInTheDocument();
    });

    it('adopts the practice slot duration when switching modes', () => {
        // The assessment slot is 2 min (default) while the practice slot was saved at 10 min.
        mockAppValue.speakingSessions = [{ ...practiceSession, durationSeconds: 600, elapsedSeconds: 60 }];
        renderAt();
        expect(screen.getByLabelText('speaking.duration_minutes')).toHaveValue(2);
        fireEvent.click(screen.getByText('speaking.mode_practice'));
        expect(screen.getByText('09:00')).toBeInTheDocument();
        // Back to assessment: the 2-minute default returns.
        fireEvent.click(screen.getByText('speaking.mode_assessment'));
        expect(screen.getByLabelText('speaking.duration_minutes')).toHaveValue(2);
    });

    it('lets the duration field be cleared and clamps out-of-range values', () => {
        renderAt();
        const input = screen.getByLabelText('speaking.duration_minutes') as HTMLInputElement;

        fireEvent.change(input, { target: { value: '' } });
        // Empty mid-retype: the timer keeps the last committed duration instead of collapsing.
        expect(input.value).toBe('');
        expect(screen.getByText('02:00')).toBeInTheDocument();

        // Above the 30-minute max: the timer clamps, the field re-syncs on blur.
        fireEvent.change(input, { target: { value: '99' } });
        expect(screen.getByText('30:00')).toBeInTheDocument();
        fireEvent.blur(input);
        expect(input.value).toBe('30');

        // Below the 1-minute min.
        fireEvent.change(input, { target: { value: '0' } });
        expect(screen.getByText('01:00')).toBeInTheDocument();
        fireEvent.blur(input);
        expect(input.value).toBe('1');
    });

    it('marks the session dirty on a duration change and explains the blocked mode switch', () => {
        renderAt();
        expect(screen.queryByText('speaking.mode_switch_needs_save')).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('speaking.duration_minutes'), { target: { value: '5' } });
        expect(screen.getByText('speaking.mode_practice').closest('button')).toBeDisabled();
        expect(screen.getByText('speaking.mode_switch_needs_save')).toBeInTheDocument();

        // Saving clears the dirty flag, so the toggle works and the hint disappears.
        fireEvent.click(screen.getAllByText('speaking.save_session')[0]);
        expect(screen.queryByText('speaking.mode_switch_needs_save')).not.toBeInTheDocument();
        expect(screen.getByText('speaking.mode_practice').closest('button')).not.toBeDisabled();
    });

    it('parses the whole duration value, so an exponent form clamps instead of truncating', () => {
        renderAt();
        const input = screen.getByLabelText('speaking.duration_minutes') as HTMLInputElement;

        // A number input happily accepts `1e2`. parseInt would read it as 1 minute.
        fireEvent.change(input, { target: { value: '1e2' } });
        expect(screen.getByText('30:00')).toBeInTheDocument();
        fireEvent.blur(input);
        expect(input.value).toBe('30');

        // A half-typed exponent is not a number yet, so the committed duration stands.
        fireEvent.change(input, { target: { value: '2e' } });
        expect(screen.getByText('30:00')).toBeInTheDocument();
    });

    it('adopts a saved session that hydrates after the page has mounted', () => {
        renderLateHydrationPage();
        // The store booted from localStorage with no session for this pair yet.
        expect(screen.getByText('02:00')).toBeInTheDocument();
        expect(screen.queryByText('speaking.session_locked')).not.toBeInTheDocument();

        // onLateHydrate then merges the cloud snapshot in while this page is already open.
        mockAppValue.speakingSessions = [lateAssessmentSession('late1')];
        refreshLateHydration();

        // 10 minutes saved, 2 elapsed — not the 2-minute default seeded at mount.
        expect(screen.getByText('08:00')).toBeInTheDocument();
        expect(screen.getByText('speaking.session_locked')).toBeInTheDocument();
    });

    it('does not let a late saved session overwrite a duration the teacher already edited', () => {
        renderLateHydrationPage();
        fireEvent.change(screen.getByLabelText('speaking.duration_minutes'), { target: { value: '5' } });

        mockAppValue.speakingSessions = [lateAssessmentSession('late2')];
        refreshLateHydration();

        // The teacher's 5 minutes stand, and the field stays editable rather than locking up.
        expect(screen.getByText('05:00')).toBeInTheDocument();
        expect((screen.getByLabelText('speaking.duration_minutes') as HTMLInputElement).value).toBe('5');
    });
});
