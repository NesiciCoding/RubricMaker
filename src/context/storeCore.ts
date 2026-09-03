import React, { useContext } from 'react';
import type {
    AppSettings,
    Attachment,
    CefrLevel,
    Class,
    CommentBankItem,
    DocumentAnalysisResult,
    DocumentComment,
    EssayAssignment,
    EssaySubmission,
    EssayTemplate,
    ExportTemplate,
    FlashcardAssignment,
    FlashcardDeck,
    FlashcardReview,
    GradeScale,
    GradingTask,
    LinkedStandard,
    Message,
    NewsFlash,
    NewsFlashRead,
    NotificationDismissal,
    NotificationDismissalType,
    QuestionBankItem,
    QuestionBankSkill,
    Rubric,
    RubricVersion,
    SelfAssessment,
    SpeakingSession,
    StandardMasteryTarget,
    Student,
    StudentRubric,
    StudentTest,
    Test,
    TestAssignment,
    TestQuestion,
    UserRole,
    UserTemplate,
    VocabularyItem,
} from '../types';
import {
    StoreData,
    deleteRubricVersions,
    saveAnalysisResults,
    saveAttachments,
    saveClasses,
    saveCommentBank,
    saveDocumentComments,
    saveEssayAssignments,
    saveEssaySubmissions,
    saveEssayTemplates,
    saveExportTemplates,
    saveFavoriteStandards,
    saveFlashcardAssignments,
    saveFlashcardDecks,
    saveFlashcardReviews,
    saveGradeScales,
    saveGradingTasks,
    saveMessages,
    saveNewsFlashReads,
    saveNewsFlashes,
    saveNotificationDismissals,
    savePeerReviews,
    saveQuestionBank,
    saveRubrics,
    saveSelfAssessments,
    saveSettings,
    saveSpeakingSessions,
    saveStandardMasteryTargets,
    saveStudentRubrics,
    saveStudentTests,
    saveStudents,
    saveTests,
    saveUserTemplates,
    stripAudioForOfflineCache,
    upsertRubricVersion,
} from '../store/storage';
import { nanoid } from '../utils/nanoid';
import { getDb, loadDb } from '../services/database/lazyDb';
import type { DatabaseConfig, DbUser, SyncResult } from '../services/database';
import { STRESS_TEST_LOGGING_ENABLED, logEvent } from '../services/logging/clientLogger';
export type { StoreData } from '../store/storage';

export interface StoreActionsCtx {
    getState: () => StoreData;
    dispatch: React.Dispatch<Action>;
}

export interface PlatformCtx extends StoreActionsCtx {
    showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
    t: (key: string, options?: Record<string, unknown>) => string;
    setLandingState: (s: 'checking' | 'show' | 'hide') => void;
    setShowMigrationPrompt: (b: boolean) => void;
    applyHydrated: (merged: StoreData, seedDiffBaseline: boolean) => void;
}

export type Action =
    | { type: 'SET_ALL'; payload: StoreData }
    | { type: 'ADD_RUBRIC'; payload: Rubric }
    | { type: 'UPDATE_RUBRIC'; payload: Rubric }
    | { type: 'DELETE_RUBRIC'; id: string }
    | { type: 'ADD_STUDENT'; payload: Student }
    | { type: 'UPDATE_STUDENT'; payload: Student }
    | { type: 'DELETE_STUDENT'; id: string }
    | { type: 'RESTORE_STUDENT'; id: string }
    | { type: 'ADD_CLASS'; payload: Class }
    | { type: 'UPDATE_CLASS'; payload: Class }
    | { type: 'DELETE_CLASS'; id: string }
    | { type: 'SAVE_STUDENT_RUBRIC'; payload: StudentRubric }
    | { type: 'DELETE_STUDENT_RUBRIC'; id: string; scope: 'student' | 'group' }
    | { type: 'RESTORE_STUDENT_RUBRIC'; id: string }
    | { type: 'SAVE_RUBRIC_SELF_ASSESSMENT'; id: string; levels: Record<string, string | null>; reflection: string }
    | { type: 'ANONYMIZE_STUDENT'; id: string }
    | { type: 'ADD_ATTACHMENT'; payload: Attachment }
    | { type: 'DELETE_ATTACHMENT'; id: string }
    | { type: 'ADD_GRADE_SCALE'; payload: GradeScale }
    | { type: 'UPDATE_GRADE_SCALE'; payload: GradeScale }
    | { type: 'DELETE_GRADE_SCALE'; id: string }
    | { type: 'UPDATE_SETTINGS'; payload: Partial<AppSettings> }
    | { type: 'ADD_FAVORITE_STANDARD'; payload: LinkedStandard }
    | { type: 'REMOVE_FAVORITE_STANDARD'; guid: string }
    | { type: 'ADD_COMMENT_BANK_ITEM'; payload: CommentBankItem }
    | { type: 'UPDATE_COMMENT_BANK_ITEM'; payload: CommentBankItem }
    | { type: 'DELETE_COMMENT_BANK_ITEM'; id: string }
    | { type: 'RECORD_COMMENT_BANK_USAGE'; id: string }
    | { type: 'ADD_EXPORT_TEMPLATE'; payload: ExportTemplate }
    | { type: 'DELETE_EXPORT_TEMPLATE'; id: string }
    | { type: 'SAVE_PEER_REVIEW'; payload: StudentRubric }
    | { type: 'DELETE_PEER_REVIEW'; id: string }
    | { type: 'SAVE_SELF_ASSESSMENT'; payload: SelfAssessment }
    | { type: 'DELETE_SELF_ASSESSMENT'; id: string }
    | { type: 'SAVE_SPEAKING_SESSION'; payload: SpeakingSession }
    | { type: 'DELETE_SPEAKING_SESSION'; id: string }
    | { type: 'SYNC_RUBRIC_SNAPSHOT'; rubricId: string; updatedRubric: Rubric }
    | { type: 'RESTORE_RUBRIC_VERSION'; rubricId: string; snapshot: Rubric }
    | { type: 'ADD_VOCABULARY_ITEM'; rubricId: string; payload: VocabularyItem }
    | { type: 'UPDATE_VOCABULARY_ITEM'; rubricId: string; payload: VocabularyItem }
    | { type: 'DELETE_VOCABULARY_ITEM'; rubricId: string; itemId: string }
    | { type: 'DELETE_VOCABULARY_ITEMS_BATCH'; rubricId: string; itemIds: string[] }
    | { type: 'SAVE_ANALYSIS_RESULT'; payload: DocumentAnalysisResult }
    | { type: 'DELETE_ANALYSIS_RESULT'; id: string }
    | { type: 'ADD_TEST'; payload: Test }
    | { type: 'UPDATE_TEST'; payload: Test }
    | { type: 'DELETE_TEST'; id: string }
    | { type: 'SAVE_STUDENT_TEST'; payload: StudentTest }
    | { type: 'DELETE_STUDENT_TEST'; id: string }
    | { type: 'ADD_ESSAY_ASSIGNMENTS'; payload: EssayAssignment[] }
    | { type: 'UPDATE_ESSAY_GROUP'; teacherKey: string; patch: Partial<EssayAssignment> }
    | { type: 'DELETE_ESSAY_GROUP'; teacherKey: string }
    | { type: 'ADD_ESSAY_SUBMISSION'; payload: EssaySubmission }
    | { type: 'SAVE_ESSAY_TEMPLATE'; payload: EssayTemplate }
    | { type: 'DELETE_ESSAY_TEMPLATE'; id: string }
    | { type: 'ADD_GRADING_TASKS'; payload: GradingTask[] }
    | { type: 'DELETE_GRADING_TASK'; id: string }
    | { type: 'SEND_MESSAGE'; payload: Message }
    | { type: 'MARK_MESSAGE_READ_BY_TEACHER'; id: string }
    | { type: 'ADD_FLASHCARD_DECK'; payload: FlashcardDeck }
    | { type: 'UPDATE_FLASHCARD_DECK'; payload: FlashcardDeck }
    | { type: 'DELETE_FLASHCARD_DECK'; id: string }
    | { type: 'ADD_STANDARD_MASTERY_TARGET'; payload: StandardMasteryTarget }
    | { type: 'UPDATE_STANDARD_MASTERY_TARGET'; payload: StandardMasteryTarget }
    | { type: 'DELETE_STANDARD_MASTERY_TARGET'; id: string }
    | { type: 'ADD_FLASHCARD_ASSIGNMENTS'; payload: FlashcardAssignment[] }
    | { type: 'SAVE_FLASHCARD_REVIEW'; payload: FlashcardReview }
    | { type: 'ADD_NEWS_FLASH'; payload: NewsFlash }
    | { type: 'UPDATE_NEWS_FLASH'; payload: NewsFlash }
    | { type: 'DELETE_NEWS_FLASH'; id: string }
    | { type: 'SAVE_NEWS_FLASH_READ'; payload: NewsFlashRead }
    | { type: 'SAVE_USER_TEMPLATE'; payload: UserTemplate }
    | { type: 'DELETE_USER_TEMPLATE'; id: string }
    | { type: 'ADD_QUESTION_BANK_ITEM'; payload: QuestionBankItem }
    | { type: 'ADD_QUESTION_BANK_ITEMS'; payload: QuestionBankItem[] }
    | { type: 'UPDATE_QUESTION_BANK_ITEM'; payload: QuestionBankItem }
    | { type: 'DELETE_QUESTION_BANK_ITEM'; id: string }
    | { type: 'DELETE_QUESTION_BANK_ITEMS'; ids: string[] }
    | {
          type: 'BULK_UPDATE_QUESTION_BANK_ITEMS';
          ids: string[];
          patch: {
              addTags?: string[];
              removeTags?: string[];
              cefrLevel?: CefrLevel | null;
              cefrSkill?: QuestionBankSkill | null;
          };
      }
    | { type: 'ADD_DOCUMENT_COMMENT'; payload: DocumentComment }
    | { type: 'RESOLVE_DOCUMENT_COMMENT'; id: string; resolved: boolean }
    | { type: 'DELETE_DOCUMENT_COMMENT'; id: string }
    | { type: 'DISMISS_NOTIFICATION'; payload: NotificationDismissal };

