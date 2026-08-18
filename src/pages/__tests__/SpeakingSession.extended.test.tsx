import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
});
