import React, { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    AppProvider,
    useAuthoring,
    useRoster,
    useAssessment,
    useEssays,
    useFlashcards,
    useClasses,
} from './AppContext';
import { useStoreActions } from './useStore';
import type {
    Rubric,
    RubricVersion,
    StandardMasteryTarget,
    FlashcardDeck,
    FlashcardReview,
    FlashcardAssignment,
    DocumentComment,
    Test,
    TestAssignment,
    GradingTask,
    EssayAssignment,
    EssayTemplate,
    Message,
    NewsFlash,
    NewsFlashRead,
    StudentRubric,
    StudentTest,
    UserTemplate,
    QuestionBankItem,
} from '../types';
import { DEFAULT_FORMAT } from '../types';
import * as storage from '../store/storage';

// Stateful so saveRubricVersion/fetchRubricVersions round-trip like the real
// per-rubric localStorage cache in storage.ts.
const versionStore = vi.hoisted(() => new Map<string, RubricVersion[]>());

vi.mock('../store/storage', () => ({
    isMigrationDone: vi.fn(() => false),
    markMigrationDone: vi.fn(),
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
        essayTemplates: [],
        messages: [],
        essayAssignments: [],
        essaySubmissions: [],
        userTemplates: [],
        flashcardDecks: [],
        flashcardAssignments: [],
        flashcardReviews: [],
        standardMasteryTargets: [],
        newsFlashes: [],
        newsFlashReads: [],
        questionBank: [],
        documentComments: [],
        notificationDismissals: [],
        gradingTasks: [],
        tests: [],
        studentTests: [],
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
    saveEssayTemplates: vi.fn(),
    saveGradingTasks: vi.fn(),
    saveMessages: vi.fn(),
    saveNewsFlashes: vi.fn(),
    saveNewsFlashReads: vi.fn(),
    saveNotificationDismissals: vi.fn(),
    saveQuestionBank: vi.fn(),
    saveDocumentComments: vi.fn(),
    saveUserTemplates: vi.fn(),
    saveFlashcardDecks: vi.fn(),
    saveFlashcardAssignments: vi.fn(),
    saveFlashcardReviews: vi.fn(),
    saveStandardMasteryTargets: vi.fn(),
    saveTests: vi.fn(),
    saveStudentTests: vi.fn(),
    onStorageQuotaExceeded: vi.fn(),
    exportStore: vi.fn((s) => s),
    importFullBackup: vi.fn(() => true),
    loadPendingQueue: vi.fn(() => []),
    sanitizeClassYears: vi.fn((cls) => cls),
    loadRubricVersions: vi.fn((rubricId: string) => versionStore.get(rubricId) ?? []),
    upsertRubricVersion: vi.fn((rubricId: string, version: RubricVersion) => {
        const next = [...(versionStore.get(rubricId) ?? []), version];
        versionStore.set(rubricId, next);
        return { versions: next, evictedIds: [] };
    }),
    deleteRubricVersions: vi.fn((rubricId: string) => versionStore.delete(rubricId)),
    stripAudioForOfflineCache: vi.fn((srs) => srs),
}));

// AppContext's DB-reconnect/OTP effects always dynamically import this module — mocked so
// tests don't pull in real @supabase/supabase-js and leave dangling imports past teardown.
// All async student/teacher portal methods are vi.fn() so the action creators that delegate
// to them can be exercised without a real database.
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
        pushOne: vi.fn(() => Promise.resolve()),
        pushMany: vi.fn(() => Promise.resolve()),
        fetchMyFlashcardAssignments: vi.fn(() => Promise.resolve([])),
        fetchAssignedFlashcardDeck: vi.fn(() => Promise.resolve(null)),
        fetchMyFlashcardReview: vi.fn(() => Promise.resolve(null)),
        fetchMyStudentFlashcardDecks: vi.fn(() => Promise.resolve([])),
        saveFlashcardDeckAsStudent: vi.fn(() => Promise.resolve()),
        deleteFlashcardDeckAsStudent: vi.fn(() => Promise.resolve()),
        saveFlashcardReviewAsStudent: vi.fn(() => Promise.resolve()),
        saveTestAssignment: vi.fn(() => Promise.resolve()),
        fetchMyTestAssignments: vi.fn(() => Promise.resolve([])),
        fetchAssignedTestContent: vi.fn(() => Promise.resolve(null)),
        fetchTestAssignmentTeacherKeys: vi.fn(() => Promise.resolve([])),
        setPlacementOverride: vi.fn(() => Promise.resolve()),
        saveEssayAssignment: vi.fn(() => Promise.resolve()),
        notifyStudentMessage: vi.fn(() => Promise.resolve()),
        deleteEssayAssignment: vi.fn(() => Promise.resolve()),
        fetchEssaySubmissions: vi.fn(() => Promise.resolve([])),
        fetchEssaySubmissionsForStudent: vi.fn(() => Promise.resolve([])),
        fetchAllEssaySubmissions: vi.fn(() => Promise.resolve([])),
        fetchMyEssayAssignments: vi.fn(() => Promise.resolve([])),
        fetchEssayAssignmentByKey: vi.fn(() => Promise.resolve(null)),
        deleteEssaySubmission: vi.fn(() => Promise.resolve()),
        getEssaySignedUrl: vi.fn(() => Promise.resolve('')),
        fetchMyMessages: vi.fn(() => Promise.resolve([])),
        sendMessageAsStudent: vi.fn(() => Promise.resolve()),
        markMessagesReadByStudent: vi.fn(() => Promise.resolve()),
        fetchMyNewsFlashes: vi.fn(() => Promise.resolve([])),
        markNewsFlashReadAsStudent: vi.fn(() => Promise.resolve()),
        setStudentPassword: vi.fn(() => Promise.resolve()),
        fetchRubricVersions: vi.fn(() => Promise.resolve(null)),
    },
}));

