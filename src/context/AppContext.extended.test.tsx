import React, { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppProvider, useApp } from './AppContext';
import type { Rubric, RubricVersion } from '../types';
import { DEFAULT_FORMAT } from '../types';

// Stateful so saveRubricVersion/fetchRubricVersions round-trip like the real
// per-rubric localStorage cache in storage.ts. vi.hoisted so the vi.mock
// factory below (itself hoisted above imports) can reference it safely.
const versionStore = vi.hoisted(() => new Map<string, RubricVersion[]>());

vi.mock('../store/storage', () => ({
    loadStore: vi.fn(() => ({
        rubrics: [],
        students: [],
        classes: [],
        studentRubrics: [],
        attachments: [],
        gradeScales: [{ id: 'gs1', name: 'Default', type: 'letter', ranges: [] }],
        settings: {
            defaultGradeScaleId: 'gs1',
            theme: 'dark',
            language: 'en',
            accentColor: '#3b82f6',
            defaultFormat: DEFAULT_FORMAT,
        },
        favoriteStandards: [],
        commentBank: [],
        exportTemplates: [],
        peerReviews: [],
        selfAssessments: [],
        speakingSessions: [],
        analysisResults: [],
    })),
    saveRubrics: vi.fn(),
    saveStudents: vi.fn(),
    saveClasses: vi.fn(),
    saveStudentRubrics: vi.fn(),
    saveAttachments: vi.fn(),
    saveGradeScales: vi.fn(),
    saveCommentSnippets: vi.fn(),
    saveSettings: vi.fn(),
    saveFavoriteStandards: vi.fn(),
    saveCommentBank: vi.fn(),
    saveExportTemplates: vi.fn(),
    savePeerReviews: vi.fn(),
    onStorageQuotaExceeded: vi.fn(),
    saveSelfAssessments: vi.fn(),
    saveSpeakingSessions: vi.fn(),
    saveAnalysisResults: vi.fn(),
    exportStore: vi.fn((s) => s),
    importFullBackup: vi.fn(() => true),
    loadRubricVersions: vi.fn((rubricId: string) => versionStore.get(rubricId) ?? []),
    upsertRubricVersion: vi.fn((rubricId: string, version: RubricVersion) => {
        const next = [...(versionStore.get(rubricId) ?? []), version];
        versionStore.set(rubricId, next);
        return { versions: next, evictedIds: [] };
    }),
    deleteRubricVersions: vi.fn((rubricId: string) => versionStore.delete(rubricId)),
}));

// AppContext's DB-reconnect/OTP effects always dynamically import this module — mocked so
// tests don't pull in real @supabase/supabase-js and leave dangling imports past teardown.
vi.mock('../services/database', () => ({
    storageSync: {
        isConnected: () => false,
        getCurrentUserId: () => null,
        adapter: { getClient: () => null },
        onNetworkReconnect: () => () => {},
        onAuthChange: () => () => {},
        configure: () => Promise.resolve(false),
        setToastFn: () => {},
        hydrate: () => Promise.resolve({ data: null, error: null }),
        didWipeLocalData: () => false,
    },
}));

vi.mock('@azure/msal-react', () => ({
    useMsal: vi.fn(() => ({ instance: {}, accounts: [] })),
    useIsAuthenticated: vi.fn(() => false),
}));

vi.mock('../services/msalConfig', () => ({
    msalInstance: { getActiveAccount: vi.fn() },
    loginRequest: {},
}));

vi.mock('../services/microsoftGraph', () => ({
    graphService: {
        getUserProfile: vi.fn(),
        uploadFile: vi.fn(),
        downloadFile: vi.fn(),
    },
}));

const makeRubric = (): Omit<Rubric, 'id' | 'createdAt' | 'updatedAt'> => ({
    name: 'R1',
    subject: 'English',
    description: '',
    criteria: [{ id: 'c1', title: 'C1', description: '', weight: 100, levels: [] }],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
});