export type StorageSyncInstance = Awaited<ReturnType<typeof loadDb>>['storageSync'];

export function isOffline(): boolean {
    return !navigator.onLine || !(getDb()?.storageSync.isConnected() ?? false);
}

export function recordAutoVersion(rubric: Rubric): void {
    const version: RubricVersion = {
        id: nanoid(),
        savedAt: new Date().toISOString(),
        label: 'auto:',
        snapshot: rubric,
    };
    const { evictedIds } = upsertRubricVersion(rubric.id, version);
    const db = getDb();
    if (db?.storageSync.isConnected()) {
        void db.storageSync.pushOne('rubricVersion', 'upsert', { ...version, rubricId: rubric.id }, version.id);
        for (const evictedId of evictedIds) void db.storageSync.pushOne('rubricVersion', 'delete', null, evictedId);
    }
}

export function reducer(state: StoreData, action: Action): StoreData {
    switch (action.type) {
        case 'SET_ALL':
            return action.payload;
        case 'ADD_RUBRIC': {
            const next = [...state.rubrics, action.payload];
            if (isOffline()) saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'UPDATE_RUBRIC': {
            // Auto-versioning happens in the `updateRubric` action creator, not here —
            // see recordAutoVersion's comment for why it can't safely live in the reducer.
            const next = state.rubrics.map((r) => (r.id === action.payload.id ? action.payload : r));
            if (isOffline()) saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'DELETE_RUBRIC': {
            const next = state.rubrics.filter((r) => r.id !== action.id);
            if (isOffline()) saveRubrics(next);
            deleteRubricVersions(action.id);
            return { ...state, rubrics: next };
        }
        case 'ADD_STUDENT': {
            const next = [...state.students, { ...action.payload, updatedAt: new Date().toISOString() }];
            if (isOffline()) saveStudents(next);
            return { ...state, students: next };
        }
        case 'UPDATE_STUDENT': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const next = state.students.map((s) => (s.id === payload.id ? payload : s));
            if (isOffline()) saveStudents(next);
            return { ...state, students: next };
        }
        case 'DELETE_STUDENT': {
            const next = state.students.map((s) =>
                s.id === action.id
                    ? { ...s, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
                    : s
            );
            if (isOffline()) saveStudents(next);
            return { ...state, students: next };
        }
        case 'RESTORE_STUDENT': {
            const next = state.students.map((s) =>
                s.id === action.id ? { ...s, archivedAt: undefined, updatedAt: new Date().toISOString() } : s
            );
            if (isOffline()) saveStudents(next);
            return { ...state, students: next };
        }
        case 'ANONYMIZE_STUDENT': {
            const next = state.students.map((s) => {
                if (s.id !== action.id) return s;
                return {
                    ...s,
                    name: `Student-${s.id.slice(0, 8)}`,
                    email: undefined,
                    studentNumber: undefined,
                    anonymizedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };
            });
            if (isOffline()) saveStudents(next);
            return { ...state, students: next };
        }
        case 'ADD_CLASS': {
            const next = [...state.classes, { ...action.payload, updatedAt: new Date().toISOString() }];
            if (isOffline()) saveClasses(next);
            return { ...state, classes: next };
        }
        case 'UPDATE_CLASS': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const next = state.classes.map((c) => (c.id === payload.id ? payload : c));
            if (isOffline()) saveClasses(next);
            return { ...state, classes: next };
        }
        case 'DELETE_CLASS': {
            const next = state.classes.filter((c) => c.id !== action.id);
            if (isOffline()) saveClasses(next);
            return { ...state, classes: next };
        }
        case 'SAVE_STUDENT_RUBRIC': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const exists = state.studentRubrics.findIndex((sr) => sr.id === payload.id);
            let next =
                exists >= 0
                    ? state.studentRubrics.map((sr) => (sr.id === payload.id ? payload : sr))
                    : [...state.studentRubrics, payload];
            // Group grading: saving any member of a group fans its entries out to every sibling
            // sharing groupId, scoped per criterion by RubricCriterion.collaborative (unset/true =
            // fan out, false = stays individually scored per student).
            if (payload.groupId) {
                const rubric = state.rubrics.find((r) => r.id === payload.rubricId);
                const collaborativeIds = new Set(
                    (rubric?.criteria ?? []).filter((c) => c.collaborative !== false).map((c) => c.id)
                );
                next = next.map((sr) => {
                    if (sr.groupId !== payload.groupId || sr.id === payload.id) return sr;
                    const mergedEntries = payload.entries.map((entry) =>
                        collaborativeIds.has(entry.criterionId)
                            ? entry
                            : (sr.entries.find((e) => e.criterionId === entry.criterionId) ?? entry)
                    );
                    return {
                        ...sr,
                        entries: mergedEntries,
                        globalModifier: payload.globalModifier,
                        overallComment: payload.overallComment,
                        rubricSnapshot: payload.rubricSnapshot,
                        gradedAt: payload.gradedAt,
                        updatedAt: payload.updatedAt,
                    };
                });
            }
            if (isOffline()) saveStudentRubrics(next);
            return { ...state, studentRubrics: next };
        }
        case 'DELETE_STUDENT_RUBRIC': {
            const target = state.studentRubrics.find((sr) => sr.id === action.id);
            const deletedAt = new Date().toISOString();
            const next = state.studentRubrics.map((sr) => {
                if (sr.id === action.id) {
                    return {
                        ...sr,
                        deletedAt,
                        updatedAt: deletedAt,
                        groupId: action.scope === 'student' ? undefined : sr.groupId,
                    };
                }
                if (action.scope === 'group' && target?.groupId && sr.groupId === target.groupId) {
                    return { ...sr, deletedAt, updatedAt: deletedAt };
                }
                return sr;
            });
            if (isOffline()) saveStudentRubrics(next);
            return { ...state, studentRubrics: next };
        }
        case 'RESTORE_STUDENT_RUBRIC': {
            const next = state.studentRubrics.map((sr) =>
                sr.id === action.id ? { ...sr, deletedAt: undefined, updatedAt: new Date().toISOString() } : sr
            );
            if (isOffline()) saveStudentRubrics(next);
            return { ...state, studentRubrics: next };
        }
        case 'SAVE_RUBRIC_SELF_ASSESSMENT': {
            const existing = state.studentRubrics.find((sr) => sr.id === action.id);
            if (!existing) return state;
            const updated = {
                ...existing,
                selfAssessmentLevels: action.levels,
                selfAssessmentReflection: action.reflection,
                selfAssessedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            const next = state.studentRubrics.map((sr) => (sr.id === action.id ? updated : sr));
            if (isOffline()) saveStudentRubrics(next);
            return { ...state, studentRubrics: next };
        }
        case 'ADD_ATTACHMENT': {
            const next = [...state.attachments, action.payload];
            if (isOffline()) saveAttachments(next);
            return { ...state, attachments: next };
        }
        case 'DELETE_ATTACHMENT': {
            const next = state.attachments.filter((a) => a.id !== action.id);
            if (isOffline()) saveAttachments(next);
            return { ...state, attachments: next };
        }
        case 'ADD_GRADE_SCALE': {
            const next = [...state.gradeScales, { ...action.payload, updatedAt: new Date().toISOString() }];
            if (isOffline()) saveGradeScales(next);
            return { ...state, gradeScales: next };
        }
        case 'UPDATE_GRADE_SCALE': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const next = state.gradeScales.map((gs) => (gs.id === payload.id ? payload : gs));
            if (isOffline()) saveGradeScales(next);
            return { ...state, gradeScales: next };
        }
        case 'DELETE_GRADE_SCALE': {
            // Keep the collection non-empty: getActiveGradeScale falls back to the first
            // scale, so an app with zero scales has no active scale to grade against.
            if (state.gradeScales.length <= 1) return state;
            const next = state.gradeScales.filter((gs) => gs.id !== action.id);
            if (isOffline()) saveGradeScales(next);
            return { ...state, gradeScales: next };
        }
        case 'UPDATE_SETTINGS': {
            const next = { ...state.settings, ...action.payload };
            if (isOffline()) saveSettings(next);
            return { ...state, settings: next };
        }
        case 'ADD_FAVORITE_STANDARD': {
            if (state.favoriteStandards.some((s) => s.guid === action.payload.guid)) return state;
            const next = [...state.favoriteStandards, action.payload];
            if (isOffline()) saveFavoriteStandards(next);
            return { ...state, favoriteStandards: next };
        }
        case 'REMOVE_FAVORITE_STANDARD': {
            const next = state.favoriteStandards.filter((s) => s.guid !== action.guid);
            if (isOffline()) saveFavoriteStandards(next);
            return { ...state, favoriteStandards: next };
        }
        case 'ADD_COMMENT_BANK_ITEM': {
            const next = [...state.commentBank, { ...action.payload, updatedAt: new Date().toISOString() }];
            if (isOffline()) saveCommentBank(next);
            return { ...state, commentBank: next };
        }
        case 'UPDATE_COMMENT_BANK_ITEM': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const next = state.commentBank.map((i) => (i.id === payload.id ? payload : i));
            if (isOffline()) saveCommentBank(next);
            return { ...state, commentBank: next };
        }
        case 'DELETE_COMMENT_BANK_ITEM': {
            const next = state.commentBank.filter((i) => i.id !== action.id);
            if (isOffline()) saveCommentBank(next);
            return { ...state, commentBank: next };
        }
        case 'RECORD_COMMENT_BANK_USAGE': {
            const now = new Date().toISOString();
            const next = state.commentBank.map((i) =>
                i.id === action.id ? { ...i, usageCount: (i.usageCount ?? 0) + 1, lastUsedAt: now, updatedAt: now } : i
            );
            if (isOffline()) saveCommentBank(next);
            return { ...state, commentBank: next };
        }
        case 'ADD_EXPORT_TEMPLATE': {
            const next = [...state.exportTemplates, action.payload];
            if (isOffline()) saveExportTemplates(next);
            return { ...state, exportTemplates: next };
        }
        case 'DELETE_EXPORT_TEMPLATE': {
            const next = state.exportTemplates.filter((t) => t.id !== action.id);
            if (isOffline()) saveExportTemplates(next);
            return { ...state, exportTemplates: next };
        }
        case 'SAVE_PEER_REVIEW': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const exists = state.peerReviews.findIndex((sr) => sr.id === payload.id);
            const next =
                exists >= 0
                    ? state.peerReviews.map((sr) => (sr.id === payload.id ? payload : sr))
                    : [...state.peerReviews, payload];
            if (isOffline()) savePeerReviews(next);
            return { ...state, peerReviews: next };
        }
        case 'DELETE_PEER_REVIEW': {
            const next = state.peerReviews.filter((sr) => sr.id !== action.id);
            if (isOffline()) savePeerReviews(next);
            return { ...state, peerReviews: next };
        }
        case 'SAVE_SELF_ASSESSMENT': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const exists = state.selfAssessments.findIndex((sa) => sa.id === payload.id);
            const next =
                exists >= 0
                    ? state.selfAssessments.map((sa) => (sa.id === payload.id ? payload : sa))
                    : [...state.selfAssessments, payload];
            if (isOffline()) saveSelfAssessments(next);
            return { ...state, selfAssessments: next };
        }
        case 'DELETE_SELF_ASSESSMENT': {
            const next = state.selfAssessments.filter((sa) => sa.id !== action.id);
            if (isOffline()) saveSelfAssessments(next);
            return { ...state, selfAssessments: next };
        }
        case 'SAVE_SPEAKING_SESSION': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const existing = state.speakingSessions.find((s) => s.id === payload.id);
            const next = existing
                ? state.speakingSessions.map((s) => (s.id === payload.id ? payload : s))
                : [...state.speakingSessions, payload];
            if (isOffline()) saveSpeakingSessions(next);
            return { ...state, speakingSessions: next };
        }
        case 'DELETE_SPEAKING_SESSION': {
            const next = state.speakingSessions.filter((s) => s.id !== action.id);
            if (isOffline()) saveSpeakingSessions(next);
            return { ...state, speakingSessions: next };
        }
        case 'SYNC_RUBRIC_SNAPSHOT': {
            const { rubricId, updatedRubric } = action;
            const makeEntry = (c: Rubric['criteria'][0]) => ({
                criterionId: c.id,
                levelId: null as null,
                comment: '',
                checkedSubItems: [] as string[],
            });
            const syncSr = (sr: StudentRubric): StudentRubric => {
                if (sr.rubricId !== rubricId) return sr;
                const newEntries = updatedRubric.criteria
                    .filter((c) => !sr.entries.find((e) => e.criterionId === c.id))
                    .map(makeEntry);
                return { ...sr, rubricSnapshot: updatedRubric, entries: [...sr.entries, ...newEntries] };
            };
            const nextSRs = state.studentRubrics.map(syncSr);
            if (isOffline()) saveStudentRubrics(nextSRs);
            const nextPRs = state.peerReviews.map(syncSr);
            if (isOffline()) savePeerReviews(nextPRs);
            return { ...state, studentRubrics: nextSRs, peerReviews: nextPRs };
        }
        case 'RESTORE_RUBRIC_VERSION': {
            const rubric = state.rubrics.find((r) => r.id === action.rubricId);
            if (!rubric) return state;
            const restored: Rubric = { ...action.snapshot, updatedAt: new Date().toISOString() };
            const next = state.rubrics.map((r) => (r.id === action.rubricId ? restored : r));
            if (isOffline()) saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'ADD_VOCABULARY_ITEM': {
            const next = state.rubrics.map((r) => {
                if (r.id !== action.rubricId) return r;
                return { ...r, vocabularyItems: [...(r.vocabularyItems ?? []), action.payload] };
            });
            if (isOffline()) saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'UPDATE_VOCABULARY_ITEM': {
            const next = state.rubrics.map((r) => {
                if (r.id !== action.rubricId) return r;
                return {
                    ...r,
                    vocabularyItems: (r.vocabularyItems ?? []).map((v) =>
                        v.id === action.payload.id ? action.payload : v
                    ),
                };
            });
            if (isOffline()) saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'DELETE_VOCABULARY_ITEM': {
            const next = state.rubrics.map((r) => {
                if (r.id !== action.rubricId) return r;
                return { ...r, vocabularyItems: (r.vocabularyItems ?? []).filter((v) => v.id !== action.itemId) };
            });
            if (isOffline()) saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'DELETE_VOCABULARY_ITEMS_BATCH': {
            const idSet = new Set(action.itemIds);
            const next = state.rubrics.map((r) => {
                if (r.id !== action.rubricId) return r;
                return { ...r, vocabularyItems: (r.vocabularyItems ?? []).filter((v) => !idSet.has(v.id)) };
            });
            if (isOffline()) saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'SAVE_ANALYSIS_RESULT': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const exists = state.analysisResults.findIndex((r) => r.id === payload.id);
            const next =
                exists >= 0
                    ? state.analysisResults.map((r) => (r.id === payload.id ? payload : r))
                    : [...state.analysisResults, payload];
            if (isOffline()) saveAnalysisResults(next);
            return { ...state, analysisResults: next };
        }
        case 'DELETE_ANALYSIS_RESULT': {
            const next = state.analysisResults.filter((r) => r.id !== action.id);
            if (isOffline()) saveAnalysisResults(next);
            return { ...state, analysisResults: next };
        }
        case 'ADD_TEST': {
            const next = [...state.tests, action.payload];
            if (isOffline()) saveTests(next);
            return { ...state, tests: next };
        }
        case 'UPDATE_TEST': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const next = state.tests.map((t) => (t.id === payload.id ? payload : t));
            if (isOffline()) saveTests(next);
            return { ...state, tests: next };
        }
        case 'DELETE_TEST': {
            const next = state.tests.filter((t) => t.id !== action.id);
            if (isOffline()) saveTests(next);
            const nextStudentTests = state.studentTests.filter((st) => st.testId !== action.id);
            if (isOffline()) saveStudentTests(nextStudentTests);
            return { ...state, tests: next, studentTests: nextStudentTests };
        }
        case 'SAVE_STUDENT_TEST': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const exists = state.studentTests.findIndex((st) => st.id === payload.id);
            const next =
                exists >= 0
                    ? state.studentTests.map((st) => (st.id === payload.id ? payload : st))
                    : [...state.studentTests, payload];
            if (isOffline()) saveStudentTests(next);
            return { ...state, studentTests: next };
        }
        case 'DELETE_STUDENT_TEST': {
            const next = state.studentTests.filter((st) => st.id !== action.id);
            if (isOffline()) saveStudentTests(next);
            return { ...state, studentTests: next };
        }
        case 'ADD_ESSAY_ASSIGNMENTS': {
            const next = [...state.essayAssignments, ...action.payload];
            if (isOffline()) saveEssayAssignments(next);
            return { ...state, essayAssignments: next };
        }
        case 'UPDATE_ESSAY_GROUP': {
            const next = state.essayAssignments.map((a) =>
                a.teacherKey === action.teacherKey ? { ...a, ...action.patch } : a
            );
            if (isOffline()) saveEssayAssignments(next);
            return { ...state, essayAssignments: next };
        }
        case 'DELETE_ESSAY_GROUP': {
            const nextAssignments = state.essayAssignments.filter((a) => a.teacherKey !== action.teacherKey);
            const nextSubmissions = state.essaySubmissions.filter((s) => s.teacherKey !== action.teacherKey);
            if (isOffline()) {
                saveEssayAssignments(nextAssignments);
                saveEssaySubmissions(nextSubmissions);
            }
            return { ...state, essayAssignments: nextAssignments, essaySubmissions: nextSubmissions };
        }
        case 'ADD_ESSAY_SUBMISSION': {
            const exists = state.essaySubmissions.findIndex(
                (s) =>
                    s.teacherKey === action.payload.teacherKey &&
                    s.assignmentStudentId === action.payload.assignmentStudentId
            );
            const next =
                exists >= 0
                    ? state.essaySubmissions.map((s, i) => (i === exists ? action.payload : s))
                    : [...state.essaySubmissions, action.payload];
            if (isOffline()) saveEssaySubmissions(next);
            return { ...state, essaySubmissions: next };
        }
        case 'SAVE_ESSAY_TEMPLATE': {
            const exists = state.essayTemplates.findIndex((t) => t.id === action.payload.id);
            const next =
                exists >= 0
                    ? state.essayTemplates.map((t) => (t.id === action.payload.id ? action.payload : t))
                    : [...state.essayTemplates, action.payload];
            if (isOffline()) saveEssayTemplates(next);
            return { ...state, essayTemplates: next };
        }
        case 'DELETE_ESSAY_TEMPLATE': {
            const next = state.essayTemplates.filter((t) => t.id !== action.id);
            if (isOffline()) saveEssayTemplates(next);
            return { ...state, essayTemplates: next };
        }
        case 'ADD_GRADING_TASKS': {
            const byId = new Map(state.gradingTasks.map((task) => [task.id, task]));
            for (const task of action.payload) byId.set(task.id, task);
            const next = Array.from(byId.values());
            if (isOffline()) saveGradingTasks(next);
            return { ...state, gradingTasks: next };
        }
        case 'DELETE_GRADING_TASK': {
            const next = state.gradingTasks.filter((task) => task.id !== action.id);
            if (isOffline()) saveGradingTasks(next);
            return { ...state, gradingTasks: next };
        }
        case 'SEND_MESSAGE': {
            const exists = state.messages.findIndex((m) => m.id === action.payload.id);
            const next =
                exists >= 0
                    ? state.messages.map((m) => (m.id === action.payload.id ? action.payload : m))
                    : [...state.messages, action.payload];
            if (isOffline()) saveMessages(next);
            return { ...state, messages: next };
        }
        case 'MARK_MESSAGE_READ_BY_TEACHER': {
            const next = state.messages.map((m) => (m.id === action.id ? { ...m, readByTeacher: true } : m));
            if (isOffline()) saveMessages(next);
            return { ...state, messages: next };
        }
        case 'ADD_FLASHCARD_DECK': {
            const next = [...state.flashcardDecks, action.payload];
            if (isOffline()) saveFlashcardDecks(next);
            return { ...state, flashcardDecks: next };
        }
        case 'UPDATE_FLASHCARD_DECK': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const next = state.flashcardDecks.map((d) => (d.id === payload.id ? payload : d));
            if (isOffline()) saveFlashcardDecks(next);
            return { ...state, flashcardDecks: next };
        }
        case 'DELETE_FLASHCARD_DECK': {
            const next = state.flashcardDecks.filter((d) => d.id !== action.id);
            if (isOffline()) saveFlashcardDecks(next);
            const nextAssignments = state.flashcardAssignments.filter((a) => a.deckId !== action.id);
            if (isOffline()) saveFlashcardAssignments(nextAssignments);
            const nextReviews = state.flashcardReviews.filter((r) => r.deckId !== action.id);
            if (isOffline()) saveFlashcardReviews(nextReviews);
            return {
                ...state,
                flashcardDecks: next,
                flashcardAssignments: nextAssignments,
                flashcardReviews: nextReviews,
            };
        }
        case 'ADD_STANDARD_MASTERY_TARGET': {
            const next = [...state.standardMasteryTargets, action.payload];
            if (isOffline()) saveStandardMasteryTargets(next);
            return { ...state, standardMasteryTargets: next };
        }
        case 'UPDATE_STANDARD_MASTERY_TARGET': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const next = state.standardMasteryTargets.map((t) => (t.id === payload.id ? payload : t));
            if (isOffline()) saveStandardMasteryTargets(next);
            return { ...state, standardMasteryTargets: next };
        }
        case 'DELETE_STANDARD_MASTERY_TARGET': {
            const next = state.standardMasteryTargets.filter((t) => t.id !== action.id);
            if (isOffline()) saveStandardMasteryTargets(next);
            return { ...state, standardMasteryTargets: next };
        }
        case 'ADD_FLASHCARD_ASSIGNMENTS': {
            const incoming = new Set(action.payload.map((a) => `${a.deckId}:${a.studentId}`));
            const next = [
                ...state.flashcardAssignments.filter((a) => !incoming.has(`${a.deckId}:${a.studentId}`)),
                ...action.payload,
            ];
            if (isOffline()) saveFlashcardAssignments(next);
            return { ...state, flashcardAssignments: next };
        }
        case 'SAVE_FLASHCARD_REVIEW': {
            const exists = state.flashcardReviews.findIndex((r) => r.id === action.payload.id);
            const next =
                exists >= 0
                    ? state.flashcardReviews.map((r) => (r.id === action.payload.id ? action.payload : r))
                    : [...state.flashcardReviews, action.payload];
            if (isOffline()) saveFlashcardReviews(next);
            return { ...state, flashcardReviews: next };
        }
        case 'ADD_NEWS_FLASH': {
            const next = [...state.newsFlashes, action.payload];
            if (isOffline()) saveNewsFlashes(next);
            return { ...state, newsFlashes: next };
        }
        case 'UPDATE_NEWS_FLASH': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const next = state.newsFlashes.map((f) => (f.id === payload.id ? payload : f));
            if (isOffline()) saveNewsFlashes(next);
            return { ...state, newsFlashes: next };
        }
        case 'DELETE_NEWS_FLASH': {
            const next = state.newsFlashes.filter((f) => f.id !== action.id);
            if (isOffline()) saveNewsFlashes(next);
            const nextReads = state.newsFlashReads.filter((r) => r.flashId !== action.id);
            if (isOffline()) saveNewsFlashReads(nextReads);
            return { ...state, newsFlashes: next, newsFlashReads: nextReads };
        }
        case 'SAVE_NEWS_FLASH_READ': {
            const exists = state.newsFlashReads.findIndex((r) => r.id === action.payload.id);
            const next =
                exists >= 0
                    ? state.newsFlashReads.map((r) => (r.id === action.payload.id ? action.payload : r))
                    : [...state.newsFlashReads, action.payload];
            if (isOffline()) saveNewsFlashReads(next);
            return { ...state, newsFlashReads: next };
        }
        case 'SAVE_USER_TEMPLATE': {
            // No cap here — this array is now the sync source of truth, diffed against
            // Supabase (see the delta-sync effect below). Evicting an entry would look
            // like a delete to that diff and get pushed as one, silently deleting the
            // teacher's oldest saved template from the cloud and every other device.
            const filtered = state.userTemplates.filter((ut) => ut.id !== action.payload.id);
            const next = [action.payload, ...filtered];
            if (isOffline()) saveUserTemplates(next);
            return { ...state, userTemplates: next };
        }
        case 'DELETE_USER_TEMPLATE': {
            const next = state.userTemplates.filter((ut) => ut.id !== action.id);
            if (isOffline()) saveUserTemplates(next);
            return { ...state, userTemplates: next };
        }
        case 'ADD_QUESTION_BANK_ITEM': {
            const next = [...state.questionBank, { ...action.payload, updatedAt: new Date().toISOString() }];
            if (isOffline()) saveQuestionBank(next);
            return { ...state, questionBank: next };
        }
        case 'ADD_QUESTION_BANK_ITEMS': {
            const now = new Date().toISOString();
            const next = [...state.questionBank, ...action.payload.map((item) => ({ ...item, updatedAt: now }))];
            if (isOffline()) saveQuestionBank(next);
            return { ...state, questionBank: next };
        }
        case 'UPDATE_QUESTION_BANK_ITEM': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const next = state.questionBank.map((i) => (i.id === payload.id ? payload : i));
            if (isOffline()) saveQuestionBank(next);
            return { ...state, questionBank: next };
        }
        case 'DELETE_QUESTION_BANK_ITEM': {
            const next = state.questionBank.filter((i) => i.id !== action.id);
            if (isOffline()) saveQuestionBank(next);
            return { ...state, questionBank: next };
        }
        case 'DELETE_QUESTION_BANK_ITEMS': {
            const idSet = new Set(action.ids);
            const next = state.questionBank.filter((i) => !idSet.has(i.id));
            if (isOffline()) saveQuestionBank(next);
            return { ...state, questionBank: next };
        }
        case 'ADD_DOCUMENT_COMMENT': {
            const next = [...state.documentComments, action.payload];
            if (isOffline()) saveDocumentComments(next);
            return { ...state, documentComments: next };
        }
        case 'RESOLVE_DOCUMENT_COMMENT': {
            const next = state.documentComments.map((c) =>
                c.id === action.id ? { ...c, resolved: action.resolved, updatedAt: new Date().toISOString() } : c
            );
            if (isOffline()) saveDocumentComments(next);
            return { ...state, documentComments: next };
        }
        case 'DELETE_DOCUMENT_COMMENT': {
            const next = state.documentComments.filter((c) => c.id !== action.id);
            if (isOffline()) saveDocumentComments(next);
            return { ...state, documentComments: next };
        }
        case 'DISMISS_NOTIFICATION': {
            const exists = state.notificationDismissals.findIndex((d) => d.id === action.payload.id);
            const next =
                exists >= 0
                    ? state.notificationDismissals.map((d) => (d.id === action.payload.id ? action.payload : d))
                    : [...state.notificationDismissals, action.payload];
            if (isOffline()) saveNotificationDismissals(next);
            return { ...state, notificationDismissals: next };
        }
        case 'BULK_UPDATE_QUESTION_BANK_ITEMS': {
            const idSet = new Set(action.ids);
            const now = new Date().toISOString();
            const { addTags, removeTags, cefrLevel, cefrSkill } = action.patch;
            const next = state.questionBank.map((i) => {
                if (!idSet.has(i.id)) return i;
                let tags = i.tags;
                if (addTags?.length) tags = Array.from(new Set([...tags, ...addTags]));
                if (removeTags?.length) tags = tags.filter((tag) => !removeTags.includes(tag));
                return {
                    ...i,
                    tags,
                    cefrLevel: cefrLevel === null ? undefined : (cefrLevel ?? i.cefrLevel),
                    cefrSkill: cefrSkill === null ? undefined : (cefrSkill ?? i.cefrSkill),
                    updatedAt: now,
                };
            });
            if (isOffline()) saveQuestionBank(next);
            return { ...state, questionBank: next };
        }
        default:
            return state;
    }
}