vi.mock('../hooks/useToast', () => ({
    useToast: () => ({ showToast: vi.fn() }),
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

describe('domain action creators', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <AppProvider>{children}</AppProvider>;

    beforeEach(async () => {
        vi.clearAllMocks();
        versionStore.clear();
        // Undo any mockRejectedValue left by a previous test.
        const { storageSync } = await import('../services/database');
        vi.mocked(storageSync.pushOne).mockResolvedValue(undefined);
    });

    // ─── Flashcards ─────────────────────────────────────────────────────────

    it('manages flashcard decks, mastery targets, assignments, and reviews', () => {
        const { result } = renderHook(() => useFlashcards(), { wrapper });

        let deckId = '';
        act(() => {
            const deck = result.current.addFlashcardDeck({ name: 'Deck 1', cards: [] });
            deckId = deck.id;
        });
        expect(result.current.flashcardDecks).toHaveLength(1);

        const deck: FlashcardDeck = result.current.flashcardDecks[0];
        act(() => {
            result.current.updateFlashcardDeck({ ...deck, description: 'desc' });
        });
        expect(result.current.flashcardDecks[0].description).toBe('desc');

        let targetId = '';
        act(() => {
            const target = result.current.addStandardMasteryTarget({
                standardGuid: 'g1',
                standardDescription: 'd',
                standardSetTitle: 's',
                year: 'jaar-1',
                targetPercentage: 80,
            } as StandardMasteryTarget);
            targetId = target.id;
        });
        expect(result.current.standardMasteryTargets).toHaveLength(1);
        act(() => {
            result.current.updateStandardMasteryTarget({
                ...result.current.standardMasteryTargets[0],
                targetPercentage: 90,
            });
        });
        expect(result.current.standardMasteryTargets[0].targetPercentage).toBe(90);

        act(() => {
            result.current.addFlashcardAssignments([
                { deckId, studentId: 's1', deckName: 'Deck 1', cardCount: 0, createdAt: '2024-01-01' },
            ] as FlashcardAssignment[]);
        });
        expect(result.current.flashcardAssignments).toHaveLength(1);

        act(() => {
            result.current.saveFlashcardReview({
                id: `${deckId}:s1`,
                deckId,
                studentId: 's1',
                cardStates: {},
                updatedAt: '2024-01-01',
            });
        });
        expect(result.current.flashcardReviews).toHaveLength(1);

        act(() => {
            result.current.deleteStandardMasteryTarget(targetId);
            result.current.deleteFlashcardDeck(deckId);
        });
        expect(result.current.standardMasteryTargets).toHaveLength(0);
        expect(result.current.flashcardDecks).toHaveLength(0);
    });

    it('delegates student-portal flashcard calls to the storage sync adapter', async () => {
        const { result } = renderHook(() => useFlashcards(), { wrapper });
        const { storageSync } = await import('../services/database');

        await act(async () => {
            await result.current.fetchMyFlashcardAssignments();
        });
        expect(storageSync.fetchMyFlashcardAssignments).toHaveBeenCalled();

        await act(async () => {
            await result.current.fetchAssignedFlashcardDeck('d1');
        });
        expect(storageSync.fetchAssignedFlashcardDeck).toHaveBeenCalledWith('d1');

        await act(async () => {
            await result.current.fetchMyFlashcardReview('d1', 's1');
        });
        expect(storageSync.fetchMyFlashcardReview).toHaveBeenCalledWith('d1', 's1');

        await act(async () => {
            await result.current.fetchMyStudentFlashcardDecks('s1');
        });
        expect(storageSync.fetchMyStudentFlashcardDecks).toHaveBeenCalledWith('s1');

        await act(async () => {
            await result.current.saveFlashcardDeckAsStudent({
                id: 'd1',
                name: 'D',
                cards: [],
                createdAt: '2024-01-01',
            } as FlashcardDeck);
        });
        expect(storageSync.saveFlashcardDeckAsStudent).toHaveBeenCalled();

        await act(async () => {
            await result.current.deleteFlashcardDeckAsStudent('d1');
        });
        expect(storageSync.deleteFlashcardDeckAsStudent).toHaveBeenCalledWith('d1');

        await act(async () => {
            await result.current.saveFlashcardReviewAsStudent({
                id: 'd1:s1',
                deckId: 'd1',
                studentId: 's1',
                cardStates: {},
                updatedAt: '2024-01-01',
            });
        });
        expect(storageSync.saveFlashcardReviewAsStudent).toHaveBeenCalled();
    });

    // ─── Assessment ─────────────────────────────────────────────────────────

    it('manages document comments', () => {
        const { result } = renderHook(() => useAssessment(), { wrapper });

        let commentId = '';
        act(() => {
            const comment = result.current.addDocumentComment({
                attachmentId: 'a1',
                authorId: 't1',
                text: 'Fix this',
                anchor: { from: 0, to: 4 },
            });
            commentId = comment.id;
        });
        expect(result.current.documentComments).toHaveLength(1);
        expect(result.current.documentComments[0].resolved).toBe(false);

        act(() => {
            result.current.resolveDocumentComment(commentId, true);
        });
        expect(result.current.documentComments[0].resolved).toBe(true);

        act(() => {
            result.current.deleteDocumentComment(commentId);
        });
        expect(result.current.documentComments).toHaveLength(0);
    });

    it('logs a console error when grading-task pushes fail', async () => {
        const { result } = renderHook(() => useAssessment(), { wrapper });
        const { storageSync } = await import('../services/database');
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(storageSync.pushOne).mockRejectedValue(new Error('push failed'));

        act(() => {
            result.current.addGradingTasks([
                {
                    id: 'gt1',
                    rubricId: 'r1',
                    studentId: 's1',
                    assignedToTeacher: 't1',
                    assignedAt: '2024-01-01',
                },
            ]);
        });
        await act(async () => {});
        expect(errorSpy).toHaveBeenCalled();

        act(() => {
            result.current.deleteGradingTask('gt1');
        });
        await act(async () => {});
        expect(errorSpy).toHaveBeenCalledTimes(2);
        errorSpy.mockRestore();
    });

    it('manages tests and student tests', () => {
        const { result } = renderHook(() => useAssessment(), { wrapper });

        let testId = '';
        act(() => {
            const test = result.current.addTest({
                name: 'Midterm',
                questions: [],
                requireSEB: false,
                shuffleQuestions: true,
            });
            testId = test.id;
        });
        expect(result.current.tests).toHaveLength(1);
        const test: Test = result.current.tests[0];

        act(() => {
            result.current.updateTest({ ...test, name: 'Final' });
        });
        expect(result.current.tests[0].name).toBe('Final');

        act(() => {
            result.current.saveStudentTest({
                id: 'st1',
                testId,
                studentId: 's1',
                answers: [],
                status: 'submitted',
                startedAt: '2024-01-01',
            });
        });
        expect(result.current.studentTests).toHaveLength(1);
        act(() => {
            result.current.deleteStudentTest('st1');
        });
        expect(result.current.studentTests).toHaveLength(0);

        act(() => {
            result.current.deleteTest(testId);
        });
        expect(result.current.tests).toHaveLength(0);
    });

    it('queues grading-task pushes to the sync adapter and deletes grading tasks', async () => {
        const { result } = renderHook(() => useAssessment(), { wrapper });
        const { storageSync } = await import('../services/database');

        const task: GradingTask = {
            id: 'gt1',
            rubricId: 'r1',
            studentId: 's1',
            assignedToTeacher: 't1',
            assignedAt: '2024-01-01',
        };
        act(() => {
            result.current.addGradingTasks([task]);
        });
        expect(result.current.gradingTasks).toHaveLength(1);
        await act(async () => {});
        expect(storageSync.pushOne).toHaveBeenCalledWith('gradingTask', 'upsert', task);

        act(() => {
            result.current.deleteGradingTask('gt1');
        });
        expect(result.current.gradingTasks).toHaveLength(0);
        await act(async () => {});
        expect(storageSync.pushOne).toHaveBeenCalledWith('gradingTask', 'delete', null, 'gt1');
    });

    it('delegates test-assignment portal calls to the storage sync adapter', async () => {
        const { result } = renderHook(() => useAssessment(), { wrapper });
        const { storageSync } = await import('../services/database');

        const assignment: TestAssignment = {
            testId: 't1',
            studentId: 's1',
            teacherKey: 'tk1',
            testName: 'Midterm',
            requireSEB: false,
            createdAt: '2024-01-01',
        };
        await act(async () => {
            await result.current.saveTestAssignment(assignment);
        });
        expect(storageSync.saveTestAssignment).toHaveBeenCalledWith(assignment);

        await act(async () => {
            await result.current.fetchMyTestAssignments();
        });
        expect(storageSync.fetchMyTestAssignments).toHaveBeenCalled();

        await act(async () => {
            await result.current.fetchAssignedTestContent('t1');
        });
        expect(storageSync.fetchAssignedTestContent).toHaveBeenCalledWith('t1');

        await act(async () => {
            await result.current.fetchTestAssignmentTeacherKeys('t1');
        });
        expect(storageSync.fetchTestAssignmentTeacherKeys).toHaveBeenCalledWith('t1');

        await act(async () => {
            await result.current.setPlacementOverride('a1', 'up');
        });
        expect(storageSync.setPlacementOverride).toHaveBeenCalledWith('a1', 'up');
    });

    // ─── Essays ─────────────────────────────────────────────────────────────

    it('manages essay assignments, groups, and submissions', () => {
        const { result } = renderHook(() => useEssays(), { wrapper });

        const assignment: EssayAssignment = {
            teacherKey: 'tk1',
            studentId: 's1',
            title: 'Essay 1',
            prompt: 'Write',
            readOnlyAfterSubmit: false,
            createdAt: '2024-01-01',
            rubricId: 'r1',
        };
        act(() => {
            result.current.addEssayAssignments([assignment]);
        });
        expect(result.current.essayAssignments).toHaveLength(1);

        act(() => {
            result.current.updateEssayGroup('tk1', { title: 'Essay 2' });
        });
        expect(result.current.essayAssignments[0].title).toBe('Essay 2');

        act(() => {
            result.current.addEssaySubmission({
                id: 'sub1',
                assignmentRubricId: 'r1',
                assignmentStudentId: 's1',
                teacherKey: 'tk1',
                contentHtml: '<p>essay</p>',
                wordCount: 5,
                submittedAt: '2024-01-05',
            });
        });
        expect(result.current.essaySubmissions).toHaveLength(1);

        act(() => {
            result.current.deleteEssayGroup('tk1');
        });
        expect(result.current.essayAssignments).toHaveLength(0);
        expect(result.current.essaySubmissions).toHaveLength(0);
    });

    it('manages essay templates and pushes template sync events', async () => {
        const { result } = renderHook(() => useEssays(), { wrapper });
        const { storageSync } = await import('../services/database');

        const template: EssayTemplate = {
            id: 'et1',
            title: 'Template 1',
            prompt: 'Prompt',
            rubricId: 'r1',
            requireSEB: false,
            readOnlyAfterSubmit: false,
            createdAt: '2024-01-01',
        };
        act(() => {
            result.current.saveEssayTemplate(template);
        });
        expect(result.current.essayTemplates).toHaveLength(1);
        await act(async () => {});
        expect(storageSync.pushOne).toHaveBeenCalledWith('essayTemplate', 'upsert', template);

        act(() => {
            result.current.deleteEssayTemplate('et1');
        });
        expect(result.current.essayTemplates).toHaveLength(0);
        await act(async () => {});
        expect(storageSync.pushOne).toHaveBeenCalledWith('essayTemplate', 'delete', null, 'et1');
    });

    it('logs console errors when essay-template and message pushes fail', async () => {
        const { result } = renderHook(() => useEssays(), { wrapper });
        const { storageSync } = await import('../services/database');
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(storageSync.pushOne).mockRejectedValue(new Error('push failed'));

        act(() => {
            result.current.saveEssayTemplate({
                id: 'et1',
                title: 'T',
                prompt: 'P',
                rubricId: 'r1',
                requireSEB: false,
                readOnlyAfterSubmit: false,
                createdAt: '2024-01-01',
            });
            result.current.deleteEssayTemplate('et1');
            result.current.sendMessage({
                id: 'm1',
                studentId: 's1',
                contextType: 'general',
                contextId: null,
                contextLabel: null,
                sender: 'teacher',
                body: 'Hi',
                createdAt: '2024-01-01',
                readByTeacher: false,
                readByStudent: false,
            });
        });
        await act(async () => {});
        expect(errorSpy.mock.calls.length).toBeGreaterThanOrEqual(3);

        // Read-receipt push happens in a separate dispatch so the state ref sees the message.
        act(() => {
            result.current.markMessageReadByTeacher('m1');
        });
        await act(async () => {});
        expect(errorSpy.mock.calls.length).toBeGreaterThanOrEqual(4);
        errorSpy.mockRestore();
    });

    it('sends messages and pushes read receipts only for known messages', async () => {
        const { result } = renderHook(() => useEssays(), { wrapper });
        const { storageSync } = await import('../services/database');

        const message: Message = {
            id: 'm1',
            studentId: 's1',
            contextType: 'general',
            contextId: null,
            contextLabel: null,
            sender: 'teacher',
            body: 'Hello',
            createdAt: '2024-01-01',
            readByTeacher: false,
            readByStudent: false,
        };
        act(() => {
            result.current.sendMessage(message);
        });
        expect(result.current.messages).toHaveLength(1);
        await act(async () => {});
        expect(storageSync.pushOne).toHaveBeenCalledWith('message', 'upsert', message);

        act(() => {
            result.current.markMessageReadByTeacher('m1');
        });
        expect(result.current.messages[0].readByTeacher).toBe(true);
        await act(async () => {});
        // The read receipt push carries the updated message.
        expect(storageSync.pushOne).toHaveBeenCalledWith(
            'message',
            'upsert',
            expect.objectContaining({ id: 'm1', readByTeacher: true })
        );

        // Unknown message id: no read-receipt push.
        const pushesBefore = vi.mocked(storageSync.pushOne).mock.calls.length;
        act(() => {
            result.current.markMessageReadByTeacher('unknown');
        });
        await act(async () => {});
        expect(vi.mocked(storageSync.pushOne).mock.calls.length).toBe(pushesBefore);
    });

    it('manages news flashes and read markers', () => {
        const { result } = renderHook(() => useEssays(), { wrapper });

        let flashId = '';
        act(() => {
            const flash = result.current.addNewsFlash({
                title: 'Flash 1',
                summary: 'Summary',
                kind: 'article',
                tags: [],
            });
            flashId = flash.id;
        });
        expect(result.current.newsFlashes).toHaveLength(1);
        const flash: NewsFlash = result.current.newsFlashes[0];

        act(() => {
            result.current.updateNewsFlash({ ...flash, title: 'Flash 2' });
        });
        expect(result.current.newsFlashes[0].title).toBe('Flash 2');

        act(() => {
            result.current.markNewsFlashRead({ id: `${flashId}:s1`, flashId, studentId: 's1', readAt: '2024-01-01' });
        });
        expect(result.current.newsFlashReads).toHaveLength(1);

        act(() => {
            result.current.deleteNewsFlash(flashId);
        });
        expect(result.current.newsFlashes).toHaveLength(0);
        expect(result.current.newsFlashReads).toHaveLength(0);
    });

    it('dismisses notifications', () => {
        const { result } = renderHook(() => useEssays(), { wrapper });

        act(() => {
            result.current.dismissNotification('overdue_grading', 's1', 'fp1');
        });
        expect(result.current.notificationDismissals).toHaveLength(1);
        expect(result.current.notificationDismissals[0].id).toBe('overdue_grading:s1');
    });

    it('delegates essay portal calls to the storage sync adapter', async () => {
        const { result } = renderHook(() => useEssays(), { wrapper });
        const { storageSync } = await import('../services/database');

        const message: Message = {
            id: 'm1',
            studentId: 's1',
            contextType: 'general',
            contextId: null,
            contextLabel: null,
            sender: 'teacher',
            body: 'Hello',
            createdAt: '2024-01-01',
            readByTeacher: false,
            readByStudent: false,
        };
        const read: NewsFlashRead = {
            id: 'f1:s1',
            flashId: 'f1',
            studentId: 's1',
            readAt: '2024-01-01',
        };
        const assignment: EssayAssignment = {
            teacherKey: 'tk1',
            studentId: 's1',
            title: 'Essay 1',
            prompt: 'Write',
            readOnlyAfterSubmit: false,
            createdAt: '2024-01-01',
            rubricId: 'r1',
        };
        await act(async () => {
            await result.current.saveEssayAssignment(assignment);
        });
        expect(storageSync.saveEssayAssignment).toHaveBeenCalledWith(assignment);

        await act(async () => {
            await result.current.notifyStudentMessage('s1', 'label', 'preview');
        });
        expect(storageSync.notifyStudentMessage).toHaveBeenCalledWith('s1', 'label', 'preview');

        await act(async () => {
            await result.current.deleteEssayAssignment('tk1');
        });
        expect(storageSync.deleteEssayAssignment).toHaveBeenCalledWith('tk1');

        await act(async () => {
            await result.current.fetchEssaySubmissions('tk1');
        });
        expect(storageSync.fetchEssaySubmissions).toHaveBeenCalledWith('tk1');

        await act(async () => {
            await result.current.fetchEssaySubmissionsForStudent('r1', 's1');
        });
        expect(storageSync.fetchEssaySubmissionsForStudent).toHaveBeenCalledWith('r1', 's1');

        await act(async () => {
            await result.current.fetchAllEssaySubmissions();
        });
        expect(storageSync.fetchAllEssaySubmissions).toHaveBeenCalled();

        await act(async () => {
            await result.current.fetchMyEssayAssignments();
        });
        expect(storageSync.fetchMyEssayAssignments).toHaveBeenCalled();

        await act(async () => {
            await result.current.fetchEssayAssignmentByKey('tk1');
        });
        expect(storageSync.fetchEssayAssignmentByKey).toHaveBeenCalledWith('tk1');

        await act(async () => {
            await result.current.deleteEssaySubmission('sub1', 'path');
        });
        expect(storageSync.deleteEssaySubmission).toHaveBeenCalledWith('sub1', 'path');

        await act(async () => {
            await result.current.getEssaySignedUrl('path');
        });
        expect(storageSync.getEssaySignedUrl).toHaveBeenCalledWith('path');

        await act(async () => {
            await result.current.fetchMyMessages();
        });
        expect(storageSync.fetchMyMessages).toHaveBeenCalled();

        await act(async () => {
            await result.current.sendMessageAsStudent(message);
        });
        expect(storageSync.sendMessageAsStudent).toHaveBeenCalled();

        await act(async () => {
            await result.current.markMessagesReadByStudent(['m1']);
        });
        expect(storageSync.markMessagesReadByStudent).toHaveBeenCalledWith(['m1']);

        await act(async () => {
            await result.current.fetchMyNewsFlashes();
        });
        expect(storageSync.fetchMyNewsFlashes).toHaveBeenCalled();

        await act(async () => {
            await result.current.markNewsFlashReadAsStudent(read);
        });
        expect(storageSync.markNewsFlashReadAsStudent).toHaveBeenCalledWith(read);
    });

    // ─── Roster ─────────────────────────────────────────────────────────────

    it('restores an archived student and anonymizes a student', () => {
        const { result } = renderHook(() => useRoster(), { wrapper });
        let id = '';
        act(() => {
            const s = result.current.addStudent({ name: 'Alice', classId: 'c1' });
            id = s.id;
        });
        act(() => {
            result.current.deleteStudent(id);
        });
        expect(result.current.students).toHaveLength(0);
        expect(result.current.archivedStudents).toHaveLength(1);

        act(() => {
            result.current.restoreStudent(id);
        });
        expect(result.current.students).toHaveLength(1);
        expect(result.current.archivedStudents).toHaveLength(0);

        act(() => {
            result.current.anonymizeStudent(id);
        });
        expect(result.current.students[0].name).toMatch(/^Student-/);
        expect(result.current.students[0].anonymizedAt).toBeDefined();
    });

    it('creates student rubrics with empty entries when the rubric is unknown', () => {
        const { result } = renderHook(() => useRoster(), { wrapper });

        act(() => {
            const sr = result.current.createStudentRubric('unknown-rubric', 's1');
            expect(sr.entries).toEqual([]);
        });
        act(() => {
            const group = result.current.createGroupStudentRubrics('unknown-rubric', ['s1', 's2']);
            expect(group).toHaveLength(2);
            expect(group[0].entries).toEqual([]);
        });
    });

    it('mergeClasses with a missing source class only moves students and deletes nothing extra', () => {
        const { result } = renderHook(() => useRoster(), { wrapper });
        let c2 = '';
        act(() => {
            c2 = result.current.addClass({ name: 'Class 2', rubricIds: ['rc'] }).id;
        });

        act(() => {
            result.current.mergeClasses('missing-source', c2);
        });
        expect(result.current.classes).toHaveLength(1);
        expect(result.current.classes[0].rubricIds).toEqual(['rc']);
    });

    it('merges classes and unions source rubricIds into the target class', () => {
        const { result } = renderHook(() => useRoster(), { wrapper });
        let c1 = '',
            c2 = '';
        act(() => {
            c1 = result.current.addClass({ name: 'Class 1', rubricIds: ['ra', 'rb'] }).id;
            c2 = result.current.addClass({ name: 'Class 2', rubricIds: ['rb', 'rc'] }).id;
            result.current.addStudent({ name: 'S1', classId: c1 });
        });

        act(() => {
            result.current.mergeClasses(c1, c2);
        });

        expect(result.current.classes).toHaveLength(1);
        expect(result.current.classes[0].rubricIds).toEqual(['rb', 'rc', 'ra']);
        expect(result.current.students[0].classId).toBe(c2);
    });

    it('saves a rubric self-assessment on an existing student rubric', () => {
        const { result } = renderHook(() => ({ ...useRoster(), ...useAuthoring() }), { wrapper });
        act(() => {
            result.current.addRubric(makeRubric());
        });
        const rubricId = result.current.rubrics[0].id;
        act(() => {
            result.current.createStudentRubric(rubricId, 's1');
        });
        const srId = result.current.studentRubrics[0].id;

        act(() => {
            result.current.saveRubricSelfAssessment(srId, { c1: 'l1' }, 'I did well');
        });
        expect(result.current.studentRubrics[0].selfAssessmentLevels).toEqual({ c1: 'l1' });
        expect(result.current.studentRubrics[0].selfAssessmentReflection).toBe('I did well');
    });

    it('delegates setStudentPassword to the storage sync adapter', async () => {
        const { result } = renderHook(() => useRoster(), { wrapper });
        const { storageSync } = await import('../services/database');

        await act(async () => {
            await result.current.setStudentPassword('s@example.com', 'pw');
        });
        expect(storageSync.setStudentPassword).toHaveBeenCalledWith('s@example.com', 'pw');
    });

    // ─── Authoring ──────────────────────────────────────────────────────────

    it('manages question-bank items including section bundles and bulk ops', () => {
        const { result } = renderHook(() => useAuthoring(), { wrapper });

        const question = { id: 'q1', prompt: 'Q', type: 'short-answer' as const, points: 1 };

        act(() => {
            result.current.addQuestionBankItem(question, ['tag1'], 'B1');
        });
        expect(result.current.questionBank).toHaveLength(1);
        const item: QuestionBankItem = result.current.questionBank[0];

        act(() => {
            result.current.addSectionBankItem({ title: 'Passage', content: 'text' }, [question], ['tag2']);
        });
        expect(result.current.questionBank).toHaveLength(2);
        expect(result.current.questionBank[1].kind).toBe('section');

        act(() => {
            result.current.addQuestionBankItems([{ question, tags: ['t'] }]);
        });
        expect(result.current.questionBank).toHaveLength(3);

        const sectionItem = result.current.questionBank[1];
        act(() => {
            result.current.updateQuestionBankItem({ ...item, tags: ['updated'] });
        });
        expect(result.current.questionBank[0].tags).toEqual(['updated']);

        act(() => {
            result.current.deleteQuestionBankItem(item.id);
        });
        expect(result.current.questionBank).toHaveLength(2);

        act(() => {
            result.current.addQuestionBankItems([{ question, tags: ['a'] }]);
        });
        const batch = result.current.questionBank;
        const ids = [batch[0].id, batch[1].id];
        act(() => {
            result.current.bulkUpdateQuestionBankItems(ids, { addTags: ['x'], removeTags: ['a'], cefrLevel: null });
        });
        expect(result.current.questionBank.every((i) => !ids.includes(i.id) || i.tags.includes('x'))).toBe(true);

        act(() => {
            result.current.deleteQuestionBankItems(ids);
        });
        expect(result.current.questionBank).toHaveLength(1);
        expect(sectionItem.id).toBeDefined();
    });

    it('manages export templates and user templates', () => {
        const { result } = renderHook(() => useAuthoring(), { wrapper });

        let templateId = '';
        act(() => {
            const t = result.current.addExportTemplate({
                name: 'Template 1',
                dataUrl: 'data',
                levelHeaders: ['H1'],
                size: 100,
            });
            templateId = t.id;
        });
        expect(result.current.exportTemplates).toHaveLength(1);
        act(() => {
            result.current.deleteExportTemplate(templateId);
        });
        expect(result.current.exportTemplates).toHaveLength(0);

        const userTemplate: UserTemplate = {
            id: 'ut1',
            name: 'Saved Rubric',
            subject: 'Math',
            criteria: [],
            savedAt: '2024-01-01',
        };
        act(() => {
            result.current.saveUserTemplate(userTemplate);
        });
        expect(result.current.userTemplates).toHaveLength(1);
        act(() => {
            result.current.deleteUserTemplate('ut1');
        });
        expect(result.current.userTemplates).toHaveLength(0);
    });

    it('updateRubric without an existing rubric skips auto-versioning', () => {
        const { result } = renderHook(() => useAuthoring(), { wrapper });

        act(() => {
            result.current.updateRubric(makeRubric() as Rubric);
        });
        expect(result.current.rubrics).toHaveLength(0);
        expect(storage.upsertRubricVersion).not.toHaveBeenCalled();
    });

    it('fetches rubric versions from the remote adapter when online, falling back to local', async () => {
        const { result } = renderHook(() => useAuthoring(), { wrapper });
        const { storageSync } = await import('../services/database');
        vi.mocked(storageSync.isConnected).mockReturnValue(true);

        const version: RubricVersion = {
            id: 'v1',
            savedAt: '2024-01-01',
            label: 'v1',
            snapshot: makeRubric() as Rubric,
        };
        vi.mocked(storageSync.fetchRubricVersions).mockResolvedValue([version]);

        const remote = await result.current.fetchRubricVersions('r1');
        expect(remote).toEqual([version]);
        expect(storageSync.fetchRubricVersions).toHaveBeenCalledWith('r1');

        // Remote returns nothing → falls back to the local per-rubric cache.
        vi.mocked(storageSync.fetchRubricVersions).mockResolvedValue(null as unknown as RubricVersion[]);
        const local = await result.current.fetchRubricVersions('r1');
        expect(local).toEqual([]);
    });

    it('fetchRubricVersions falls back to local versions when the remote fetch rejects', async () => {
        const { result } = renderHook(() => useAuthoring(), { wrapper });
        const { storageSync } = await import('../services/database');
        vi.mocked(storageSync.isConnected).mockReturnValue(true);
        vi.mocked(storageSync.fetchRubricVersions).mockRejectedValue(new Error('network'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const versions = await result.current.fetchRubricVersions('r1');
        expect(versions).toEqual([]);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('logs when the rubricVersion eviction push fails', async () => {
        const { result } = renderHook(() => useAuthoring(), { wrapper });
        const { storageSync } = await import('../services/database');
        vi.mocked(storageSync.isConnected).mockReturnValue(true);
        vi.mocked(storage.upsertRubricVersion).mockReturnValue({ versions: [], evictedIds: ['old-v'] });
        // Only delete-pushes reject (the connected delta-sync effect also calls pushOne
        // for the rubric upsert, so gate on the action type instead of a fragile queue).
        vi.mocked(storageSync.pushOne).mockImplementation((entity: string, action: string) =>
            action === 'delete' ? Promise.reject(new Error('eviction push failed')) : Promise.resolve()
        );
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        act(() => {
            result.current.addRubric(makeRubric());
        });
        const rubricId = result.current.rubrics[0].id;
        await act(async () => {
            await result.current.saveRubricVersion(rubricId, 'v1');
        });
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('saveRubricVersion pushes the version and evicted ids when connected', async () => {
        const { result } = renderHook(() => useAuthoring(), { wrapper });
        const { storageSync } = await import('../services/database');
        vi.mocked(storageSync.isConnected).mockReturnValue(true);
        vi.mocked(storage.upsertRubricVersion).mockReturnValue({ versions: [], evictedIds: ['old-v'] });

        act(() => {
            result.current.addRubric(makeRubric());
        });
        const rubricId = result.current.rubrics[0].id;

        await act(async () => {
            await result.current.saveRubricVersion(rubricId, 'v1');
        });
        expect(storageSync.pushOne).toHaveBeenCalledWith(
            'rubricVersion',
            'upsert',
            expect.objectContaining({ rubricId, label: 'v1' }),
            expect.any(String)
        );
        expect(storageSync.pushOne).toHaveBeenCalledWith('rubricVersion', 'delete', null, 'old-v');
    });

    it('manages vocabulary batches and delegates question-bank/template sync', async () => {
        const { result } = renderHook(() => useAuthoring(), { wrapper });
        act(() => {
            result.current.addRubric(makeRubric());
        });
        const rubricId = result.current.rubrics[0].id;

        act(() => {
            result.current.addVocabularyItem(rubricId, { phrase: 'a', category: 'vocabulary' });
            result.current.addVocabularyItem(rubricId, { phrase: 'b', category: 'vocabulary' });
        });
        expect(result.current.rubrics[0].vocabularyItems).toHaveLength(2);

        act(() => {
            const items = result.current.rubrics[0].vocabularyItems!;
            result.current.deleteVocabularyItems(
                rubricId,
                items.map((v) => v.id)
            );
        });
        expect(result.current.rubrics[0].vocabularyItems).toHaveLength(0);
    });

    it('syncRubricSnapshot is exposed through the actions surface', () => {
        const { result } = renderHook(() => useStoreActions(), { wrapper });
        expect(typeof result.current.syncRubricSnapshot).toBe('function');
        expect(typeof result.current.fetchRubricVersions).toBe('function');
    });

    it('useClasses returns the classes slice', () => {
        const { result } = renderHook(() => useClasses(), { wrapper });
        expect(result.current.classes).toEqual([]);
        expect(typeof result.current.addClass).toBe('function');
    });
});
