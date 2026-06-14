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
    Test,
    StudentTest,
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
    importFullBackup,
    loadPendingQueue,
} from '../store/storage';
import { mergeStoreData } from '../utils/syncMerge';
import { useTranslation } from 'react-i18next';
import { nanoid } from '../utils/nanoid';
import { storageSync, loadSupabaseConfig, saveSupabaseConfig } from '../services/database';
import type { DatabaseConfig, DbUser, SyncResult } from '../services/database';
import { useToast } from '../hooks/useToast';
import { buildAccentScale, ACCENT_SCALE_STEPS } from '../utils/accentScale';
import { logEvent, initClientLogger, setLoggerContext, STRESS_TEST_LOGGING_ENABLED } from '../services/logging/clientLogger';

// ─── Actions ───────────────────────────────────────────────────────────────────

type Action =
    | { type: 'SET_ALL'; payload: StoreData }
    | { type: 'ADD_RUBRIC'; payload: Rubric }
    | { type: 'UPDATE_RUBRIC'; payload: Rubric }
    | { type: 'DELETE_RUBRIC'; id: string }
    | { type: 'ADD_STUDENT'; payload: Student }
    | { type: 'UPDATE_STUDENT'; payload: Student }
    | { type: 'DELETE_STUDENT'; id: string }
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
    | { type: 'DELETE_STUDENT_TEST'; id: string };