export function summarizeAction(action: Action): Record<string, unknown> {
    const a = action as unknown as Record<string, unknown>;
    const summary: Record<string, unknown> = {};
    const payload = a.payload as Record<string, unknown> | undefined;
    if (payload && typeof payload === 'object' && 'id' in payload) summary.id = payload.id;
    for (const key of ['id', 'rubricId', 'studentId', 'itemId', 'itemIds', 'versionIndex']) {
        if (key in a) summary[key] = Array.isArray(a[key]) ? (a[key] as unknown[]).length : a[key];
    }
    return summary;
}

export function loggingReducer(state: StoreData, action: Action): StoreData {
    // Only enabled via VITE_STRESS_TEST_LOGGING=true at build time; never on in tests/prod.
    /* v8 ignore next */
    if (STRESS_TEST_LOGGING_ENABLED) {
        logEvent('action', action.type, summarizeAction(action));
    }
    return reducer(state, action);
}

export interface AppContextValue extends StoreData {
    dispatch: React.Dispatch<Action>;
    // Convenience helpers
    addRubric: (r: Omit<Rubric, 'id' | 'createdAt' | 'updatedAt'>) => Rubric;
    updateRubric: (r: Rubric) => void;
    deleteRubric: (id: string) => void;
    addStudent: (s: Omit<Student, 'id'>) => Student;
    updateStudent: (s: Student) => void;
    deleteStudent: (id: string) => void;
    restoreStudent: (id: string) => void;
    archivedStudents: Student[];
    addClass: (c: Omit<Class, 'id'>) => Class;
    updateClass: (c: Class) => void;
    deleteClass: (id: string, deleteStudents?: boolean) => void;
    mergeClasses: (sourceClassId: string, targetClassId: string) => void;
    saveStudentRubric: (sr: StudentRubric) => void;
    saveRubricSelfAssessment: (id: string, levels: Record<string, string | null>, reflection: string) => void;
    createStudentRubric: (rubricId: string, studentId: string) => StudentRubric;
    createGroupStudentRubrics: (rubricId: string, studentIds: string[]) => StudentRubric[];
    deleteStudentRubric: (id: string, scope: 'student' | 'group') => void;
    restoreStudentRubric: (id: string) => void;
    /** Soft-deleted grades (Phase 15.3), surfaced for a "recently deleted" restore view; excluded from `studentRubrics`. */
    deletedStudentRubrics: StudentRubric[];
    addAttachment: (a: Omit<Attachment, 'id' | 'addedAt'>) => Attachment;
    deleteAttachment: (id: string) => void;
    addGradeScale: (gs: Omit<GradeScale, 'id'>) => GradeScale;
    updateGradeScale: (gs: GradeScale) => void;
    deleteGradeScale: (id: string) => void;
    updateSettings: (s: Partial<AppSettings>) => void;
    getActiveGradeScale: () => GradeScale;
    addFavoriteStandard: (s: LinkedStandard) => void;
    removeFavoriteStandard: (guid: string) => void;
    isFavoriteStandard: (guid: string) => boolean;
    addCommentBankItem: (text: string, tags: string[]) => CommentBankItem;
    updateCommentBankItem: (item: CommentBankItem) => void;
    deleteCommentBankItem: (id: string) => void;
    recordCommentBankUsage: (id: string) => void;
    addQuestionBankItem: (
        question: Omit<TestQuestion, 'sectionId'>,
        tags: string[],
        cefrLevel?: CefrLevel
    ) => QuestionBankItem;
    addSectionBankItem: (
        section: Pick<NonNullable<QuestionBankItem['section']>, 'title' | 'content' | 'audioUrl'>,
        questions: Omit<TestQuestion, 'sectionId'>[],
        tags: string[],
        cefrLevel?: CefrLevel
    ) => QuestionBankItem;
    addQuestionBankItems: (
        items: Array<Omit<QuestionBankItem, 'id' | 'createdAt' | 'updatedAt'>>
    ) => QuestionBankItem[];
    updateQuestionBankItem: (item: QuestionBankItem) => void;
    deleteQuestionBankItem: (id: string) => void;
    deleteQuestionBankItems: (ids: string[]) => void;
    bulkUpdateQuestionBankItems: (
        ids: string[],
        patch: {
            addTags?: string[];
            removeTags?: string[];
            cefrLevel?: CefrLevel | null;
            cefrSkill?: QuestionBankSkill | null;
        }
    ) => void;
    addDocumentComment: (c: Omit<DocumentComment, 'id' | 'createdAt' | 'resolved'>) => DocumentComment;
    resolveDocumentComment: (id: string, resolved: boolean) => void;
    deleteDocumentComment: (id: string) => void;
    dismissNotification: (type: NotificationDismissalType, entityId: string, fingerprint: string) => void;
    addExportTemplate: (t: Omit<ExportTemplate, 'id' | 'addedAt'>) => ExportTemplate;
    deleteExportTemplate: (id: string) => void;
    // Peer Review
    savePeerReview: (sr: StudentRubric) => void;
    deletePeerReview: (id: string) => void;
    // Self Assessment
    saveSelfAssessment: (sa: SelfAssessment) => void;
    deleteSelfAssessment: (id: string) => void;
    // Speaking Sessions
    saveSpeakingSession: (session: SpeakingSession) => void;
    deleteSpeakingSession: (id: string) => void;
    // Rubric snapshot sync
    syncRubricSnapshot: (rubricId: string, updatedRubric: Rubric) => void;
    // Rubric version history
    fetchRubricVersions: (rubricId: string) => Promise<RubricVersion[]>;
    saveRubricVersion: (rubricId: string, label?: string) => Promise<void>;
    restoreRubricVersion: (rubricId: string, snapshot: Rubric) => void;
    // Vocabulary items
    addVocabularyItem: (rubricId: string, item: Omit<VocabularyItem, 'id'>) => VocabularyItem;
    updateVocabularyItem: (rubricId: string, item: VocabularyItem) => void;
    deleteVocabularyItem: (rubricId: string, itemId: string) => void;
    deleteVocabularyItems: (rubricId: string, itemIds: string[]) => void;
    // Document analysis results
    saveAnalysisResult: (result: DocumentAnalysisResult) => void;
    deleteAnalysisResult: (id: string) => void;
    // Testing environment
    addTest: (t: Omit<Test, 'id' | 'createdAt' | 'updatedAt'>) => Test;
    updateTest: (t: Test) => void;
    deleteTest: (id: string) => void;
    saveStudentTest: (st: StudentTest) => void;
    deleteStudentTest: (id: string) => void;
    // Essay assignments (local persistence)
    addEssayAssignments: (assignments: EssayAssignment[]) => void;
    updateEssayGroup: (teacherKey: string, patch: Partial<EssayAssignment>) => void;
    deleteEssayGroup: (teacherKey: string) => void;
    addEssaySubmission: (submission: EssaySubmission) => void;
    // Essay templates (local drafts, not yet assigned to students)
    saveEssayTemplate: (t: EssayTemplate) => void;
    deleteEssayTemplate: (id: string) => void;
    // Grading task assignment (batch-assign ungraded submissions to a teacher)
    addGradingTasks: (tasks: GradingTask[]) => void;
    deleteGradingTask: (id: string) => void;
    // Student <-> teacher messaging (teacher side; see fetchMyMessages etc. below for portal)
    sendMessage: (m: Message) => void;
    markMessageReadByTeacher: (id: string) => void;
    // Flashcards (vocabulary spaced repetition)
    addFlashcardDeck: (d: Omit<FlashcardDeck, 'id' | 'createdAt' | 'updatedAt'>) => FlashcardDeck;
    updateFlashcardDeck: (d: FlashcardDeck) => void;
    deleteFlashcardDeck: (id: string) => void;
    addStandardMasteryTarget: (t: Omit<StandardMasteryTarget, 'id' | 'updatedAt'>) => StandardMasteryTarget;
    updateStandardMasteryTarget: (t: StandardMasteryTarget) => void;
    deleteStandardMasteryTarget: (id: string) => void;
    addFlashcardAssignments: (assignments: FlashcardAssignment[]) => void;
    saveFlashcardReview: (r: FlashcardReview) => void;
    // News flashes (curated links/resources, teacher side)
    addNewsFlash: (f: Omit<NewsFlash, 'id' | 'createdAt'>) => NewsFlash;
    updateNewsFlash: (f: NewsFlash) => void;
    deleteNewsFlash: (id: string) => void;
    markNewsFlashRead: (r: NewsFlashRead) => void;
    // Saved rubric templates ("save as template")
    saveUserTemplate: (t: UserTemplate) => void;
    deleteUserTemplate: (id: string) => void;
    // Database sync
    connectDatabase: (config: DatabaseConfig) => Promise<boolean>;
    disconnectDatabase: () => void;
    pushAllToDatabase: () => Promise<{ success: boolean; error?: string }>;
    pullFromDatabase: () => Promise<void>;
    // User / profile management
    fetchAllUsers: () => Promise<DbUser[]>;
    updateUserRole: (userId: string, role: UserRole) => Promise<SyncResult>;
    updateMyProfile: (updates: { displayName?: string }) => Promise<SyncResult>;
    // Schools (cloud-only — no-op in offline mode)
    fetchSchools: () => Promise<Awaited<ReturnType<StorageSyncInstance['fetchSchools']>>>;
    createSchool: (
        name: string,
        retentionYears: number
    ) => Promise<Awaited<ReturnType<StorageSyncInstance['createSchool']>>>;
    joinSchool: (schoolId: string) => Promise<Awaited<ReturnType<StorageSyncInstance['joinSchool']>>>;
    updateSchool: (
        schoolId: string,
        updates: { name?: string; retentionYears?: number }
    ) => Promise<Awaited<ReturnType<StorageSyncInstance['updateSchool']>>>;
    deleteSchool: (schoolId: string) => Promise<Awaited<ReturnType<StorageSyncInstance['deleteSchool']>>>;
    fetchSchoolMembers: (schoolId: string) => Promise<Awaited<ReturnType<StorageSyncInstance['fetchSchoolMembers']>>>;
    removeSchoolMember: (
        schoolId: string,
        profileId: string
    ) => Promise<Awaited<ReturnType<StorageSyncInstance['removeSchoolMember']>>>;
    // Student anonymization
    anonymizeStudent: (id: string) => void;
    // Essay assignments (teacher side)
    saveEssayAssignment: (a: EssayAssignment) => Promise<SyncResult>;
    setStudentPassword: (studentEmail: string, password: string) => Promise<SyncResult>;
    notifyStudentMessage: (studentId: string, contextLabel: string | null, bodyPreview: string) => Promise<void>;
    deleteEssayAssignment: (teacherKey: string) => Promise<SyncResult>;
    fetchEssaySubmissions: (
        teacherKey: string
    ) => Promise<Awaited<ReturnType<StorageSyncInstance['fetchEssaySubmissions']>>>;
    fetchEssaySubmissionsForStudent: (
        rubricId: string,
        studentId: string
    ) => Promise<Awaited<ReturnType<StorageSyncInstance['fetchEssaySubmissionsForStudent']>>>;
    fetchAllEssaySubmissions: () => Promise<Awaited<ReturnType<StorageSyncInstance['fetchAllEssaySubmissions']>>>;
    fetchMyEssayAssignments: () => Promise<Awaited<ReturnType<StorageSyncInstance['fetchMyEssayAssignments']>>>;
    fetchEssayAssignmentByKey: (
        teacherKey: string
    ) => Promise<Awaited<ReturnType<StorageSyncInstance['fetchEssayAssignmentByKey']>>>;
    deleteEssaySubmission: (submissionId: string, storagePath: string) => Promise<SyncResult>;
    getEssaySignedUrl: (storagePath: string) => Promise<string | null>;
    // Test assignments (teacher side)
    saveTestAssignment: (a: TestAssignment) => Promise<SyncResult>;
    fetchMyTestAssignments: () => Promise<Awaited<ReturnType<StorageSyncInstance['fetchMyTestAssignments']>>>;
    fetchAssignedTestContent: (testId: string) => Promise<Test | null>;
    fetchTestAssignmentTeacherKeys: (testId: string) => Promise<Record<string, string>>;
    /** One-shot teacher level nudge for a generator-engine placement run in progress (roadmap 27.2). */
    setPlacementOverride: (assignmentId: string, direction: 'up' | 'down') => Promise<void>;
    // Messages (student portal side)
    fetchMyMessages: () => Promise<Awaited<ReturnType<StorageSyncInstance['fetchMyMessages']>>>;
    sendMessageAsStudent: (m: Message) => Promise<SyncResult>;
    markMessagesReadByStudent: (ids: string[]) => Promise<SyncResult>;
    // Flashcards (student portal side)
    fetchMyFlashcardAssignments: () => Promise<FlashcardAssignment[]>;
    fetchAssignedFlashcardDeck: (deckId: string) => Promise<FlashcardDeck | null>;
    fetchMyFlashcardReview: (deckId: string, studentId: string) => Promise<FlashcardReview | null>;
    saveFlashcardReviewAsStudent: (r: FlashcardReview) => Promise<SyncResult>;
    fetchMyStudentFlashcardDecks: (studentId: string) => Promise<FlashcardDeck[]>;
    saveFlashcardDeckAsStudent: (d: FlashcardDeck) => Promise<SyncResult>;
    deleteFlashcardDeckAsStudent: (id: string) => Promise<SyncResult>;
    // News flashes (student portal side)
    fetchMyNewsFlashes: () => Promise<NewsFlash[]>;
    markNewsFlashReadAsStudent: (r: NewsFlashRead) => Promise<SyncResult>;
    // Backup / restore
    importBackup: (json: string) => Promise<boolean>;
    // Landing / auth flow
    showLanding: boolean;
    isCheckingSession: boolean;
    showMigrationPrompt: boolean;
    enterLocalMode: () => void;
    connectForOAuth: (config: DatabaseConfig) => Promise<boolean>;
    dismissMigrationPrompt: (upload: boolean) => Promise<void>;
    signInWithGoogle: () => Promise<{ error?: string }>;
    signInWithMicrosoftPersonal: () => Promise<{ error?: string }>;
    signInWithAzureAD: () => Promise<{ error?: string }>;
    signOutFromDatabase: () => Promise<void>;
    // Microsoft Sync
    loginMicrosoft: () => Promise<void>;
    logoutMicrosoft: () => Promise<void>;
    syncToOneDrive: () => Promise<void>;
    restoreFromOneDrive: () => Promise<void>;
    microsoftUser: null;
    getCurrentDatabaseUserId: () => string | null;
}

