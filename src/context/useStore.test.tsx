import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppProvider, useAuthoring, useRoster } from './AppContext';
import { useStoreSelector } from './useStore';
import type { Rubric, Student, Class } from '../types';
import { DEFAULT_FORMAT } from '../types';

const mockShowToast = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useToast', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../store/storage', () => ({
    loadStore: vi.fn(() => ({
        rubrics: [],
        students: [],
        classes: [],
        studentRubrics: [],
        attachments: [],
        gradeScales: [{ id: 'default-scale', name: 'Default', type: 'letter', ranges: [] }],
        settings: {
            defaultGradeScaleId: 'default-scale',
            theme: 'light',
            language: 'en',
            accentColor: '#3b82f6',
            defaultFormat: {
                criterionColWidth: 200,
                levelColWidth: 160,
                fontSize: 14,
                headerColor: '#1e3a5f',
                headerTextColor: '#ffffff',
                accentColor: '#3b82f6',
                fontFamily: 'Inter',
                showWeights: true,
                showPoints: true,
                levelOrder: 'best-first',
            },
        },
        favoriteStandards: [],
        commentBank: [],
        exportTemplates: [],
        peerReviews: [],
    })),
    saveRubrics: vi.fn(),
    saveStudents: vi.fn(),
    saveClasses: vi.fn(),
    saveStudentRubrics: vi.fn(),
    saveAttachments: vi.fn(),
    saveGradeScales: vi.fn(),
    saveSettings: vi.fn(),
    saveFavoriteStandards: vi.fn(),
    saveCommentBank: vi.fn(),
    saveExportTemplates: vi.fn(),
    savePeerReviews: vi.fn(),
    saveSelfAssessments: vi.fn(),
    saveSpeakingSessions: vi.fn(),
    saveAnalysisResults: vi.fn(),
    saveEssayAssignments: vi.fn(),
    saveEssaySubmissions: vi.fn(),
    saveDeletedStudentRubrics: vi.fn(),
    saveTests: vi.fn(),
    saveStudentTests: vi.fn(),
    saveQuestionBank: vi.fn(),
    saveFlashcardDecks: vi.fn(),
    saveFlashcardAssignments: vi.fn(),
    saveFlashcardReviews: vi.fn(),
    saveStandardMasteryTargets: vi.fn(),
    saveUserTemplates: vi.fn(),
    saveGradingTasks: vi.fn(),
    saveNewsFlashes: vi.fn(),
    saveNewsFlashReads: vi.fn(),
    saveNotificationDismissals: vi.fn(),
    saveEssayTemplates: vi.fn(),
    saveVocabularyItems: vi.fn(),
    saveEssayGroups: vi.fn(),
    onStorageQuotaExceeded: vi.fn(),
    exportStore: vi.fn((state) => state),
    importFullBackup: vi.fn(() => true),
    loadRubricVersions: vi.fn(() => []),
    upsertRubricVersion: vi.fn(() => ({ versions: [], evictedIds: [] })),
    deleteRubricVersions: vi.fn(),
}));

// AppContext's DB-reconnect/OTP effects always dynamically import this module — mocked so
// tests don't pull in real @supabase/supabase-js and leave dangling imports past teardown.
vi.mock('../services/database', () => ({
    storageSync: {
        isConnected: vi.fn(() => false),
        getCurrentUserId: () => null,
        adapter: { getClient: () => null },
        onNetworkReconnect: () => () => {},
        onAuthChange: () => () => {},
        configure: () => Promise.resolve(false),
        setToastFn: () => {},
        hydrate: () => Promise.resolve({ data: null, error: null }),
        didWipeLocalData: () => false,
        pushOne: vi.fn(),
        pushMany: vi.fn(),
    },
}));

// Imperative handle so tests can dispatch actions from inside the real provider tree.
// Assigned in an effect (not during render) to satisfy react-hooks/globals.
let actions: {
    addRubric: (r: Omit<Rubric, 'id' | 'createdAt' | 'updatedAt'>) => Rubric;
    addStudent: (s: Omit<Student, 'id'>) => Student;
    addClass: (c: Omit<Class, 'id'>) => Class;
} | null = null;

