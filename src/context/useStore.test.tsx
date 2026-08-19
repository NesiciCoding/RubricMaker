import React from 'react';
import { render, renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppProvider, useAuthoring, useRoster, useSettings } from './AppContext';
import { createSelectorStore, StoreProvider, useStore, useStoreActions, useStoreSelector } from './useStore';
import type { StoreData } from '../store/storage';
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
        onRealtimeChange: () => () => {},
        onAuthChange: () => () => {},
        configure: () => Promise.resolve(false),
        setToastFn: () => {},
        hydrate: () => Promise.resolve({ data: null, error: null }),
        hydratePartial: () => Promise.resolve({ data: null, fullFallback: false }),
        hasSession: () => false,
        initAuth: () => Promise.resolve(),
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

    it('returns a fresh selection when the selected object shape changes even if all values are undefined', () => {
        // Regression: the shallow-compare must verify key ownership, not just value reads —
        // otherwise { x: undefined } and { y: undefined } (different keys, equal counts) would
        // compare equal and the stale cached shape would leak to the new selection.
        const record = vi.fn();

        function Probe() {
            const [pickY, setPickY] = React.useState(false);
            const selection = useStoreSelector<{ x?: undefined } | { y?: undefined }>(
                pickY ? (s) => ({ y: undefined }) : (s) => ({ x: undefined })
            );
            record(selection);
            return <button onClick={() => setPickY(true)}>pickY</button>;
        }

        const { getByRole } = renderWithProvider(<Probe />);
        expect(record).toHaveBeenCalledTimes(1);
        expect(record.mock.calls[0][0]).toEqual({ x: undefined });

        act(() => {
            getByRole('button').click();
        });
        expect(record).toHaveBeenCalledTimes(2);
        expect(record.mock.calls[1][0]).toEqual({ y: undefined });
        expect(record.mock.calls[1][0]).not.toBe(record.mock.calls[0][0]);
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

describe('useStore', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        actions = null;
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it('returns the selector store when rendered inside StoreProvider', () => {
        const store = createSelectorStore(
            () => ({}) as StoreData,
            () => {}
        );
        const { result } = renderHook(() => useStore(), {
            wrapper: ({ children }) => <StoreProvider store={store}>{children}</StoreProvider>,
        });
        expect(result.current.getState).toBeDefined();
        expect(result.current.dispatch).toBeDefined();
        expect(typeof result.current.subscribe).toBe('function');
        expect(typeof result.current.notify).toBe('function');
    });

    it('throws when used outside StoreProvider', () => {
        expect(() => renderHook(() => useStore())).toThrow('useStore must be used within AppProvider');
    });

    it('throws when useStoreSelector is used outside StoreProvider', () => {
        expect(() => renderHook(() => useStoreSelector((s) => s))).toThrow(
            'useStoreSelector must be used within AppProvider'
        );
    });

    it('throws when useStoreActions is used outside StoreActionsProvider', () => {
        expect(() => renderHook(() => useStoreActions())).toThrow('useStoreActions must be used within AppProvider');
    });
});

describe('useStoreActions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        actions = null;
    });

    it('keeps a stable identity across unrelated dispatches and forced re-renders', () => {
        const record = vi.fn();

        // Actions read fresh state via getState() at call time, so the aggregated actions
        // object is memoized on the stable actions ctx and must never change identity —
        // action-only consumers therefore re-render on nothing.
        function Probe() {
            const [, setTick] = React.useState(0);
            const storeActions = useStoreActions();
            record(storeActions);
            return <button onClick={() => setTick((t) => t + 1)}>rerender</button>;
        }

        const { getByRole } = renderWithProvider(<Probe />);
        expect(record).toHaveBeenCalledTimes(1);
        const first = record.mock.calls[0][0];
        expect(first).toBeDefined();

        // An action-only consumer does not re-render at all on an unrelated dispatch —
        // the actions context value is stable, so React bails on every re-render.
        act(() => {
            actions!.addRubric(newRubric);
        });
        expect(record).toHaveBeenCalledTimes(1);

        // Forced local re-render: still the same identity.
        act(() => {
            getByRole('button').click();
        });
        expect(record).toHaveBeenCalledTimes(2);
        expect(record.mock.calls[1][0]).toBe(first);

        // Another unrelated dispatch, then a forced re-render: still stable.
        act(() => {
            actions!.addStudent({ name: 'Alice', classId: 'c1' });
        });
        act(() => {
            getByRole('button').click();
        });
        expect(record).toHaveBeenCalledTimes(3);
        expect(record.mock.calls[2][0]).toBe(first);

        // The actions surface spans every store domain (spot-check).
        expect(typeof first.addStudent).toBe('function');
        expect(typeof first.updateSettings).toBe('function');
        expect(typeof first.saveStudentRubric).toBe('function');
        expect(typeof first.getEssaySignedUrl).toBe('function');
        expect(typeof first.saveAnalysisResult).toBe('function');
    });
});

describe('useStoreSelector — primitive selections', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        actions = null;
    });

    it('re-renders when a primitive (non-object) selection changes', () => {
        // Regression for the shallow-compare's non-object branch: a numeric selection
        // (e.g. students.length) is not an object, so Object.is() can't match after a
        // real change — the shallow-compare must return false and the new value must be
        // served even though both sides are primitives.
        const record = vi.fn();

        function CountProbe() {
            const count = useStoreSelector((s) => s.students.length);
            record(count);
            return <div data-testid="count">{count}</div>;
        }

        renderWithProvider(<CountProbe />);
        expect(record).toHaveBeenLastCalledWith(0);

        act(() => {
            actions!.addStudent({ name: 'Alice', classId: 'c1' });
        });
        expect(record).toHaveBeenLastCalledWith(1);
        expect(record).toHaveBeenCalledTimes(2);

        act(() => {
            actions!.addStudent({ name: 'Bob', classId: 'c1' });
        });
        expect(record).toHaveBeenLastCalledWith(2);
    });

    it('getActiveGradeScale falls back to the first scale when the default id is unknown', () => {
        // Covers the `?? gradeScales[0]` fallback in createSettingsActions.
        const { result } = renderHook(() => useSettings(), {
            wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
        });

        act(() => {
            result.current.updateSettings({ defaultGradeScaleId: 'does-not-exist' });
        });

        let scale: { id: string } | undefined;
        act(() => {
            scale = result.current.getActiveGradeScale();
        });
        expect(scale?.id).toBe('default-scale');
    });
});
