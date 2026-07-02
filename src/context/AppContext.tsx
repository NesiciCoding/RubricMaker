import React, {
    createContext,
    useContext,
    useReducer,
    useCallback,
    useEffect,
    useRef,
    useState,
    ReactNode,
} from 'react';
import type {
    Rubric,
    Student,
    Class,
    StudentRubric,
    Attachment,
    GradeScale,
    CommentSnippet,
    AppSettings,
    ScoreEntry,
    LinkedStandard,
    CommentBankItem,
    ExportTemplate,
    SelfAssessment,
    SpeakingSession,
    RubricVersion,
    VocabularyItem,
    DocumentAnalysisResult,
    EssayAssignment,
    EssaySubmission,
    EssayTemplate,
    GradingTask,
    Test,
    StudentTest,
    TestAssignment,
    UserTemplate,
    UserRole,
} from '../types';
import {
    loadStore,
    StoreData,
    saveRubrics,
    saveStudents,
    saveClasses,
    saveStudentRubrics,
    saveAttachments,
    saveGradeScales,
    saveCommentSnippets,
    saveSettings,
    saveFavoriteStandards,
    saveCommentBank,
    saveExportTemplates,
    savePeerReviews,
    saveSelfAssessments,
    saveSpeakingSessions,
    saveAnalysisResults,
    saveTests,
    saveStudentTests,
    saveEssayAssignments,
    saveEssaySubmissions,
    saveEssayTemplates,
    saveGradingTasks,
    saveUserTemplates,
    importFullBackup,
    loadPendingQueue,
    onStorageQuotaExceeded,
    clearLocalData,
} from '../store/storage';
import { mergeStoreData } from '../utils/syncMerge';
import { useTranslation } from 'react-i18next';
import { nanoid } from '../utils/nanoid';
import { storageSync, loadSupabaseConfig, saveSupabaseConfig } from '../services/database';
import type { DatabaseConfig, DbUser, SyncResult } from '../services/database';
import { useToast } from '../hooks/useToast';
import { buildAccentScale, ACCENT_SCALE_STEPS } from '../utils/accentScale';
import { isRtlLanguage } from '../utils/rtlLanguages';
import {
    logEvent,
    initClientLogger,
    setLoggerContext,
    STRESS_TEST_LOGGING_ENABLED,
} from '../services/logging/clientLogger';
import { initAuditLogger, clearAuditLogger, logAuditEvent } from '../services/database/AuditLogger';

// ─── Actions ───────────────────────────────────────────────────────────────────

type Action =
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
    | { type: 'DELETE_STUDENT_RUBRIC'; id: string }
    | { type: 'SAVE_RUBRIC_SELF_ASSESSMENT'; id: string; levels: Record<string, string | null>; reflection: string }
    | { type: 'ANONYMIZE_STUDENT'; id: string }
    | { type: 'ADD_ATTACHMENT'; payload: Attachment }
    | { type: 'DELETE_ATTACHMENT'; id: string }
    | { type: 'ADD_GRADE_SCALE'; payload: GradeScale }
    | { type: 'UPDATE_GRADE_SCALE'; payload: GradeScale }
    | { type: 'DELETE_GRADE_SCALE'; id: string }
    | { type: 'ADD_COMMENT_SNIPPET'; payload: CommentSnippet }
    | { type: 'UPDATE_COMMENT_SNIPPET'; payload: CommentSnippet }
    | { type: 'DELETE_COMMENT_SNIPPET'; id: string }
    | { type: 'UPDATE_SETTINGS'; payload: Partial<AppSettings> }
    | { type: 'ADD_FAVORITE_STANDARD'; payload: LinkedStandard }
    | { type: 'REMOVE_FAVORITE_STANDARD'; guid: string }
    | { type: 'ADD_COMMENT_BANK_ITEM'; payload: CommentBankItem }
    | { type: 'UPDATE_COMMENT_BANK_ITEM'; payload: CommentBankItem }
    | { type: 'DELETE_COMMENT_BANK_ITEM'; id: string }
    | { type: 'ADD_EXPORT_TEMPLATE'; payload: ExportTemplate }
    | { type: 'DELETE_EXPORT_TEMPLATE'; id: string }
    | { type: 'SAVE_PEER_REVIEW'; payload: StudentRubric }
    | { type: 'DELETE_PEER_REVIEW'; id: string }
    | { type: 'SAVE_SELF_ASSESSMENT'; payload: SelfAssessment }
    | { type: 'DELETE_SELF_ASSESSMENT'; id: string }
    | { type: 'SAVE_SPEAKING_SESSION'; payload: SpeakingSession }
    | { type: 'DELETE_SPEAKING_SESSION'; id: string }
    | { type: 'SYNC_RUBRIC_SNAPSHOT'; rubricId: string; updatedRubric: Rubric }
    | { type: 'SAVE_RUBRIC_VERSION'; rubricId: string; label?: string }
    | { type: 'RESTORE_RUBRIC_VERSION'; rubricId: string; versionIndex: number }
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
    | { type: 'SAVE_USER_TEMPLATE'; payload: UserTemplate }
    | { type: 'DELETE_USER_TEMPLATE'; id: string };

// When a Supabase connection is live, the Supabase push is the durable write and the
// local copy is redundant; only fall back to localStorage while genuinely offline. A
// failed push still lands in the pending-sync queue (storage.ts) as a per-record buffer.
function isOffline(): boolean {
    return !navigator.onLine || !storageSync.isConnected();
}