function reducer(state: StoreData, action: Action): StoreData {
    switch (action.type) {
        case 'SET_ALL':
            return action.payload;
        case 'ADD_RUBRIC': {
            const next = [...state.rubrics, action.payload];
            saveRubrics(next);
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
            saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'DELETE_RUBRIC': {
            const next = state.rubrics.filter((r) => r.id !== action.id);
            saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'ADD_STUDENT': {
            const next = [...state.students, { ...action.payload, updatedAt: new Date().toISOString() }];
            saveStudents(next);
            return { ...state, students: next };
        }
        case 'UPDATE_STUDENT': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const next = state.students.map((s) => (s.id === payload.id ? payload : s));
            saveStudents(next);
            return { ...state, students: next };
        }
        case 'DELETE_STUDENT': {
            const next = state.students.filter((s) => s.id !== action.id);
            saveStudents(next);
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
            saveStudents(next);
            return { ...state, students: next };
        }
        case 'ADD_CLASS': {
            const next = [...state.classes, { ...action.payload, updatedAt: new Date().toISOString() }];
            saveClasses(next);
            return { ...state, classes: next };
        }
        case 'UPDATE_CLASS': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const next = state.classes.map((c) => (c.id === payload.id ? payload : c));
            saveClasses(next);
            return { ...state, classes: next };
        }
        case 'DELETE_CLASS': {
            const next = state.classes.filter((c) => c.id !== action.id);
            saveClasses(next);
            return { ...state, classes: next };
        }
        case 'SAVE_STUDENT_RUBRIC': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const exists = state.studentRubrics.findIndex((sr) => sr.id === payload.id);
            const next =
                exists >= 0
                    ? state.studentRubrics.map((sr) => (sr.id === payload.id ? payload : sr))
                    : [...state.studentRubrics, payload];
            saveStudentRubrics(next);
            return { ...state, studentRubrics: next };
        }
        case 'DELETE_STUDENT_RUBRIC': {
            const next = state.studentRubrics.filter((sr) => sr.id !== action.id);
            saveStudentRubrics(next);
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
            saveStudentRubrics(next);
            return { ...state, studentRubrics: next };
        }
        case 'ADD_ATTACHMENT': {
            const next = [...state.attachments, action.payload];
            saveAttachments(next);
            return { ...state, attachments: next };
        }
        case 'DELETE_ATTACHMENT': {
            const next = state.attachments.filter((a) => a.id !== action.id);
            saveAttachments(next);
            return { ...state, attachments: next };
        }
        case 'ADD_GRADE_SCALE': {
            const next = [...state.gradeScales, { ...action.payload, updatedAt: new Date().toISOString() }];
            saveGradeScales(next);
            return { ...state, gradeScales: next };
        }
        case 'UPDATE_GRADE_SCALE': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const next = state.gradeScales.map((gs) => (gs.id === payload.id ? payload : gs));
            saveGradeScales(next);
            return { ...state, gradeScales: next };
        }
        case 'DELETE_GRADE_SCALE': {
            const next = state.gradeScales.filter((gs) => gs.id !== action.id);
            saveGradeScales(next);
            return { ...state, gradeScales: next };
        }
        case 'ADD_COMMENT_SNIPPET': {
            const next = [...state.commentSnippets, { ...action.payload, updatedAt: new Date().toISOString() }];
            saveCommentSnippets(next);
            return { ...state, commentSnippets: next };
        }
        case 'UPDATE_COMMENT_SNIPPET': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const next = state.commentSnippets.map((cs) => (cs.id === payload.id ? payload : cs));
            saveCommentSnippets(next);
            return { ...state, commentSnippets: next };
        }
        case 'DELETE_COMMENT_SNIPPET': {
            const next = state.commentSnippets.filter((cs) => cs.id !== action.id);
            saveCommentSnippets(next);
            return { ...state, commentSnippets: next };
        }
        case 'UPDATE_SETTINGS': {
            const next = { ...state.settings, ...action.payload };
            saveSettings(next);
            return { ...state, settings: next };
        }
        case 'ADD_FAVORITE_STANDARD': {
            if (state.favoriteStandards.some((s) => s.guid === action.payload.guid)) return state;
            const next = [...state.favoriteStandards, action.payload];
            saveFavoriteStandards(next);
            return { ...state, favoriteStandards: next };
        }
        case 'REMOVE_FAVORITE_STANDARD': {
            const next = state.favoriteStandards.filter((s) => s.guid !== action.guid);
            saveFavoriteStandards(next);
            return { ...state, favoriteStandards: next };
        }
        case 'ADD_COMMENT_BANK_ITEM': {
            const next = [...state.commentBank, { ...action.payload, updatedAt: new Date().toISOString() }];
            saveCommentBank(next);
            return { ...state, commentBank: next };
        }
        case 'UPDATE_COMMENT_BANK_ITEM': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const next = state.commentBank.map((i) => (i.id === payload.id ? payload : i));
            saveCommentBank(next);
            return { ...state, commentBank: next };
        }
        case 'DELETE_COMMENT_BANK_ITEM': {
            const next = state.commentBank.filter((i) => i.id !== action.id);
            saveCommentBank(next);
            return { ...state, commentBank: next };
        }
        case 'ADD_EXPORT_TEMPLATE': {
            const next = [...state.exportTemplates, action.payload];
            saveExportTemplates(next);
            return { ...state, exportTemplates: next };
        }
        case 'DELETE_EXPORT_TEMPLATE': {
            const next = state.exportTemplates.filter((t) => t.id !== action.id);
            saveExportTemplates(next);
            return { ...state, exportTemplates: next };
        }
        case 'SAVE_PEER_REVIEW': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const exists = state.peerReviews.findIndex((sr) => sr.id === payload.id);
            const next =
                exists >= 0
                    ? state.peerReviews.map((sr) => (sr.id === payload.id ? payload : sr))
                    : [...state.peerReviews, payload];
            savePeerReviews(next);
            return { ...state, peerReviews: next };
        }
        case 'DELETE_PEER_REVIEW': {
            const next = state.peerReviews.filter((sr) => sr.id !== action.id);
            savePeerReviews(next);
            return { ...state, peerReviews: next };
        }
        case 'SAVE_SELF_ASSESSMENT': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const exists = state.selfAssessments.findIndex((sa) => sa.id === payload.id);
            const next =
                exists >= 0
                    ? state.selfAssessments.map((sa) => (sa.id === payload.id ? payload : sa))
                    : [...state.selfAssessments, payload];
            saveSelfAssessments(next);
            return { ...state, selfAssessments: next };
        }
        case 'DELETE_SELF_ASSESSMENT': {
            const next = state.selfAssessments.filter((sa) => sa.id !== action.id);
            saveSelfAssessments(next);
            return { ...state, selfAssessments: next };
        }
        case 'SAVE_SPEAKING_SESSION': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const existing = state.speakingSessions.find((s) => s.id === payload.id);
            const next = existing
                ? state.speakingSessions.map((s) => (s.id === payload.id ? payload : s))
                : [...state.speakingSessions, payload];
            saveSpeakingSessions(next);
            return { ...state, speakingSessions: next };
        }
        case 'DELETE_SPEAKING_SESSION': {
            const next = state.speakingSessions.filter((s) => s.id !== action.id);
            saveSpeakingSessions(next);
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
            saveStudentRubrics(nextSRs);
            const nextPRs = state.peerReviews.map(syncSr);
            savePeerReviews(nextPRs);
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
            saveRubrics(next);
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
            saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'ADD_VOCABULARY_ITEM': {
            const next = state.rubrics.map((r) => {
                if (r.id !== action.rubricId) return r;
                return { ...r, vocabularyItems: [...(r.vocabularyItems ?? []), action.payload] };
            });
            saveRubrics(next);
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
            saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'DELETE_VOCABULARY_ITEM': {
            const next = state.rubrics.map((r) => {
                if (r.id !== action.rubricId) return r;
                return { ...r, vocabularyItems: (r.vocabularyItems ?? []).filter((v) => v.id !== action.itemId) };
            });
            saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'DELETE_VOCABULARY_ITEMS_BATCH': {
            const idSet = new Set(action.itemIds);
            const next = state.rubrics.map((r) => {
                if (r.id !== action.rubricId) return r;
                return { ...r, vocabularyItems: (r.vocabularyItems ?? []).filter((v) => !idSet.has(v.id)) };
            });
            saveRubrics(next);
            return { ...state, rubrics: next };
        }
        case 'SAVE_ANALYSIS_RESULT': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const exists = state.analysisResults.findIndex((r) => r.id === payload.id);
            const next =
                exists >= 0
                    ? state.analysisResults.map((r) => (r.id === payload.id ? payload : r))
                    : [...state.analysisResults, payload];
            saveAnalysisResults(next);
            return { ...state, analysisResults: next };
        }
        case 'DELETE_ANALYSIS_RESULT': {
            const next = state.analysisResults.filter((r) => r.id !== action.id);
            saveAnalysisResults(next);
            return { ...state, analysisResults: next };
        }
        case 'ADD_TEST': {
            const next = [...state.tests, action.payload];
            saveTests(next);
            return { ...state, tests: next };
        }
        case 'UPDATE_TEST': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const next = state.tests.map((t) => (t.id === payload.id ? payload : t));
            saveTests(next);
            return { ...state, tests: next };
        }
        case 'DELETE_TEST': {
            const next = state.tests.filter((t) => t.id !== action.id);
            saveTests(next);
            const nextStudentTests = state.studentTests.filter((st) => st.testId !== action.id);
            saveStudentTests(nextStudentTests);
            return { ...state, tests: next, studentTests: nextStudentTests };
        }
        case 'SAVE_STUDENT_TEST': {
            const payload = { ...action.payload, updatedAt: new Date().toISOString() };
            const exists = state.studentTests.findIndex((st) => st.id === payload.id);
            const next =
                exists >= 0
                    ? state.studentTests.map((st) => (st.id === payload.id ? payload : st))
                    : [...state.studentTests, payload];
            saveStudentTests(next);
            return { ...state, studentTests: next };
        }
        case 'DELETE_STUDENT_TEST': {
            const next = state.studentTests.filter((st) => st.id !== action.id);
            saveStudentTests(next);
            return { ...state, studentTests: next };
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
    addClass: (c: Omit<Class, 'id'>) => Class;
    updateClass: (c: Class) => void;
    deleteClass: (id: string, deleteStudents?: boolean) => void;
    mergeClasses: (sourceClassId: string, targetClassId: string) => void;
    saveStudentRubric: (sr: StudentRubric) => void;
    saveRubricSelfAssessment: (id: string, levels: Record<string, string | null>, reflection: string) => void;
    createStudentRubric: (rubricId: string, studentId: string) => StudentRubric;
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
    // Database sync
    connectDatabase: (config: DatabaseConfig) => Promise<boolean>;
    disconnectDatabase: () => void;
    pushAllToDatabase: () => Promise<{ success: boolean; error?: string }>;
    pullFromDatabase: () => Promise<void>;
    // User / profile management
    fetchAllUsers: () => Promise<DbUser[]>;
    updateUserRole: (userId: string, role: 'admin' | 'user' | 'student') => Promise<SyncResult>;
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
}

export function AppProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(loggingReducer, null, loadStore);
    const initialStateRef = useRef(state);
    const currentStateRef = useRef(state);
    const { showToast } = useToast();
    const { t } = useTranslation();

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
        const accent = state.settings.accentColor || '#3b82f6';
        const root = document.documentElement;
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
        const fontKey = state.settings.uiFontFamily || 'Inter';
        const GOOGLE_FONTS: Record<string, string> = {
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
                const merged = mergeStoreData(initialStateRef.current, fresh, loadPendingQueue());
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
                if (localStorage.getItem(MIGRATION_DONE_KEY) !== 'true') {
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

    // ── Stress-test logging: keep context/destination in sync with auth + role ───
    useEffect(() => {
        if (!STRESS_TEST_LOGGING_ENABLED) return;
        const ctx = {
            role: state.settings.userRole,
            schoolId: state.settings.schoolId,
            userId: storageSync.getCurrentUserId() ?? undefined,
        };
        const client = storageSync.adapter.getClient();
        if (client) initClientLogger(client, ctx);
        else setLoggerContext(ctx);
    }, [state.settings.userRole, state.settings.schoolId]);

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
                    const merged = mergeStoreData(initialStateRef.current, fresh, loadPendingQueue());
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
                if (prevMap.get(id) !== JSON.stringify(item)) storageSync.pushOne(entity, 'upsert', item);
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
    }, []);

    const deleteRubric = useCallback((id: string) => dispatch({ type: 'DELETE_RUBRIC', id }), []);

    const addStudent = useCallback((s: Omit<Student, 'id'>): Student => {
        const student: Student = { ...s, id: nanoid() };
        dispatch({ type: 'ADD_STUDENT', payload: student });
        return student;
    }, []);

    const updateStudent = useCallback((s: Student) => dispatch({ type: 'UPDATE_STUDENT', payload: s }), []);
    const deleteStudent = useCallback((id: string) => dispatch({ type: 'DELETE_STUDENT', id }), []);

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

    // ─── Database sync ────────────────────────────────────────────────
    const connectDatabase = useCallback(
        async (config: DatabaseConfig): Promise<boolean> => {
            const ok = await storageSync.configure(config);
            if (ok) {
                saveSupabaseConfig(config);
                storageSync.setToastFn(showToast);
                const { data: fresh, error: hydrateError } = await storageSync.hydrate();
                if (hydrateError) showToast(t('toast.sync_load_failed'), 'warning');
                if (fresh) {
                    const merged = mergeStoreData(state, fresh, loadPendingQueue());
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

    const updateUserRole = useCallback(
        async (userId: string, role: 'admin' | 'user' | 'student'): Promise<SyncResult> => {
            const result = await storageSync.updateUserRole(userId, role);
            // If the role change affected the current user, sync it to local settings
            if (result.success && userId === storageSync.getCurrentUserId()) {
                dispatch({ type: 'UPDATE_SETTINGS', payload: { userRole: role } });
            }
            return result;
        },
        []
    );

    const updateMyProfile = useCallback(async (updates: { displayName?: string }): Promise<SyncResult> => {
        return storageSync.updateMyProfile(updates);
    }, []);

    const saveEssayAssignment = useCallback((a: EssayAssignment) => storageSync.saveEssayAssignment(a), []);
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
        if (localStorage.getItem(LOCAL_MODE_KEY) !== 'true') {
            setLandingState('show');
        }
    }, []);

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
        dispatch,
        addRubric,
        updateRubric,
        deleteRubric,
        addStudent,
        updateStudent,
        deleteStudent,
        addClass,
        updateClass,
        deleteClass,
        mergeClasses,
        saveStudentRubric: saveStudentRubricFn,
        saveRubricSelfAssessment,
        createStudentRubric,
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
        deleteEssayAssignment,
        fetchEssaySubmissions,
        fetchEssaySubmissionsForStudent,
        fetchAllEssaySubmissions,
        fetchMyEssayAssignments,
        fetchEssayAssignmentByKey,
        deleteEssaySubmission,
        getEssaySignedUrl,
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