function ActionHandle() {
    const { addRubric } = useAuthoring();
    const { addStudent, addClass } = useRoster();
    React.useEffect(() => {
        actions = { addRubric, addStudent, addClass };
    });
    return null;
}

function renderWithProvider(...probes: React.ReactElement[]) {
    return render(
        <AppProvider>
            <ActionHandle />
            {probes}
        </AppProvider>
    );
}

const newRubric: Omit<Rubric, 'id' | 'createdAt' | 'updatedAt'> = {
    name: 'Test Rubric',
    subject: 'Math',
    description: 'Desc',
    criteria: [],
    gradeScaleId: 'default-scale',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
};

describe('useStoreSelector', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        actions = null;
    });

    it('re-renders only when a subscribed slice changes, not when unrelated slices change', () => {
        const onStudents = vi.fn();
        const onRubrics = vi.fn();

        // Memoized so a parent re-render alone doesn't re-run the probe — only a changed
        // snapshot (slice) should re-render it.
        const StudentsProbe = React.memo(() => {
            useStoreSelector((s) => s.students);
            onStudents();
            return null;
        });
        const RubricsProbe = React.memo(() => {
            useStoreSelector((s) => s.rubrics);
            onRubrics();
            return null;
        });

        renderWithProvider(<StudentsProbe />, <RubricsProbe />);

        expect(onStudents).toHaveBeenCalledTimes(1);
        expect(onRubrics).toHaveBeenCalledTimes(1);

        // A rubric change must NOT re-render the students-only subscriber.
        act(() => {
            actions!.addRubric(newRubric);
        });
        expect(onRubrics).toHaveBeenCalledTimes(2);
        expect(onStudents).toHaveBeenCalledTimes(1);

        // A student change re-renders the students subscriber, not the rubrics one.
        act(() => {
            actions!.addStudent({ name: 'Alice', classId: 'c1' });
        });
        expect(onStudents).toHaveBeenCalledTimes(2);
        expect(onRubrics).toHaveBeenCalledTimes(2);
    });

    it('keeps an object-literal selector referentially stable until one of its members changes', () => {
        const record = vi.fn();

        function Probe() {
            const [, setTick] = React.useState(0);
            const selection = useStoreSelector((s) => ({ students: s.students, rubrics: s.rubrics }));
            record(selection);
            return <button onClick={() => setTick((t) => t + 1)}>rerender</button>;
        }

        const { getByRole } = renderWithProvider(<Probe />);
        expect(record).toHaveBeenCalledTimes(1);

        // Forced local re-render (no store change): the selection keeps its identity.
        act(() => {
            getByRole('button').click();
        });
        expect(record).toHaveBeenCalledTimes(2);
        expect(record.mock.calls[0][0]).toBe(record.mock.calls[1][0]);

        // Unrelated store slice change: still the same identity (nothing selected moved).
        act(() => {
            actions!.addClass({ name: 'Class A' });
        });
        expect(record).toHaveBeenCalledTimes(2);

        // A member of the selection changes → new identity.
        act(() => {
            actions!.addStudent({ name: 'Alice', classId: 'c1' });
        });
        expect(record).toHaveBeenCalledTimes(3);
        expect(record.mock.calls[1][0]).not.toBe(record.mock.calls[2][0]);
    });

    it('keeps a derived (filtered) selection stable while the underlying collection is unchanged', () => {
        const record = vi.fn();

        function Probe() {
            const selection = useStoreSelector((s) => s.students.filter((st) => !st.archivedAt));
            record(selection);
            return null;
        }

        renderWithProvider(<Probe />);
        expect(record).toHaveBeenCalledTimes(1);

        act(() => {
            actions!.addRubric(newRubric);
        });
        expect(record).toHaveBeenCalledTimes(1);

        act(() => {
            actions!.addStudent({ name: 'Alice', classId: 'c1' });
        });
        expect(record).toHaveBeenCalledTimes(2);
        expect(record.mock.calls[0][0]).not.toBe(record.mock.calls[1][0]);
    });
});
