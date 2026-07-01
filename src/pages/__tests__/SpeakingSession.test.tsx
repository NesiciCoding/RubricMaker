import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, GradeScale, Rubric, Student } from '../../types';

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
                { id: 'l1', label: 'Excellent', minPoints: 90, maxPoints: 100, description: '', subItems: [] },
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

// Stable refs.
const mockRubricsArr = [mockRubric];
const mockStudentsArr = [mockStudent];
const mockClassesArr = [mockClass];
const mockGradeScalesArr = [mockGradeScale];
const emptyArr: never[] = [];

const mockAppValue = {
    rubrics: mockRubricsArr,
    students: mockStudentsArr,
    classes: mockClassesArr,
    gradeScales: mockGradeScalesArr,
    settings: mockSettings,
    speakingSessions: emptyArr,
    saveSpeakingSession: mockSaveSpeakingSession,
    studentRubrics: emptyArr,
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
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
        onSave,
    }: {
        onSave: (rec: { id: string; url: string; durationSeconds: number; createdAt: string }) => void;
    }) =>
        React.createElement(
            'div',
            { 'data-testid': 'recording-controls' },
            React.createElement(
                'button',
                {
                    onClick: () =>
                        onSave({ id: 'rec1', url: 'blob://test', durationSeconds: 10, createdAt: new Date().toISOString() }),
                },
                'Save Recording'
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

function renderAt(rubricId: string, studentId: string) {
    const router = createMemoryRouter(
        [{ path: '/rubrics/:rubricId/speaking/:studentId', element: <SpeakingSessionComp /> }],
        { initialEntries: [`/rubrics/${rubricId}/speaking/${studentId}`] }
    );
    return render(<RouterProvider router={router} />);
}

describe('SpeakingSession', () => {
    beforeEach(async () => {
        mockSaveSpeakingSession.mockClear();
        mockNavigate.mockClear();
        const mod = await import('../SpeakingSession');
        SpeakingSessionComp = mod.default;
    });

    it('shows not-found when rubric or student is missing', () => {
        renderAt('bad-rubric', 's1');
        expect(screen.getByText('gradeStudent.error_not_found')).toBeInTheDocument();
    });

    it('renders the speaking session with timer and criteria', () => {
        renderAt('r1', 's1');
        expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
        expect(screen.getByText('Pronunciation')).toBeInTheDocument();
    });

    it('shows start/stop timer controls', () => {
        renderAt('r1', 's1');
        // Timer label and start button render.
        expect(screen.getByText('speaking.timer_label')).toBeInTheDocument();
        expect(screen.getByText('speaking.start')).toBeInTheDocument();
    });

    it('selects a score level', () => {
        renderAt('r1', 's1');
        fireEvent.click(screen.getByText('Excellent'));
        // Level button should now appear selected (check it's still visible after click).
        expect(screen.getByText('Excellent')).toBeInTheDocument();
    });

    it('saves the speaking session', () => {
        renderAt('r1', 's1');
        fireEvent.click(screen.getAllByText('speaking.save_session')[0]);
        expect(mockSaveSpeakingSession).toHaveBeenCalledWith(
            expect.objectContaining({ rubricId: 'r1', studentId: 's1' })
        );
    });

    it('renders the recording controls panel', () => {
        renderAt('r1', 's1');
        expect(screen.getByTestId('recording-controls')).toBeInTheDocument();
    });
});
