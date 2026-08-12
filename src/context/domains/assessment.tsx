// Generated from src/context/AppContext.tsx by the domain-split refactor.
import React, { createContext, useMemo, ReactNode } from 'react';
import { AppContextValue, StoreActionsCtx, useContextOrThrow } from '../storeCore';
import type {
    DocumentAnalysisResult,
    DocumentComment,
    GradingTask,
    SelfAssessment,
    SpeakingSession,
    StudentRubric,
    StudentTest,
    Test,
    TestAssignment,
} from '../../types';
import { StoreData } from '../../store/storage';
import { nanoid } from '../../utils/nanoid';
import { loadDb } from '../../services/database/lazyDb';

export type AssessmentValue = Pick<
    AppContextValue,
    | 'tests'
    | 'studentTests'
    | 'peerReviews'
    | 'selfAssessments'
    | 'speakingSessions'
    | 'analysisResults'
    | 'documentComments'
    | 'gradingTasks'
    | 'savePeerReview'
    | 'deletePeerReview'
    | 'saveSelfAssessment'
    | 'deleteSelfAssessment'
    | 'saveSpeakingSession'
    | 'deleteSpeakingSession'
    | 'saveAnalysisResult'
    | 'deleteAnalysisResult'
    | 'addTest'
    | 'updateTest'
    | 'deleteTest'
    | 'saveStudentTest'
    | 'deleteStudentTest'
    | 'addDocumentComment'
    | 'resolveDocumentComment'
    | 'deleteDocumentComment'
    | 'addGradingTasks'
    | 'deleteGradingTask'
    | 'saveTestAssignment'
    | 'fetchMyTestAssignments'
    | 'fetchAssignedTestContent'
    | 'fetchTestAssignmentTeacherKeys'
    | 'setPlacementOverride'
>;

const AssessmentContext = createContext<AssessmentValue | null>(null);

export type AssessmentActions = Pick<
    AssessmentValue,
    | 'addDocumentComment'
    | 'resolveDocumentComment'
    | 'deleteDocumentComment'
    | 'savePeerReview'
    | 'deletePeerReview'
    | 'saveSelfAssessment'
    | 'deleteSelfAssessment'
    | 'saveSpeakingSession'
    | 'deleteSpeakingSession'
    | 'saveAnalysisResult'
    | 'deleteAnalysisResult'
    | 'addTest'
    | 'updateTest'
    | 'deleteTest'
    | 'saveStudentTest'
    | 'deleteStudentTest'
    | 'addGradingTasks'
    | 'deleteGradingTask'
    | 'saveTestAssignment'
    | 'fetchMyTestAssignments'
    | 'fetchAssignedTestContent'
    | 'fetchTestAssignmentTeacherKeys'
    | 'setPlacementOverride'
>;