export { LOCAL_MODE_KEY, MIGRATION_DONE_KEY } from '../store/storage';

export const COLLECTION_SAVERS: Partial<Record<keyof StoreData, (m: StoreData) => void>> = {
    rubrics: (m) => saveRubrics(m.rubrics),
    students: (m) => saveStudents(m.students),
    classes: (m) => saveClasses(m.classes),
    studentRubrics: (m) => saveStudentRubrics(stripAudioForOfflineCache(m.studentRubrics)),
    attachments: (m) => saveAttachments(m.attachments),
    gradeScales: (m) => saveGradeScales(m.gradeScales),
    settings: (m) => saveSettings(m.settings),
    favoriteStandards: (m) => saveFavoriteStandards(m.favoriteStandards),
    commentBank: (m) => saveCommentBank(m.commentBank),
    exportTemplates: (m) => saveExportTemplates(m.exportTemplates),
    peerReviews: (m) => savePeerReviews(m.peerReviews),
    selfAssessments: (m) => saveSelfAssessments(m.selfAssessments),
    speakingSessions: (m) => saveSpeakingSessions(m.speakingSessions),
    analysisResults: (m) => saveAnalysisResults(m.analysisResults),
    tests: (m) => saveTests(m.tests),
    studentTests: (m) => saveStudentTests(m.studentTests),
    essayTemplates: (m) => saveEssayTemplates(m.essayTemplates),
    gradingTasks: (m) => saveGradingTasks(m.gradingTasks),
    messages: (m) => saveMessages(m.messages),
    essayAssignments: (m) => saveEssayAssignments(m.essayAssignments),
    essaySubmissions: (m) => saveEssaySubmissions(m.essaySubmissions),
    userTemplates: (m) => saveUserTemplates(m.userTemplates),
    flashcardDecks: (m) => saveFlashcardDecks(m.flashcardDecks),
    flashcardAssignments: (m) => saveFlashcardAssignments(m.flashcardAssignments),
    flashcardReviews: (m) => saveFlashcardReviews(m.flashcardReviews),
    standardMasteryTargets: (m) => saveStandardMasteryTargets(m.standardMasteryTargets),
    newsFlashes: (m) => saveNewsFlashes(m.newsFlashes),
    newsFlashReads: (m) => saveNewsFlashReads(m.newsFlashReads),
    questionBank: (m) => saveQuestionBank(m.questionBank),
    documentComments: (m) => saveDocumentComments(m.documentComments),
    notificationDismissals: (m) => saveNotificationDismissals(m.notificationDismissals),
};

export async function flushToLocalStorage(merged: StoreData, changedKeys?: Set<keyof StoreData>) {
    const keys = changedKeys ?? (Object.keys(COLLECTION_SAVERS) as (keyof StoreData)[]);
    for (const key of keys) COLLECTION_SAVERS[key]?.(merged);

    // Best-effort: a recording blob whose session was deleted on another device has no
    // app-level delete call to clean it up locally, so sweep for orphans after a full sync
    // or whenever speaking sessions were among the changed collections.
    if (!changedKeys || changedKeys.has('speakingSessions')) {
        const { pruneOrphanedBlobs } = await import('../services/mediaStore');
        const referencedRecordingIds = new Set(
            merged.speakingSessions.flatMap((ss) => ss.recordings?.map((r) => r.id) ?? [])
        );
        pruneOrphanedBlobs(referencedRecordingIds).catch(() => {
            // stray IndexedDB blob costs storage quota, not correctness — not worth surfacing
        });
    }
}

export function useContextOrThrow<T>(ctx: React.Context<T | null>, hookName: string): T {
    const value = useContext(ctx);
    if (!value) throw new Error(`${hookName} must be used within AppProvider`);
    return value;
}