describe('AppContext — extended actions', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <AppProvider>{children}</AppProvider>;

    beforeEach(() => {
        vi.clearAllMocks();
        versionStore.clear();
    });

    // ─── Students & Classes ───────────────────────────────────────────────────

    it('adds and deletes a student', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        let id: string;
        act(() => {
            const s = result.current.addStudent({ name: 'Bob', classId: 'c1' });
            id = s.id;
        });
        expect(result.current.students[0].name).toBe('Bob');
        act(() => {
            result.current.deleteStudent(id!);
        });
        expect(result.current.students).toHaveLength(0);
    });

    it('updates a student', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        act(() => {
            result.current.addStudent({ name: 'Bob', classId: 'c1' });
        });
        act(() => {
            result.current.updateStudent({ ...result.current.students[0], name: 'Bobby' });
        });
        expect(result.current.students[0].name).toBe('Bobby');
    });

    it('adds, updates, and deletes a class', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        act(() => {
            result.current.addClass({ name: 'Class A' });
        });
        const cls = result.current.classes[0];
        act(() => {
            result.current.updateClass({ ...cls, name: 'Class B' });
        });
        expect(result.current.classes[0].name).toBe('Class B');
        act(() => {
            result.current.deleteClass(cls.id);
        });
        expect(result.current.classes).toHaveLength(0);
    });

    it('deleteClass with deleteStudents=true removes students in that class', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        act(() => {
            result.current.addClass({ name: 'Class A' });
        });
        const cls = result.current.classes[0];
        act(() => {
            result.current.addStudent({ name: 'Alice', classId: cls.id });
        });
        expect(result.current.students).toHaveLength(1);
        act(() => {
            result.current.deleteClass(cls.id, true);
        });
        expect(result.current.students).toHaveLength(0);
    });

    // ─── Self Assessments ─────────────────────────────────────────────────────

    it('saves and deletes a self assessment', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        const sa = { id: 'sa1', rubricId: 'r1', studentId: 's1', ratings: [], submittedAt: '2024-01-01' };
        act(() => {
            result.current.saveSelfAssessment(sa);
        });
        expect(result.current.selfAssessments[0].id).toBe('sa1');
        act(() => {
            result.current.deleteSelfAssessment('sa1');
        });
        expect(result.current.selfAssessments).toHaveLength(0);
    });

    // ─── Speaking Sessions ────────────────────────────────────────────────────

    it('saves and updates a speaking session', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        const session = {
            id: 'ss1',
            rubricId: 'r1',
            studentId: 's1',
            criteria: [],
            overallComment: '',
            gradedAt: '2024-01-01',
        } as any;
        act(() => {
            result.current.saveSpeakingSession(session);
        });
        expect(result.current.speakingSessions[0].id).toBe('ss1');
        act(() => {
            result.current.saveSpeakingSession({ ...session, overallComment: 'Updated' });
        });
        expect(result.current.speakingSessions[0].overallComment).toBe('Updated');
    });

    it('deletes a speaking session', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        const session = {
            id: 'ss1',
            rubricId: 'r1',
            studentId: 's1',
            criteria: [],
            overallComment: '',
            gradedAt: '2024-01-01',
        } as any;
        act(() => {
            result.current.saveSpeakingSession(session);
        });
        act(() => {
            result.current.deleteSpeakingSession('ss1');
        });
        expect(result.current.speakingSessions).toHaveLength(0);
    });

    // ─── Rubric Versioning ────────────────────────────────────────────────────

    it('saves a rubric version', async () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        act(() => {
            result.current.addRubric(makeRubric());
        });
        const rubricId = result.current.rubrics[0].id;
        await act(async () => {
            await result.current.saveRubricVersion(rubricId, 'v1');
        });
        const versions = await result.current.fetchRubricVersions(rubricId);
        expect(versions).toHaveLength(1);
        expect(versions[0].label).toBe('v1');
    });

    it('restores a rubric version', async () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        act(() => {
            result.current.addRubric(makeRubric());
        });
        const rubricId = result.current.rubrics[0].id;
        await act(async () => {
            await result.current.saveRubricVersion(rubricId, 'v1');
        });
        act(() => {
            result.current.updateRubric({ ...result.current.rubrics[0], name: 'Modified' });
        });
        const [version] = await result.current.fetchRubricVersions(rubricId);
        act(() => {
            result.current.restoreRubricVersion(rubricId, version.snapshot);
        });
        expect(result.current.rubrics[0].name).toBe('R1');
        // Restoring snapshots the pre-restore ("Modified") state too, so that's
        // itself recoverable rather than only reachable via an intervening edit.
        const versionsAfterRestore = await result.current.fetchRubricVersions(rubricId);
        expect(versionsAfterRestore.some((v) => v.snapshot.name === 'Modified')).toBe(true);
    });

    it('saveRubricVersion does nothing for unknown rubricId', async () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        await act(async () => {
            await result.current.saveRubricVersion('unknown');
        });
        expect(result.current.rubrics).toHaveLength(0);
        expect(await result.current.fetchRubricVersions('unknown')).toEqual([]);
    });

    it('restoreRubricVersion does nothing for unknown rubricId', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        act(() => {
            result.current.restoreRubricVersion('unknown', makeRubric() as Rubric);
        });
        expect(result.current.rubrics).toHaveLength(0);
    });

    // ─── Rubric Snapshot Sync ─────────────────────────────────────────────────

    it('syncRubricSnapshot updates student rubrics with new criteria', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        act(() => {
            result.current.addRubric(makeRubric());
        });
        const rubric = result.current.rubrics[0];
        act(() => {
            result.current.addStudent({ name: 'Alice', classId: 'c1' });
        });
        act(() => {
            result.current.createStudentRubric(rubric.id, result.current.students[0].id);
        });

        const updatedRubric = {
            ...rubric,
            criteria: [
                ...rubric.criteria,
                { id: 'c2', title: 'New Criterion', description: '', weight: 50, levels: [] },
            ],
        };
        act(() => {
            result.current.syncRubricSnapshot(rubric.id, updatedRubric);
        });

        const sr = result.current.studentRubrics[0];
        expect(sr.rubricSnapshot?.criteria).toHaveLength(2);
        expect(sr.entries.some((e) => e.criterionId === 'c2')).toBe(true);
    });

    // ─── Soft-delete grades (Phase 15.3) ─────────────────────────────────────

    it('deleteStudentRubric soft-deletes a solo grade and restoreStudentRubric brings it back', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        act(() => {
            result.current.addRubric(makeRubric());
        });
        const rubricId = result.current.rubrics[0].id;
        act(() => {
            result.current.addStudent({ name: 'Alice', classId: 'c1' });
        });
        act(() => {
            result.current.createStudentRubric(rubricId, result.current.students[0].id);
        });
        const srId = result.current.studentRubrics[0].id;

        act(() => {
            result.current.deleteStudentRubric(srId, 'student');
        });
        expect(result.current.studentRubrics).toHaveLength(0);
        expect(result.current.deletedStudentRubrics).toHaveLength(1);
        expect(result.current.deletedStudentRubrics[0].deletedAt).toBeDefined();

        act(() => {
            result.current.restoreStudentRubric(srId);
        });
        expect(result.current.studentRubrics).toHaveLength(1);
        expect(result.current.deletedStudentRubrics).toHaveLength(0);
    });

    it('deleteStudentRubric with scope "group" soft-deletes every sibling sharing groupId', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        act(() => {
            result.current.addRubric(makeRubric());
        });
        const rubricId = result.current.rubrics[0].id;
        act(() => {
            result.current.addStudent({ name: 'Alice', classId: 'c1' });
            result.current.addStudent({ name: 'Bob', classId: 'c1' });
        });
        const studentIds = result.current.students.map((s) => s.id);
        act(() => {
            result.current.createGroupStudentRubrics(rubricId, studentIds);
        });
        const [srA] = result.current.studentRubrics;

        act(() => {
            result.current.deleteStudentRubric(srA.id, 'group');
        });
        expect(result.current.studentRubrics).toHaveLength(0);
        expect(result.current.deletedStudentRubrics).toHaveLength(2);
    });

    it('deleteStudentRubric with scope "student" only removes the target and detaches it from the group', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        act(() => {
            result.current.addRubric(makeRubric());
        });
        const rubricId = result.current.rubrics[0].id;
        act(() => {
            result.current.addStudent({ name: 'Alice', classId: 'c1' });
            result.current.addStudent({ name: 'Bob', classId: 'c1' });
        });
        const studentIds = result.current.students.map((s) => s.id);
        act(() => {
            result.current.createGroupStudentRubrics(rubricId, studentIds);
        });
        const [srA, srB] = result.current.studentRubrics;

        act(() => {
            result.current.deleteStudentRubric(srA.id, 'student');
        });
        expect(result.current.studentRubrics).toHaveLength(1);
        expect(result.current.studentRubrics[0].id).toBe(srB.id);
        expect(result.current.studentRubrics[0].groupId).toBe(srB.groupId);
        expect(result.current.deletedStudentRubrics).toHaveLength(1);
        expect(result.current.deletedStudentRubrics[0].groupId).toBeUndefined();
    });

    // ─── Vocabulary Items ─────────────────────────────────────────────────────

    it('adds, updates, and deletes vocabulary items', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        act(() => {
            result.current.addRubric(makeRubric());
        });
        const rubricId = result.current.rubrics[0].id;

        let itemId: string;
        act(() => {
            const item = result.current.addVocabularyItem(rubricId, { phrase: 'test', category: 'vocabulary' });
            itemId = item.id;
        });
        expect(result.current.rubrics[0].vocabularyItems).toHaveLength(1);

        act(() => {
            result.current.updateVocabularyItem(rubricId, { id: itemId!, phrase: 'updated', category: 'grammar' });
        });
        expect(result.current.rubrics[0].vocabularyItems![0].phrase).toBe('updated');

        act(() => {
            result.current.deleteVocabularyItem(rubricId, itemId!);
        });
        expect(result.current.rubrics[0].vocabularyItems).toHaveLength(0);
    });

    // ─── Analysis Results ─────────────────────────────────────────────────────

    it('saves and deletes analysis results', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        const ar = {
            id: 'ar1',
            studentId: 's1',
            rubricId: 'r1',
            attachmentId: 'a1',
            extractedText: 'text',
            analyzedAt: '2024-01-01',
            detectedItems: [],
            grammarErrors: [],
            grammarCheckerUsed: 'none' as const,
        };
        act(() => {
            result.current.saveAnalysisResult(ar);
        });
        expect(result.current.analysisResults[0].id).toBe('ar1');

        // Save again (update path)
        act(() => {
            result.current.saveAnalysisResult({ ...ar, extractedText: 'updated' });
        });
        expect(result.current.analysisResults).toHaveLength(1);
        expect(result.current.analysisResults[0].extractedText).toBe('updated');

        act(() => {
            result.current.deleteAnalysisResult('ar1');
        });
        expect(result.current.analysisResults).toHaveLength(0);
    });
});