export function createAssessmentActions(ctx: StoreActionsCtx): AssessmentActions {
    const { dispatch } = ctx;
    const addDocumentComment = (c: Omit<DocumentComment, 'id' | 'createdAt' | 'resolved'>): DocumentComment => {
        const comment: DocumentComment = {
            ...c,
            id: nanoid(),
            createdAt: new Date().toISOString(),
            resolved: false,
        };
        dispatch({ type: 'ADD_DOCUMENT_COMMENT', payload: comment });
        return comment;
    };
    const resolveDocumentComment = (id: string, resolved: boolean) =>
        dispatch({ type: 'RESOLVE_DOCUMENT_COMMENT', id, resolved });
    const deleteDocumentComment = (id: string) => dispatch({ type: 'DELETE_DOCUMENT_COMMENT', id });
    const savePeerReview = (sr: StudentRubric) => {
        dispatch({ type: 'SAVE_PEER_REVIEW', payload: sr });
    };
    const deletePeerReview = (id: string) => dispatch({ type: 'DELETE_PEER_REVIEW', id });
    const saveSelfAssessment = (sa: SelfAssessment) => {
        dispatch({ type: 'SAVE_SELF_ASSESSMENT', payload: sa });
    };
    const deleteSelfAssessment = (id: string) => dispatch({ type: 'DELETE_SELF_ASSESSMENT', id });
    const saveSpeakingSession = (session: SpeakingSession) => {
        dispatch({ type: 'SAVE_SPEAKING_SESSION', payload: session });
    };
    const deleteSpeakingSession = (id: string) => dispatch({ type: 'DELETE_SPEAKING_SESSION', id });
    const saveAnalysisResult = (result: DocumentAnalysisResult) => {
        dispatch({ type: 'SAVE_ANALYSIS_RESULT', payload: result });
    };
    const deleteAnalysisResult = (id: string) => {
        dispatch({ type: 'DELETE_ANALYSIS_RESULT', id });
    };
    const addTest = (t: Omit<Test, 'id' | 'createdAt' | 'updatedAt'>): Test => {
        const now = new Date().toISOString();
        const test: Test = { ...t, id: nanoid(), createdAt: now, updatedAt: now };
        dispatch({ type: 'ADD_TEST', payload: test });
        return test;
    };
    const updateTest = (t: Test) => {
        dispatch({ type: 'UPDATE_TEST', payload: t });
    };
    const deleteTest = (id: string) => dispatch({ type: 'DELETE_TEST', id });
    const saveStudentTest = (st: StudentTest) => {
        dispatch({ type: 'SAVE_STUDENT_TEST', payload: st });
    };
    const deleteStudentTest = (id: string) => dispatch({ type: 'DELETE_STUDENT_TEST', id });
    const addGradingTasks = (tasks: GradingTask[]) => {
        dispatch({ type: 'ADD_GRADING_TASKS', payload: tasks });
        void loadDb()
            .then(({ storageSync }) =>
                Promise.all(tasks.map((task) => storageSync.pushOne('gradingTask', 'upsert', task)))
            )
            .catch((e) => console.error('[sync] failed to push gradingTasks', e));
    };
    const deleteGradingTask = (id: string) => {
        dispatch({ type: 'DELETE_GRADING_TASK', id });
        void loadDb()
            .then(({ storageSync }) => storageSync.pushOne('gradingTask', 'delete', null, id))
            .catch((e) => console.error('[sync] failed to push gradingTask deletion', e));
    };
    const saveTestAssignment = async (a: TestAssignment) => (await loadDb()).storageSync.saveTestAssignment(a);
    const fetchMyTestAssignments = async () => (await loadDb()).storageSync.fetchMyTestAssignments();
    const fetchAssignedTestContent = async (testId: string) =>
        (await loadDb()).storageSync.fetchAssignedTestContent(testId);
    const fetchTestAssignmentTeacherKeys = async (testId: string) =>
        (await loadDb()).storageSync.fetchTestAssignmentTeacherKeys(testId);
    const setPlacementOverride = async (assignmentId: string, direction: 'up' | 'down') =>
        (await loadDb()).storageSync.setPlacementOverride(assignmentId, direction);
    return {
        addDocumentComment,
        resolveDocumentComment,
        deleteDocumentComment,
        savePeerReview,
        deletePeerReview,
        saveSelfAssessment,
        deleteSelfAssessment,
        saveSpeakingSession,
        deleteSpeakingSession,
        saveAnalysisResult,
        deleteAnalysisResult,
        addTest,
        updateTest,
        deleteTest,
        saveStudentTest,
        deleteStudentTest,
        addGradingTasks,
        deleteGradingTask,
        saveTestAssignment,
        fetchMyTestAssignments,
        fetchAssignedTestContent,
        fetchTestAssignmentTeacherKeys,
        setPlacementOverride,
    };
}

export function useAssessmentValue(state: StoreData, actions: AssessmentActions): AssessmentValue {
    return useMemo(
        () => ({
            tests: state.tests,
            studentTests: state.studentTests,
            peerReviews: state.peerReviews,
            selfAssessments: state.selfAssessments,
            speakingSessions: state.speakingSessions,
            analysisResults: state.analysisResults,
            documentComments: state.documentComments,
            gradingTasks: state.gradingTasks,
            ...actions,
        }),
        [
            actions,
            state.tests,
            state.studentTests,
            state.peerReviews,
            state.selfAssessments,
            state.speakingSessions,
            state.analysisResults,
            state.documentComments,
            state.gradingTasks,
        ]
    );
}

export function AssessmentProvider({
    ctx,
    state,
    children,
}: {
    ctx: StoreActionsCtx;
    state: StoreData;
    children: ReactNode;
}) {
    const actions = useMemo(() => createAssessmentActions(ctx), [ctx]);
    const value = useAssessmentValue(state, actions);
    return <AssessmentContext.Provider value={value}>{children}</AssessmentContext.Provider>;
}

export function useAssessment(): AssessmentValue {
    return useContextOrThrow(AssessmentContext, 'useAssessment');
}