function reducer(state: StoreData, action: Action): StoreData {
    switch (action.type) {
        case 'SET_ALL':
            return action.payload;
        case 'ADD_RUBRIC': {
            const next = [...state.rubrics, action.payload];
            if (isOffline()) saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'UPDATE_RUBRIC': {
            const existing = state.rubrics.find((r) => r.id === action.payload.id);
            let incoming = action.payload;
            if (existing) {
                const { versions: _v, ...snap } = existing;
                const autoVersion: RubricVersion = {
                    savedAt: new Date().toISOString(),
                    label: 'auto:',
                    snapshot: snap,
                };
                const prevVersions = existing.versions ?? [];
                const manuals = prevVersions.filter((v) => !v.label?.startsWith('auto:'));
                const autos = prevVersions.filter((v) => v.label?.startsWith('auto:')).slice(-19);
                incoming = { ...incoming, versions: [...manuals, ...autos, autoVersion] };
            }
            const next = state.rubrics.map((r) => (r.id === action.payload.id ? incoming : r));
            if (isOffline()) saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'DELETE_RUBRIC': {
            const next = state.rubrics.filter((r) => r.id !== action.id);
            if (isOffline()) saveRubrics(next);
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
            // Group grading (phase 1, no per-criterion individual/collaborative split): saving any
            // member of a group duplicates its entries/comment to every sibling sharing groupId.
            if (payload.groupId) {
                next = next.map((sr) =>
                    sr.groupId === payload.groupId && sr.id !== payload.id
                        ? {
                              ...sr,
                              entries: payload.entries,
                              globalModifier: payload.globalModifier,
                              overallComment: payload.overallComment,
                              rubricSnapshot: payload.rubricSnapshot,
                              gradedAt: payload.gradedAt,
                              updatedAt: payload.updatedAt,
                          }
                        : sr
                );
            }
            if (isOffline()) saveStudentRubrics(next);
            return { ...state, studentRubrics: next };
        }
        case 'DELETE_STUDENT_RUBRIC': {
            const next = state.studentRubrics.filter((sr) => sr.id !== action.id);
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
            const next = state.gradeScales.filter((gs) => gs.id !== action.id);
            if (isOffline()) saveGradeScales(next);
            return { ...state, gradeScales: next };
        }
        case 'ADD_COMMENT_SNIPPET': {
            const next = [...state.commentSnippets, { ...action.payload, updatedAt: new Date().toISOString() }];
            if (isOffline()) saveCommentSnippets(next);
            return { ...state, commentSnippets: next };
        }
        case 'UPDATE_COMMENT_SNIPPET': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const next = state.commentSnippets.map((cs) => (cs.id === payload.id ? payload : cs));
            if (isOffline()) saveCommentSnippets(next);
            return { ...state, commentSnippets: next };
        }
        case 'DELETE_COMMENT_SNIPPET': {
            const next = state.commentSnippets.filter((cs) => cs.id !== action.id);
            if (isOffline()) saveCommentSnippets(next);
            return { ...state, commentSnippets: next };
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
        case 'SAVE_RUBRIC_VERSION': {
            const rubric = state.rubrics.find((r) => r.id === action.rubricId);
            if (!rubric) return state;
            const { versions: _v, ...snapshotFields } = rubric;
            const version: RubricVersion = {
                savedAt: new Date().toISOString(),
                label: action.label,
                snapshot: snapshotFields,
            };
            const updated = { ...rubric, versions: [...(rubric.versions ?? []), version] };
            const next = state.rubrics.map((r) => (r.id === action.rubricId ? updated : r));
            if (isOffline()) saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'RESTORE_RUBRIC_VERSION': {
            const rubric = state.rubrics.find((r) => r.id === action.rubricId);
            if (!rubric) return state;
            const version = rubric.versions?.[action.versionIndex];
            if (!version) return state;
            const restored: Rubric = {
                ...version.snapshot,
                versions: rubric.versions,
                updatedAt: new Date().toISOString(),
            };
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
        case 'SAVE_USER_TEMPLATE': {
            const filtered = state.userTemplates.filter((ut) => ut.id !== action.payload.id);
            const next = [action.payload, ...filtered].slice(0, 20);
            if (isOffline()) saveUserTemplates(next);
            return { ...state, userTemplates: next };
        }
        case 'DELETE_USER_TEMPLATE': {
            const next = state.userTemplates.filter((ut) => ut.id !== action.id);
            if (isOffline()) saveUserTemplates(next);
            return { ...state, userTemplates: next };
        }
        default:
            return state;
    }
}

// ─── Stress-test logging ────────────────────────────────────────────────────

function summarizeAction(action: Action): Record<string, unknown> {
    const a = action as unknown as Record<string, unknown>;
    const summary: Record<string, unknown> = {};
    const payload = a.payload as Record<string, unknown> | undefined;
    if (payload && typeof payload === 'object' && 'id' in payload) summary.id = payload.id;
    for (const key of ['id', 'rubricId', 'studentId', 'itemId', 'itemIds', 'versionIndex']) {
        if (key in a) summary[key] = Array.isArray(a[key]) ? (a[key] as unknown[]).length : a[key];
    }
    return summary;
}

function loggingReducer(state: StoreData, action: Action): StoreData {
    if (STRESS_TEST_LOGGING_ENABLED) {
        logEvent('action', action.type, summarizeAction(action));
    }
    return reducer(state, action);
}

// ─── Context ───────────────────────────────────────────────────────────────────

interface AppContextValue extends StoreData {
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
    deleteStudentRubric: (id: string) => void;
    addAttachment: (a: Omit<Attachment, 'id' | 'addedAt'>) => Attachment;
    deleteAttachment: (id: string) => void;
    addGradeScale: (gs: Omit<GradeScale, 'id'>) => GradeScale;
    updateGradeScale: (gs: GradeScale) => void;
    deleteGradeScale: (id: string) => void;
    addCommentSnippet: (text: string, tag: string) => CommentSnippet;
    updateCommentSnippet: (cs: CommentSnippet) => void;
    deleteCommentSnippet: (id: string) => void;
    updateSettings: (s: Partial<AppSettings>) => void;
    getActiveGradeScale: () => GradeScale;
    addFavoriteStandard: (s: LinkedStandard) => void;
    removeFavoriteStandard: (guid: string) => void;
    isFavoriteStandard: (guid: string) => boolean;
    addCommentBankItem: (text: string, tags: string[]) => CommentBankItem;
    updateCommentBankItem: (item: CommentBankItem) => void;
    deleteCommentBankItem: (id: string) => void;
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
    saveRubricVersion: (rubricId: string, label?: string) => void;
    restoreRubricVersion: (rubricId: string, versionIndex: number) => void;
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
    fetchSchools: () => Promise<Awaited<ReturnType<typeof storageSync.fetchSchools>>>;
    createSchool: (
        name: string,
        retentionYears: number
    ) => Promise<Awaited<ReturnType<typeof storageSync.createSchool>>>;
    joinSchool: (schoolId: string) => Promise<Awaited<ReturnType<typeof storageSync.joinSchool>>>;
    updateSchool: (
        schoolId: string,
        updates: { name?: string; retentionYears?: number }
    ) => Promise<Awaited<ReturnType<typeof storageSync.updateSchool>>>;
    deleteSchool: (schoolId: string) => Promise<Awaited<ReturnType<typeof storageSync.deleteSchool>>>;
    fetchSchoolMembers: (schoolId: string) => Promise<Awaited<ReturnType<typeof storageSync.fetchSchoolMembers>>>;
    removeSchoolMember: (
        schoolId: string,
        profileId: string
    ) => Promise<Awaited<ReturnType<typeof storageSync.removeSchoolMember>>>;
    // Student anonymization
    anonymizeStudent: (id: string) => void;
    // Essay assignments (teacher side)
    saveEssayAssignment: (a: EssayAssignment) => Promise<SyncResult>;
    setStudentPassword: (studentEmail: string, password: string) => Promise<SyncResult>;
    deleteEssayAssignment: (teacherKey: string) => Promise<SyncResult>;
    fetchEssaySubmissions: (
        teacherKey: string
    ) => Promise<Awaited<ReturnType<typeof storageSync.fetchEssaySubmissions>>>;
    fetchEssaySubmissionsForStudent: (
        rubricId: string,
        studentId: string
    ) => Promise<Awaited<ReturnType<typeof storageSync.fetchEssaySubmissionsForStudent>>>;
    fetchAllEssaySubmissions: () => Promise<Awaited<ReturnType<typeof storageSync.fetchAllEssaySubmissions>>>;
    fetchMyEssayAssignments: () => Promise<Awaited<ReturnType<typeof storageSync.fetchMyEssayAssignments>>>;
    fetchEssayAssignmentByKey: (
        teacherKey: string
    ) => Promise<Awaited<ReturnType<typeof storageSync.fetchEssayAssignmentByKey>>>;
    deleteEssaySubmission: (submissionId: string, storagePath: string) => Promise<SyncResult>;
    getEssaySignedUrl: (storagePath: string) => Promise<string | null>;
    // Test assignments (teacher side)
    saveTestAssignment: (a: TestAssignment) => Promise<SyncResult>;
    fetchMyTestAssignments: () => Promise<Awaited<ReturnType<typeof storageSync.fetchMyTestAssignments>>>;
    fetchAssignedTestContent: (testId: string) => Promise<Test | null>;
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
    microsoftUser: any | null;
    getCurrentDatabaseUserId: () => string | null;
}

const AppContext = createContext<AppContextValue | null>(null);

const LOCAL_MODE_KEY = 'rm_local_mode';
const MIGRATION_DONE_KEY = 'rm_migration_done';

async function flushToLocalStorage(merged: StoreData) {
    const {
        saveRubrics,
        saveStudents,
        saveClasses,
        saveStudentRubrics,
        saveAttachments,
        saveGradeScales,
        saveCommentSnippets,
        saveSettings,
        saveFavoriteStandards,
        saveCommentBank,
        saveExportTemplates,
        savePeerReviews,
        saveSelfAssessments,
        saveSpeakingSessions,
        saveAnalysisResults,
        saveTests,
        saveStudentTests,
        saveEssayTemplates,
        saveGradingTasks,
        saveEssayAssignments,
        saveEssaySubmissions,
        saveUserTemplates,
    } = await import('../store/storage');
    saveRubrics(merged.rubrics);
    saveStudents(merged.students);
    saveClasses(merged.classes);
    saveStudentRubrics(merged.studentRubrics);
    saveAttachments(merged.attachments);
    saveGradeScales(merged.gradeScales);
    saveCommentSnippets(merged.commentSnippets);
    saveSettings(merged.settings);
    saveFavoriteStandards(merged.favoriteStandards);
    saveCommentBank(merged.commentBank);
    saveExportTemplates(merged.exportTemplates);
    savePeerReviews(merged.peerReviews);
    saveSelfAssessments(merged.selfAssessments);
    saveSpeakingSessions(merged.speakingSessions);
    saveAnalysisResults(merged.analysisResults);
    saveTests(merged.tests);
    saveStudentTests(merged.studentTests);
    saveEssayTemplates(merged.essayTemplates);
    saveGradingTasks(merged.gradingTasks);
    saveEssayAssignments(merged.essayAssignments);
    saveEssaySubmissions(merged.essaySubmissions);
    saveUserTemplates(merged.userTemplates);

    // Best-effort: a recording blob whose session was deleted on another device has no
    // app-level delete call to clean it up locally, so sweep for orphans after every sync.
    const { pruneOrphanedBlobs } = await import('../services/mediaStore');
    const referencedRecordingIds = new Set(
        merged.speakingSessions.flatMap((ss) => ss.recordings?.map((r) => r.id) ?? [])
    );
    pruneOrphanedBlobs(referencedRecordingIds).catch(() => {
        // stray IndexedDB blob costs storage quota, not correctness — not worth surfacing
    });
}

export function AppProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(loggingReducer, null, loadStore);
    const initialStateRef = useRef(state);
    const currentStateRef = useRef(state);
    const { showToast } = useToast();
    const { t } = useTranslation();

    // storage.ts swallows quota errors internally (the write is dropped, not
    // retried) so a reducer case never throws mid-update; this just surfaces
    // that failure to the user instead of letting it pass silently.
    useEffect(() => {
        onStorageQuotaExceeded(() => showToast(t('toast.storage_full'), 'error'));
    }, [showToast, t]);

    // Keep currentStateRef in sync so the reconnect handler always sees fresh state
    useEffect(() => {
        currentStateRef.current = state;
    }, [state]);

    // 'checking' while we detect session; 'show' = show landing; 'hide' = in app
    const [landingState, setLandingState] = useState<'checking' | 'show' | 'hide'>('checking');
    // Ref so the OTP handler ([] deps effect) can read current state without
    // re-subscribing on every landingState change.
    const landingStateRef = useRef<'checking' | 'show' | 'hide'>('checking');
    useEffect(() => {
        landingStateRef.current = landingState;
    }, [landingState]);
    const [showMigrationPrompt, setShowMigrationPrompt] = useState(false);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', state.settings.theme);
    }, [state.settings.theme]);

    useEffect(() => {
        const root = document.documentElement;
        const accent = state.settings.accentColor;
        if (!accent) {
            // No custom accent chosen — let the theme's own --accent (Warm Scholar tokens, per light/dark) stand.
            root.style.removeProperty('--accent');
            root.style.removeProperty('--accent-hover');
            root.style.removeProperty('--accent-soft');
            root.style.removeProperty('--accent-glow');
            for (const step of ACCENT_SCALE_STEPS) {
                root.style.removeProperty(`--accent-${step}`);
            }
            return;
        }
        root.style.setProperty('--accent', accent);
        root.style.setProperty('--accent-hover', accent);
        root.style.setProperty('--accent-soft', `${accent}26`);
        root.style.setProperty('--accent-glow', `${accent}66`);
        const scale = buildAccentScale(accent);
        for (const step of ACCENT_SCALE_STEPS) {
            root.style.setProperty(`--accent-${step}`, scale[step]);
        }
    }, [state.settings.accentColor]);

    useEffect(() => {
        const fontKey = state.settings.uiFontFamily;
        if (!fontKey) {
            // No custom UI font chosen — let the theme's own --font (Hanken Grotesk) stand.
            document.documentElement.style.removeProperty('--font');
            return;
        }
        const GOOGLE_FONTS: Record<string, string> = {
            Inter: 'Inter:wght@300;400;500;600;700',
            Nunito: 'Nunito:wght@400;500;600;700',
            'Source Sans 3': 'Source+Sans+3:wght@400;500;600;700',
            Lato: 'Lato:wght@400;700',
            Roboto: 'Roboto:wght@400;500;700',
        };
        document.documentElement.style.setProperty('--font', `'${fontKey}', system-ui, sans-serif`);
        if (GOOGLE_FONTS[fontKey]) {
            let link = document.getElementById('app-gfont') as HTMLLinkElement | null;
            if (!link) {
                link = document.createElement('link');
                link.id = 'app-gfont';
                link.rel = 'stylesheet';
                document.head.appendChild(link);
            }
            link.href = `https://fonts.googleapis.com/css2?family=${GOOGLE_FONTS[fontKey]}&display=swap`;
        }
    }, [state.settings.uiFontFamily]);

    useEffect(() => {
        document.documentElement.dir = isRtlLanguage(state.settings.language) ? 'rtl' : 'ltr';
    }, [state.settings.language]);

    useEffect(() => {
        const root = document.documentElement;
        if (state.settings.dyslexiaFriendlyMode) {
            root.style.setProperty('--line-height', '1.8');
            root.style.setProperty('--letter-spacing', '0.04em');
        } else {
            root.style.removeProperty('--line-height');
            root.style.removeProperty('--letter-spacing');
        }
    }, [state.settings.dyslexiaFriendlyMode]);

    // ── Startup: detect local mode / existing session / OAuth callback ────────
    useEffect(() => {
        if (localStorage.getItem(LOCAL_MODE_KEY) === 'true') {
            setLandingState('hide');
            return;
        }

        const config = loadSupabaseConfig();
        if (!config) {
            setLandingState('show');
            return;
        }

        // Guard: ensures configure+hydrate runs at most once (startup OR auth-change, not both)
        let sessionHandled = false;

        async function configureAndEnter(cfg: DatabaseConfig) {
            if (sessionHandled) return;
            sessionHandled = true;
            saveSupabaseConfig(cfg);
            const ok = await storageSync.configure(cfg);
            if (!ok) {
                setLandingState('show');
                return;
            }
            storageSync.setToastFn(showToast);
            if (!navigator.onLine) {
                showToast(t('toast.sync_offline_cache'), 'info');
                setLandingState('hide');
                return;
            }
            const { data: fresh, error: hydrateError } = await storageSync.hydrate();
            if (hydrateError) showToast(t('toast.sync_load_failed'), 'warning');
            if (fresh) {
                // After an owner switch the in-memory state still holds the previous
                // user's data — merge against the freshly wiped store instead.
                const base = storageSync.didWipeLocalData() ? loadStore() : initialStateRef.current;
                const merged = mergeStoreData(base, fresh, loadPendingQueue());
                dispatch({ type: 'SET_ALL', payload: merged });
                try {
                    await flushToLocalStorage(merged);
                } catch {
                    showToast(t('toast.storage_full'), 'error');
                }
            }
            setLandingState('hide');
        }

        storageSync
            .initAuth(config)
            .then(async () => {
                if (!storageSync.hasSession()) {
                    setLandingState('show');
                    return;
                }

                // Session already existed on startup — connect and hydrate immediately
                await configureAndEnter(config);

                // Show migration prompt once if local data exists and hasn't been migrated
                if (localStorage.getItem(MIGRATION_DONE_KEY) !== 'true' && !storageSync.didWipeLocalData()) {
                    const s = initialStateRef.current;
                    if (s.rubrics.length > 0 || s.students.length > 0 || s.classes.length > 0) {
                        setShowMigrationPrompt(true);
                    }
                }
            })
            .catch((e) => {
                console.error('[auth] initAuth failed', e);
                setLandingState('show');
            });

        // Listen for sign-in that happens while the landing page is showing (e.g., OTP)
        const unsubAuth = storageSync.onAuthChange(async (user) => {
            if (!user) return;
            const cfg = loadSupabaseConfig();
            if (!cfg) return;
            try {
                await configureAndEnter(cfg);
            } catch (e) {
                console.error('[auth] onAuthChange configure failed', e);
                setLandingState('show');
            }
        });

        return () => unsubAuth();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Stress-test logging + audit logger: keep in sync with auth + role ────────
    useEffect(() => {
        const userId = storageSync.getCurrentUserId();
        const client = storageSync.adapter.getClient();
        if (client && userId) initAuditLogger(client, userId);
        else clearAuditLogger();

        if (!STRESS_TEST_LOGGING_ENABLED) return;
        const ctx = {
            role: state.settings.userRole,
            schoolId: state.settings.schoolId,
            userId: userId ?? undefined,
        };
        if (client) initClientLogger(client, ctx);
        else setLoggerContext(ctx);
    }, [state.settings.userRole, state.settings.schoolId, landingState]);

    // ── Re-hydrate from Supabase when the network comes back online ──────────────
    useEffect(() => {
        return storageSync.onNetworkReconnect(async () => {
            if (!storageSync.isConnected()) return;
            const { data: fresh } = await storageSync.hydrate();
            if (fresh) {
                const merged = mergeStoreData(currentStateRef.current, fresh, loadPendingQueue());
                dispatch({ type: 'SET_ALL', payload: merged });
                try {
                    await flushToLocalStorage(merged);
                } catch {
                    // quota error — non-fatal on reconnect
                }
            }
        });
    }, []);

    // ── Handle in-page OTP login (no page reload, so startup effect won't re-run) ──
    useEffect(() => {
        return storageSync.onAuthChange(async (user) => {
            // Only run when the landing page is genuinely visible.
            // During startup landingStateRef.current === 'checking', which prevents
            // this handler from racing with the startup configureAndEnter flow and
            // calling setLandingState('checking') mid-interaction (which unmounts
            // all routes, destroying any mounted component's local state).
            if (!user || storageSync.isConnected() || landingStateRef.current !== 'show') return;
            const config = loadSupabaseConfig();
            if (!config) return;
            setLandingState('checking');
            try {
                const ok = await storageSync.configure(config);
                if (!ok) {
                    setLandingState('show');
                    return;
                }
                storageSync.setToastFn(showToast);
                const { data: fresh, error: hydrateError } = await storageSync.hydrate();
                if (hydrateError) showToast(t('toast.sync_load_failed'), 'warning');
                if (fresh) {
                    const base = storageSync.didWipeLocalData() ? loadStore() : initialStateRef.current;
                    const merged = mergeStoreData(base, fresh, loadPendingQueue());
                    dispatch({ type: 'SET_ALL', payload: merged });
                    try {
                        await flushToLocalStorage(merged);
                    } catch {
                        showToast(t('toast.storage_full'), 'error');
                    }
                }
                setLandingState('hide');
            } catch (e) {
                console.error('[auth] OTP login flow failed', e);
                setLandingState('show');
            }
        });
    }, []);

    // ── Supabase: delta-sync after each mutation ───────────────────────────────
    const prevStateRef = useRef(state);
    useEffect(() => {
        const prev = prevStateRef.current;
        prevStateRef.current = state;
        if (!storageSync.isConnected()) return;

        function diff<T>(prevArr: T[], currArr: T[], entity: string, getId: (x: T) => string) {
            const prevMap = new Map(prevArr.map((x) => [getId(x), JSON.stringify(x)]));
            const currMap = new Map(currArr.map((x) => [getId(x), x]));
            for (const id of prevMap.keys()) {
                if (!currMap.has(id)) storageSync.pushOne(entity, 'delete', null, id);
            }
            for (const [id, item] of currMap) {
                // Always pass id (not just on delete) — entities like essayBatchAssignment
                // have no `id`/`guid` field on the payload itself (they're keyed by a
                // composite of other fields), so the pending-queue dedup/protection logic
                // needs it explicitly rather than deriving it from the payload.
                if (prevMap.get(id) !== JSON.stringify(item)) storageSync.pushOne(entity, 'upsert', item, id);
            }
        }

        diff(prev.rubrics, state.rubrics, 'rubric', (r) => r.id);
        diff(prev.classes, state.classes, 'class', (c) => c.id);
        diff(prev.students, state.students, 'student', (s) => s.id);
        diff(prev.studentRubrics, state.studentRubrics, 'studentRubric', (sr) => sr.id);
        diff(prev.peerReviews, state.peerReviews, 'peerReview', (sr) => sr.id);
        diff(prev.attachments, state.attachments, 'attachment', (a) => a.id);
        diff(prev.gradeScales, state.gradeScales, 'gradeScale', (gs) => gs.id);
        diff(prev.commentSnippets, state.commentSnippets, 'commentSnippet', (cs) => cs.id);
        diff(prev.commentBank, state.commentBank, 'commentBankItem', (cb) => cb.id);
        diff(prev.exportTemplates, state.exportTemplates, 'exportTemplate', (t) => t.id);
        diff(prev.favoriteStandards, state.favoriteStandards, 'favoriteStandard', (fs) => fs.guid);
        diff(prev.selfAssessments, state.selfAssessments, 'selfAssessment', (sa) => sa.id);
        diff(prev.speakingSessions, state.speakingSessions, 'speakingSession', (ss) => ss.id);
        diff(prev.analysisResults, state.analysisResults, 'analysisResult', (ar) => ar.id);
        diff(prev.tests, state.tests, 'test', (t) => t.id);
        diff(prev.studentTests, state.studentTests, 'studentTest', (st) => st.id);
        diff(
            prev.essayAssignments,
            state.essayAssignments,
            'essayBatchAssignment',
            (a) => `${a.teacherKey}:${a.studentId}`
        );
        diff(prev.essaySubmissions, state.essaySubmissions, 'essayOfflineSubmission', (s) => s.id);
        diff(prev.userTemplates, state.userTemplates, 'userTemplate', (ut) => ut.id);

        if (JSON.stringify(prev.settings) !== JSON.stringify(state.settings)) {
            storageSync.pushOne('settings', 'upsert', state.settings);
        }
    }, [state]);

    const addRubric = useCallback((r: Omit<Rubric, 'id' | 'createdAt' | 'updatedAt'>): Rubric => {
        const now = new Date().toISOString();
        const rubric: Rubric = { ...r, id: nanoid(), createdAt: now, updatedAt: now };
        dispatch({ type: 'ADD_RUBRIC', payload: rubric });
        return rubric;
    }, []);

    const updateRubric = useCallback((r: Rubric) => {
        dispatch({ type: 'UPDATE_RUBRIC', payload: { ...r, updatedAt: new Date().toISOString() } });
        logAuditEvent('grade', 'rubric_edit', 'rubric', r.id);
    }, []);

    const deleteRubric = useCallback((id: string) => dispatch({ type: 'DELETE_RUBRIC', id }), []);

    const addStudent = useCallback((s: Omit<Student, 'id'>): Student => {
        const student: Student = { ...s, id: nanoid() };
        dispatch({ type: 'ADD_STUDENT', payload: student });
        return student;
    }, []);

    const updateStudent = useCallback((s: Student) => dispatch({ type: 'UPDATE_STUDENT', payload: s }), []);
    const deleteStudent = useCallback((id: string) => {
        logAuditEvent('admin', 'student_delete', 'student', id);
        dispatch({ type: 'DELETE_STUDENT', id });
    }, []);
    const restoreStudent = useCallback((id: string) => {
        logAuditEvent('admin', 'student_restore', 'student', id);
        dispatch({ type: 'RESTORE_STUDENT', id });
    }, []);

    const addClass = useCallback((c: Omit<Class, 'id'>): Class => {
        const cls: Class = { ...c, id: nanoid() };
        dispatch({ type: 'ADD_CLASS', payload: cls });
        return cls;
    }, []);
    const updateClass = useCallback((c: Class) => dispatch({ type: 'UPDATE_CLASS', payload: c }), []);
    const deleteClass = useCallback(
        (id: string, deleteStudents: boolean = false) => {
            if (deleteStudents) {
                state.students.filter((s) => s.classId === id).forEach((s) => deleteStudent(s.id));
            }
            dispatch({ type: 'DELETE_CLASS', id });
        },
        [state.students, deleteStudent]
    );

    const mergeClasses = useCallback(
        (sourceClassId: string, targetClassId: string) => {
            // Move all students to the target class
            const studentsToMove = state.students.filter((s) => s.classId === sourceClassId);
            studentsToMove.forEach((s) => updateStudent({ ...s, classId: targetClassId }));
            // Merge rubricIds: union source and target rubric associations
            const sourceClass = state.classes.find((c) => c.id === sourceClassId);
            const targetClass = state.classes.find((c) => c.id === targetClassId);
            if (sourceClass && targetClass) {
                const sourceRubricIds = sourceClass.rubricIds ?? [];
                const targetRubricIds = targetClass.rubricIds ?? [];
                if (sourceRubricIds.length > 0) {
                    const merged = Array.from(new Set([...targetRubricIds, ...sourceRubricIds]));
                    dispatch({ type: 'UPDATE_CLASS', payload: { ...targetClass, rubricIds: merged } });
                }
            }
            // Delete the old class
            deleteClass(sourceClassId, false);
        },
        [state.students, state.classes, updateStudent, deleteClass, dispatch]
    );

    const saveStudentRubricFn = useCallback((sr: StudentRubric) => {
        logAuditEvent('grade', 'grade_save', 'student_rubric', sr.id, {
            rubricId: sr.rubricId,
            studentId: sr.studentId,
        });
        dispatch({ type: 'SAVE_STUDENT_RUBRIC', payload: sr });
    }, []);

    const saveRubricSelfAssessment = useCallback(
        (id: string, levels: Record<string, string | null>, reflection: string) => {
            dispatch({ type: 'SAVE_RUBRIC_SELF_ASSESSMENT', id, levels, reflection });
        },
        []
    );

    const createStudentRubric = useCallback(
        (rubricId: string, studentId: string): StudentRubric => {
            const rubric = state.rubrics.find((r) => r.id === rubricId);
            const entries: ScoreEntry[] = (rubric?.criteria ?? []).map((c) => ({
                criterionId: c.id,
                levelId: null,
                comment: '',
                checkedSubItems: [],
            }));
            const sr: StudentRubric = {
                id: nanoid(),
                rubricId,
                studentId,
                entries,
                overallComment: '',
                isPeerReview: false,
            };
            dispatch({ type: 'SAVE_STUDENT_RUBRIC', payload: sr });
            return sr;
        },
        [state.rubrics]
    );

    /**
     * Phase 1 group grading: creates one StudentRubric per student, all sharing a fresh groupId.
     * Grading any member through the normal single-student flow then duplicates its scores to the
     * rest of the group via the SAVE_STUDENT_RUBRIC reducer case — no separate group grading UI.
     */
    const createGroupStudentRubrics = useCallback(
        (rubricId: string, studentIds: string[]): StudentRubric[] => {
            const rubric = state.rubrics.find((r) => r.id === rubricId);
            const entries: ScoreEntry[] = (rubric?.criteria ?? []).map((c) => ({
                criterionId: c.id,
                levelId: null,
                comment: '',
                checkedSubItems: [],
            }));
            const groupId = nanoid();
            const srs = studentIds.map((studentId): StudentRubric => ({
                id: nanoid(),
                rubricId,
                studentId,
                entries: entries.map((e) => ({ ...e })),
                overallComment: '',
                isPeerReview: false,
                groupId,
            }));
            srs.forEach((sr) => dispatch({ type: 'SAVE_STUDENT_RUBRIC', payload: sr }));
            return srs;
        },
        [state.rubrics]
    );

    const deleteStudentRubric = useCallback((id: string) => dispatch({ type: 'DELETE_STUDENT_RUBRIC', id }), []);

    const addAttachment = useCallback((a: Omit<Attachment, 'id' | 'addedAt'>): Attachment => {
        const att: Attachment = { ...a, id: nanoid(), addedAt: new Date().toISOString() };
        dispatch({ type: 'ADD_ATTACHMENT', payload: att });
        return att;
    }, []);

    const deleteAttachment = useCallback((id: string) => dispatch({ type: 'DELETE_ATTACHMENT', id }), []);

    const addGradeScale = useCallback((gs: Omit<GradeScale, 'id'>): GradeScale => {
        const scale: GradeScale = { ...gs, id: nanoid() };
        dispatch({ type: 'ADD_GRADE_SCALE', payload: scale });
        return scale;
    }, []);

    const updateGradeScale = useCallback((gs: GradeScale) => dispatch({ type: 'UPDATE_GRADE_SCALE', payload: gs }), []);
    const deleteGradeScale = useCallback((id: string) => dispatch({ type: 'DELETE_GRADE_SCALE', id }), []);

    const addCommentSnippet = useCallback((text: string, tag: string): CommentSnippet => {
        const snip: CommentSnippet = { id: nanoid(), text, tag };
        dispatch({ type: 'ADD_COMMENT_SNIPPET', payload: snip });
        return snip;
    }, []);

    const updateCommentSnippet = useCallback(
        (cs: CommentSnippet) => dispatch({ type: 'UPDATE_COMMENT_SNIPPET', payload: cs }),
        []
    );
    const deleteCommentSnippet = useCallback((id: string) => dispatch({ type: 'DELETE_COMMENT_SNIPPET', id }), []);
    const updateSettings = useCallback(
        (s: Partial<AppSettings>) => dispatch({ type: 'UPDATE_SETTINGS', payload: s }),
        []
    );

    const getActiveGradeScale = useCallback((): GradeScale => {
        return state.gradeScales.find((gs) => gs.id === state.settings.defaultGradeScaleId) ?? state.gradeScales[0];
    }, [state.gradeScales, state.settings.defaultGradeScaleId]);

    const addFavoriteStandard = useCallback(
        (s: LinkedStandard) => dispatch({ type: 'ADD_FAVORITE_STANDARD', payload: s }),
        []
    );
    const removeFavoriteStandard = useCallback(
        (guid: string) => dispatch({ type: 'REMOVE_FAVORITE_STANDARD', guid }),
        []
    );
    const isFavoriteStandard = useCallback(
        (guid: string) => state.favoriteStandards.some((s) => s.guid === guid),
        [state.favoriteStandards]
    );

    const addCommentBankItem = useCallback((text: string, tags: string[]): CommentBankItem => {
        const item: CommentBankItem = { id: nanoid(), text, tags, createdAt: new Date().toISOString() };
        dispatch({ type: 'ADD_COMMENT_BANK_ITEM', payload: item });
        return item;
    }, []);

    const updateCommentBankItem = useCallback(
        (item: CommentBankItem) => dispatch({ type: 'UPDATE_COMMENT_BANK_ITEM', payload: item }),
        []
    );
    const deleteCommentBankItem = useCallback((id: string) => dispatch({ type: 'DELETE_COMMENT_BANK_ITEM', id }), []);

    const addExportTemplate = useCallback((t: Omit<ExportTemplate, 'id' | 'addedAt'>): ExportTemplate => {
        const template: ExportTemplate = { ...t, id: nanoid(), addedAt: new Date().toISOString() };
        dispatch({ type: 'ADD_EXPORT_TEMPLATE', payload: template });
        return template;
    }, []);
    const deleteExportTemplate = useCallback((id: string) => dispatch({ type: 'DELETE_EXPORT_TEMPLATE', id }), []);

    const savePeerReview = useCallback((sr: StudentRubric) => {
        dispatch({ type: 'SAVE_PEER_REVIEW', payload: sr });
    }, []);

    const deletePeerReview = useCallback((id: string) => dispatch({ type: 'DELETE_PEER_REVIEW', id }), []);

    const saveSelfAssessment = useCallback((sa: SelfAssessment) => {
        dispatch({ type: 'SAVE_SELF_ASSESSMENT', payload: sa });
    }, []);
    const deleteSelfAssessment = useCallback((id: string) => dispatch({ type: 'DELETE_SELF_ASSESSMENT', id }), []);

    const saveSpeakingSession = useCallback((session: SpeakingSession) => {
        dispatch({ type: 'SAVE_SPEAKING_SESSION', payload: session });
    }, []);
    const deleteSpeakingSession = useCallback((id: string) => dispatch({ type: 'DELETE_SPEAKING_SESSION', id }), []);

    const syncRubricSnapshot = useCallback((rubricId: string, updatedRubric: Rubric) => {
        dispatch({ type: 'SYNC_RUBRIC_SNAPSHOT', rubricId, updatedRubric });
    }, []);

    const saveRubricVersion = useCallback((rubricId: string, label?: string) => {
        dispatch({ type: 'SAVE_RUBRIC_VERSION', rubricId, label });
    }, []);

    const restoreRubricVersion = useCallback((rubricId: string, versionIndex: number) => {
        dispatch({ type: 'RESTORE_RUBRIC_VERSION', rubricId, versionIndex });
    }, []);

    const addVocabularyItem = useCallback((rubricId: string, item: Omit<VocabularyItem, 'id'>): VocabularyItem => {
        const v: VocabularyItem = { ...item, id: nanoid() };
        dispatch({ type: 'ADD_VOCABULARY_ITEM', rubricId, payload: v });
        return v;
    }, []);

    const updateVocabularyItem = useCallback((rubricId: string, item: VocabularyItem) => {
        dispatch({ type: 'UPDATE_VOCABULARY_ITEM', rubricId, payload: item });
    }, []);

    const deleteVocabularyItem = useCallback((rubricId: string, itemId: string) => {
        dispatch({ type: 'DELETE_VOCABULARY_ITEM', rubricId, itemId });
    }, []);

    const deleteVocabularyItems = useCallback((rubricId: string, itemIds: string[]) => {
        dispatch({ type: 'DELETE_VOCABULARY_ITEMS_BATCH', rubricId, itemIds });
    }, []);

    const saveAnalysisResult = useCallback((result: DocumentAnalysisResult) => {
        dispatch({ type: 'SAVE_ANALYSIS_RESULT', payload: result });
    }, []);

    const deleteAnalysisResult = useCallback((id: string) => {
        dispatch({ type: 'DELETE_ANALYSIS_RESULT', id });
    }, []);

    const addTest = useCallback((t: Omit<Test, 'id' | 'createdAt' | 'updatedAt'>): Test => {
        const now = new Date().toISOString();
        const test: Test = { ...t, id: nanoid(), createdAt: now, updatedAt: now };
        dispatch({ type: 'ADD_TEST', payload: test });
        return test;
    }, []);

    const updateTest = useCallback((t: Test) => {
        dispatch({ type: 'UPDATE_TEST', payload: t });
    }, []);

    const deleteTest = useCallback((id: string) => dispatch({ type: 'DELETE_TEST', id }), []);

    const saveStudentTest = useCallback((st: StudentTest) => {
        dispatch({ type: 'SAVE_STUDENT_TEST', payload: st });
    }, []);

    const deleteStudentTest = useCallback((id: string) => dispatch({ type: 'DELETE_STUDENT_TEST', id }), []);

    const addEssayAssignments = useCallback((assignments: EssayAssignment[]) => {
        dispatch({ type: 'ADD_ESSAY_ASSIGNMENTS', payload: assignments });
    }, []);

    const updateEssayGroup = useCallback((teacherKey: string, patch: Partial<EssayAssignment>) => {
        dispatch({ type: 'UPDATE_ESSAY_GROUP', teacherKey, patch });
    }, []);

    const deleteEssayGroup = useCallback(
        (teacherKey: string) => dispatch({ type: 'DELETE_ESSAY_GROUP', teacherKey }),
        []
    );

    const addEssaySubmission = useCallback((submission: EssaySubmission) => {
        dispatch({ type: 'ADD_ESSAY_SUBMISSION', payload: submission });
    }, []);

    const saveEssayTemplate = useCallback((t: EssayTemplate) => {
        dispatch({ type: 'SAVE_ESSAY_TEMPLATE', payload: t });
        storageSync.pushOne('essayTemplate', 'upsert', t);
    }, []);
    const deleteEssayTemplate = useCallback((id: string) => {
        dispatch({ type: 'DELETE_ESSAY_TEMPLATE', id });
        storageSync.pushOne('essayTemplate', 'delete', null, id);
    }, []);
    const addGradingTasks = useCallback((tasks: GradingTask[]) => {
        dispatch({ type: 'ADD_GRADING_TASKS', payload: tasks });
        tasks.forEach((task) => storageSync.pushOne('gradingTask', 'upsert', task));
    }, []);
    const deleteGradingTask = useCallback((id: string) => {
        dispatch({ type: 'DELETE_GRADING_TASK', id });
        storageSync.pushOne('gradingTask', 'delete', null, id);
    }, []);

    // Pushed to Supabase via the delta-sync diff() effect below, like essayAssignments.
    const saveUserTemplate = useCallback((t: UserTemplate) => {
        dispatch({ type: 'SAVE_USER_TEMPLATE', payload: t });
    }, []);
    const deleteUserTemplate = useCallback((id: string) => {
        dispatch({ type: 'DELETE_USER_TEMPLATE', id });
    }, []);

    // ─── Database sync ────────────────────────────────────────────────
    const connectDatabase = useCallback(
        async (config: DatabaseConfig): Promise<boolean> => {
            const ok = await storageSync.configure(config);
            if (ok) {
                saveSupabaseConfig(config);
                storageSync.setToastFn(showToast);
                const _userId = storageSync.getCurrentUserId();
                const _client = storageSync.adapter.getClient();
                if (_client && _userId) initAuditLogger(_client, _userId);
                const { data: fresh, error: hydrateError } = await storageSync.hydrate();
                if (hydrateError) showToast(t('toast.sync_load_failed'), 'warning');
                if (fresh) {
                    const base = storageSync.didWipeLocalData() ? loadStore() : state;
                    const merged = mergeStoreData(base, fresh, loadPendingQueue());
                    dispatch({ type: 'SET_ALL', payload: merged });
                    try {
                        await flushToLocalStorage(merged);
                    } catch {
                        showToast(t('toast.storage_full'), 'error');
                    }
                }
            }
            return ok;
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [state]
    );

    const disconnectDatabase = useCallback(() => {
        clearAuditLogger();
        storageSync.disconnect();
    }, []);

    const pushAllToDatabase = useCallback(async () => {
        return storageSync.pushAll(state);
    }, [state]);

    const pullFromDatabase = useCallback(async () => {
        const { data: fresh, error: hydrateError } = await storageSync.hydrate();
        if (hydrateError) showToast(t('toast.sync_load_failed'), 'warning');
        if (fresh) {
            const merged = mergeStoreData(state, fresh, loadPendingQueue());
            dispatch({ type: 'SET_ALL', payload: merged });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state]);

    const fetchAllUsers = useCallback((): Promise<DbUser[]> => {
        return storageSync.fetchAllProfiles();
    }, []);

    const updateUserRole = useCallback(async (userId: string, role: UserRole): Promise<SyncResult> => {
        const result = await storageSync.updateUserRole(userId, role);
        if (result.success) {
            logAuditEvent('admin', 'role_change', 'user', userId, { role });
            if (userId === storageSync.getCurrentUserId()) {
                dispatch({ type: 'UPDATE_SETTINGS', payload: { userRole: role } });
            }
        }
        return result;
    }, []);

    const updateMyProfile = useCallback(async (updates: { displayName?: string }): Promise<SyncResult> => {
        return storageSync.updateMyProfile(updates);
    }, []);

    const saveEssayAssignment = useCallback((a: EssayAssignment) => storageSync.saveEssayAssignment(a), []);
    const setStudentPassword = useCallback(
        (studentEmail: string, password: string) => storageSync.setStudentPassword(studentEmail, password),
        []
    );
    const deleteEssayAssignment = useCallback(
        (teacherKey: string) => storageSync.deleteEssayAssignment(teacherKey),
        []
    );
    const fetchEssaySubmissions = useCallback(
        (teacherKey: string) => storageSync.fetchEssaySubmissions(teacherKey),
        []
    );
    const fetchEssaySubmissionsForStudent = useCallback(
        (rubricId: string, studentId: string) => storageSync.fetchEssaySubmissionsForStudent(rubricId, studentId),
        []
    );
    const fetchAllEssaySubmissions = useCallback(() => storageSync.fetchAllEssaySubmissions(), []);
    const fetchMyEssayAssignments = useCallback(() => storageSync.fetchMyEssayAssignments(), []);
    const fetchEssayAssignmentByKey = useCallback(
        (teacherKey: string) => storageSync.fetchEssayAssignmentByKey(teacherKey),
        []
    );
    const deleteEssaySubmission = useCallback(
        (id: string, path: string) => storageSync.deleteEssaySubmission(id, path),
        []
    );
    const getEssaySignedUrl = useCallback((path: string) => storageSync.getEssaySignedUrl(path), []);
    const saveTestAssignment = useCallback((a: TestAssignment) => storageSync.saveTestAssignment(a), []);
    const fetchMyTestAssignments = useCallback(() => storageSync.fetchMyTestAssignments(), []);
    const fetchAssignedTestContent = useCallback((testId: string) => storageSync.fetchAssignedTestContent(testId), []);

    // ─── Landing / auth flow ──────────────────────────────────────────
    const enterLocalMode = useCallback(() => {
        localStorage.setItem(LOCAL_MODE_KEY, 'true');
        setLandingState('hide');
    }, []);

    const connectForOAuth = useCallback(async (config: DatabaseConfig): Promise<boolean> => {
        saveSupabaseConfig(config);
        return storageSync.initAuth(config);
    }, []);

    const dismissMigrationPrompt = useCallback(
        async (upload: boolean) => {
            setShowMigrationPrompt(false);
            localStorage.setItem(MIGRATION_DONE_KEY, 'true');
            if (upload) await storageSync.pushAll(state);
        },
        [state]
    );

    const signInWithGoogle = useCallback((): Promise<{ error?: string }> => {
        return storageSync.signInWithGoogle();
    }, []);

    const signInWithMicrosoftPersonal = useCallback((): Promise<{ error?: string }> => {
        return storageSync.signInWithMicrosoftPersonal();
    }, []);

    const signInWithAzureAD = useCallback((): Promise<{ error?: string }> => {
        return storageSync.signInWithAzureAD();
    }, []);

    const signOutFromDatabase = useCallback(async () => {
        await storageSync.signOut();
        clearAuditLogger();
        // Shared-device hygiene: wipe this account's data from localStorage so the
        // next person to open the app on this browser doesn't see it. Only safe when
        // everything has actually reached Supabase — a non-empty pending queue means
        // wiping would lose edits that exist nowhere else yet.
        if (loadPendingQueue().length === 0) {
            clearLocalData();
            dispatch({ type: 'SET_ALL', payload: loadStore() });
        } else {
            showToast(t('toast.signout_pending_writes'), 'warning');
        }
        if (localStorage.getItem(LOCAL_MODE_KEY) !== 'true') {
            setLandingState('show');
        }
    }, [showToast, t]);

    // ─── Backup restore ─────────────────────────────────────────────────────────
    const importBackup = useCallback(async (json: string): Promise<boolean> => {
        const ok = importFullBackup(json);
        if (ok) {
            const newState = loadStore();
            dispatch({ type: 'SET_ALL', payload: newState });
            if (storageSync.isConnected()) {
                // pushAll returns SyncResult (never rejects on normal failures).
                // Log the error but let the caller receive true (restore succeeded).
                // The pending-queue will retry the cloud push on reconnect.
                const result = await storageSync.pushAll(newState);
                if (!result.success) {
                    console.warn('[importBackup] local restore succeeded; cloud sync failed', result.error);
                }
            }
        }
        return ok;
    }, []);

    // ─── Microsoft Sync (disabled — Azure integration not in use) ───
    const microsoftUser: any | null = null;
    const loginMicrosoft = useCallback(async () => {}, []);
    const logoutMicrosoft = useCallback(async () => {}, []);
    const syncToOneDrive = useCallback(async () => {}, []);
    const restoreFromOneDrive = useCallback(async () => {}, []);

    // ─── Schools (cloud-only) ──────────────────────────────────────────────────
    const fetchSchools = useCallback(() => storageSync.fetchSchools(), []);
    const createSchool = useCallback(
        (name: string, retentionYears: number) => storageSync.createSchool(name, retentionYears),
        []
    );
    const joinSchool = useCallback((schoolId: string) => storageSync.joinSchool(schoolId), []);
    const updateSchool = useCallback(
        (schoolId: string, updates: { name?: string; retentionYears?: number }) =>
            storageSync.updateSchool(schoolId, updates),
        []
    );
    const deleteSchool = useCallback((schoolId: string) => storageSync.deleteSchool(schoolId), []);
    const fetchSchoolMembers = useCallback((schoolId: string) => storageSync.fetchSchoolMembers(schoolId), []);
    const removeSchoolMember = useCallback(
        (schoolId: string, profileId: string) => storageSync.removeSchoolMember(schoolId, profileId),
        []
    );

    const getCurrentDatabaseUserId = useCallback(() => storageSync.getCurrentUserId(), []);

    // ─── Student anonymization ─────────────────────────────────────────────────
    const anonymizeStudent = useCallback(
        (id: string) => {
            const original = state.students.find((s) => s.id === id);
            logAuditEvent('admin', 'student_anonymize', 'student', id);
            dispatch({ type: 'ANONYMIZE_STUDENT', id });
            if (original) {
                const anonymized = {
                    ...original,
                    name: `Student-${original.id.slice(0, 8)}`,
                    email: undefined,
                    studentNumber: undefined,
                    anonymizedAt: new Date().toISOString(),
                };
                storageSync.pushOne('student', 'upsert', anonymized);
            }
        },
        [state.students]
    );

    const value: AppContextValue = {
        ...state,
        students: state.students.filter((s) => !s.archivedAt),
        archivedStudents: state.students.filter((s) => !!s.archivedAt),
        dispatch,
        addRubric,
        updateRubric,
        deleteRubric,
        addStudent,
        updateStudent,
        deleteStudent,
        restoreStudent,
        addClass,
        updateClass,
        deleteClass,
        mergeClasses,
        saveStudentRubric: saveStudentRubricFn,
        saveRubricSelfAssessment,
        createStudentRubric,
        createGroupStudentRubrics,
        deleteStudentRubric,
        addAttachment,
        deleteAttachment,
        addGradeScale,
        updateGradeScale,
        deleteGradeScale,
        addCommentSnippet,
        updateCommentSnippet,
        deleteCommentSnippet,
        updateSettings,
        getActiveGradeScale,
        addFavoriteStandard,
        removeFavoriteStandard,
        isFavoriteStandard,
        addCommentBankItem,
        updateCommentBankItem,
        deleteCommentBankItem,
        addExportTemplate,
        deleteExportTemplate,
        savePeerReview,
        deletePeerReview,
        saveSelfAssessment,
        deleteSelfAssessment,
        saveSpeakingSession,
        deleteSpeakingSession,
        syncRubricSnapshot,
        saveRubricVersion,
        restoreRubricVersion,
        addVocabularyItem,
        updateVocabularyItem,
        deleteVocabularyItem,
        deleteVocabularyItems,
        saveAnalysisResult,
        deleteAnalysisResult,
        addTest,
        updateTest,
        deleteTest,
        saveStudentTest,
        deleteStudentTest,
        addEssayAssignments,
        updateEssayGroup,
        deleteEssayGroup,
        addEssaySubmission,
        saveEssayTemplate,
        deleteEssayTemplate,
        addGradingTasks,
        deleteGradingTask,
        saveUserTemplate,
        deleteUserTemplate,
        connectDatabase,
        disconnectDatabase,
        pushAllToDatabase,
        pullFromDatabase,
        fetchAllUsers,
        updateUserRole,
        updateMyProfile,
        fetchSchools,
        createSchool,
        joinSchool,
        updateSchool,
        deleteSchool,
        fetchSchoolMembers,
        removeSchoolMember,
        anonymizeStudent,
        getCurrentDatabaseUserId,
        saveEssayAssignment,
        setStudentPassword,
        deleteEssayAssignment,
        fetchEssaySubmissions,
        fetchEssaySubmissionsForStudent,
        fetchAllEssaySubmissions,
        fetchMyEssayAssignments,
        fetchEssayAssignmentByKey,
        deleteEssaySubmission,
        getEssaySignedUrl,
        saveTestAssignment,
        fetchMyTestAssignments,
        fetchAssignedTestContent,
        importBackup,
        showLanding: landingState === 'show',
        isCheckingSession: landingState === 'checking',
        showMigrationPrompt,
        enterLocalMode,
        connectForOAuth,
        dismissMigrationPrompt,
        signInWithGoogle,
        signInWithMicrosoftPersonal,
        signInWithAzureAD,
        signOutFromDatabase,
        loginMicrosoft,
        logoutMicrosoft,
        syncToOneDrive,
        restoreFromOneDrive,
        microsoftUser,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useApp must be used within AppProvider');
    return ctx;
}
