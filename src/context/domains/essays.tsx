// Generated from src/context/AppContext.tsx by the domain-split refactor.
import React, { createContext, useMemo, ReactNode } from 'react';
import { AppContextValue, StoreActionsCtx, useContextOrThrow } from '../storeCore';
import type {
    EssayAssignment,
    EssaySubmission,
    EssayTemplate,
    Message,
    NewsFlash,
    NewsFlashRead,
    NotificationDismissal,
    NotificationDismissalType,
} from '../../types';
import { StoreData } from '../../store/storage';
import { nanoid } from '../../utils/nanoid';
import { loadDb } from '../../services/database/lazyDb';

export type EssaysValue = Pick<
    AppContextValue,
    | 'essayAssignments'
    | 'essaySubmissions'
    | 'essayTemplates'
    | 'messages'
    | 'newsFlashes'
    | 'newsFlashReads'
    | 'notificationDismissals'
    | 'addEssayAssignments'
    | 'updateEssayGroup'
    | 'deleteEssayGroup'
    | 'addEssaySubmission'
    | 'saveEssayTemplate'
    | 'deleteEssayTemplate'
    | 'saveEssayAssignment'
    | 'deleteEssayAssignment'
    | 'fetchEssaySubmissions'
    | 'fetchEssaySubmissionsForStudent'
    | 'fetchAllEssaySubmissions'
    | 'fetchMyEssayAssignments'
    | 'fetchEssayAssignmentByKey'
    | 'deleteEssaySubmission'
    | 'getEssaySignedUrl'
    | 'sendMessage'
    | 'markMessageReadByTeacher'
    | 'notifyStudentMessage'
    | 'addNewsFlash'
    | 'updateNewsFlash'
    | 'deleteNewsFlash'
    | 'markNewsFlashRead'
    | 'dismissNotification'
    | 'fetchMyMessages'
    | 'sendMessageAsStudent'
    | 'markMessagesReadByStudent'
    | 'fetchMyNewsFlashes'
    | 'markNewsFlashReadAsStudent'
>;

const EssaysContext = createContext<EssaysValue | null>(null);

export type EssaysActions = Pick<
    EssaysValue,
    | 'dismissNotification'
    | 'addEssayAssignments'
    | 'updateEssayGroup'
    | 'deleteEssayGroup'
    | 'addEssaySubmission'
    | 'saveEssayTemplate'
    | 'deleteEssayTemplate'
    | 'sendMessage'
    | 'markMessageReadByTeacher'
    | 'addNewsFlash'
    | 'updateNewsFlash'
    | 'deleteNewsFlash'
    | 'markNewsFlashRead'
    | 'saveEssayAssignment'
    | 'notifyStudentMessage'
    | 'deleteEssayAssignment'
    | 'fetchEssaySubmissions'
    | 'fetchEssaySubmissionsForStudent'
    | 'fetchAllEssaySubmissions'
    | 'fetchMyEssayAssignments'
    | 'fetchEssayAssignmentByKey'
    | 'deleteEssaySubmission'
    | 'getEssaySignedUrl'
    | 'fetchMyMessages'
    | 'sendMessageAsStudent'
    | 'markMessagesReadByStudent'
    | 'fetchMyNewsFlashes'
    | 'markNewsFlashReadAsStudent'
>;

export function createEssaysActions(ctx: StoreActionsCtx): EssaysActions {
    const { getState, dispatch } = ctx;
    const dismissNotification = (type: NotificationDismissalType, entityId: string, fingerprint: string): void => {
        const dismissal: NotificationDismissal = {
            id: `${type}:${entityId}`,
            type,
            entityId,
            fingerprint,
            dismissedAt: new Date().toISOString(),
        };
        dispatch({ type: 'DISMISS_NOTIFICATION', payload: dismissal });
    };
    const addEssayAssignments = (assignments: EssayAssignment[]) => {
        dispatch({ type: 'ADD_ESSAY_ASSIGNMENTS', payload: assignments });
    };
    const updateEssayGroup = (teacherKey: string, patch: Partial<EssayAssignment>) => {
        dispatch({ type: 'UPDATE_ESSAY_GROUP', teacherKey, patch });
    };
    const deleteEssayGroup = (teacherKey: string) => dispatch({ type: 'DELETE_ESSAY_GROUP', teacherKey });
    const addEssaySubmission = (submission: EssaySubmission) => {
        dispatch({ type: 'ADD_ESSAY_SUBMISSION', payload: submission });
    };
    const saveEssayTemplate = (t: EssayTemplate) => {
        dispatch({ type: 'SAVE_ESSAY_TEMPLATE', payload: t });
        void loadDb()
            .then(({ storageSync }) => storageSync.pushOne('essayTemplate', 'upsert', t))
            .catch((e) => console.error('[sync] failed to push essayTemplate', e));
    };
    const deleteEssayTemplate = (id: string) => {
        dispatch({ type: 'DELETE_ESSAY_TEMPLATE', id });
        void loadDb()
            .then(({ storageSync }) => storageSync.pushOne('essayTemplate', 'delete', null, id))
            .catch((e) => console.error('[sync] failed to push essayTemplate deletion', e));
    };
    const sendMessage = (m: Message) => {
        dispatch({ type: 'SEND_MESSAGE', payload: m });
        void loadDb()
            .then(({ storageSync }) => storageSync.pushOne('message', 'upsert', m))
            .catch((e) => console.error('[sync] failed to push message', e));
    };
    const markMessageReadByTeacher = (id: string) => {
        dispatch({ type: 'MARK_MESSAGE_READ_BY_TEACHER', id });
        const msg = getState().messages.find((m) => m.id === id);
        if (msg)
            void loadDb()
                .then(({ storageSync }) => storageSync.pushOne('message', 'upsert', { ...msg, readByTeacher: true }))
                .catch((e) => console.error('[sync] failed to push message read-receipt', e));
    };
    const addNewsFlash = (f: Omit<NewsFlash, 'id' | 'createdAt'>): NewsFlash => {
        const flash: NewsFlash = { ...f, id: nanoid(), createdAt: new Date().toISOString() };
        dispatch({ type: 'ADD_NEWS_FLASH', payload: flash });
        return flash;
    };
    const updateNewsFlash = (f: NewsFlash) => {
        dispatch({ type: 'UPDATE_NEWS_FLASH', payload: f });
    };
    const deleteNewsFlash = (id: string) => {
        dispatch({ type: 'DELETE_NEWS_FLASH', id });
    };
    const markNewsFlashRead = (r: NewsFlashRead) => {
        dispatch({ type: 'SAVE_NEWS_FLASH_READ', payload: r });
    };
    const saveEssayAssignment = async (a: EssayAssignment) => (await loadDb()).storageSync.saveEssayAssignment(a);
    const notifyStudentMessage = async (studentId: string, contextLabel: string | null, bodyPreview: string) =>
        (await loadDb()).storageSync.notifyStudentMessage(studentId, contextLabel, bodyPreview);
    const deleteEssayAssignment = async (teacherKey: string) =>
        (await loadDb()).storageSync.deleteEssayAssignment(teacherKey);
    const fetchEssaySubmissions = async (teacherKey: string) =>
        (await loadDb()).storageSync.fetchEssaySubmissions(teacherKey);
    const fetchEssaySubmissionsForStudent = async (rubricId: string, studentId: string) =>
        (await loadDb()).storageSync.fetchEssaySubmissionsForStudent(rubricId, studentId);
    const fetchAllEssaySubmissions = async () => (await loadDb()).storageSync.fetchAllEssaySubmissions();
    const fetchMyEssayAssignments = async () => (await loadDb()).storageSync.fetchMyEssayAssignments();
    const fetchEssayAssignmentByKey = async (teacherKey: string) =>
        (await loadDb()).storageSync.fetchEssayAssignmentByKey(teacherKey);
    const deleteEssaySubmission = async (id: string, path: string) =>
        (await loadDb()).storageSync.deleteEssaySubmission(id, path);
    const getEssaySignedUrl = async (path: string) => (await loadDb()).storageSync.getEssaySignedUrl(path);
    const fetchMyMessages = async () => (await loadDb()).storageSync.fetchMyMessages();
    const sendMessageAsStudent = async (m: Message) => (await loadDb()).storageSync.sendMessageAsStudent(m);
    const markMessagesReadByStudent = async (ids: string[]) =>
        (await loadDb()).storageSync.markMessagesReadByStudent(ids);
    const fetchMyNewsFlashes = async () => (await loadDb()).storageSync.fetchMyNewsFlashes();
    const markNewsFlashReadAsStudent = async (r: NewsFlashRead) =>
        (await loadDb()).storageSync.markNewsFlashReadAsStudent(r);
    return {
        dismissNotification,
        addEssayAssignments,
        updateEssayGroup,
        deleteEssayGroup,
        addEssaySubmission,
        saveEssayTemplate,
        deleteEssayTemplate,
        sendMessage,
        markMessageReadByTeacher,
        addNewsFlash,
        updateNewsFlash,
        deleteNewsFlash,
        markNewsFlashRead,
        saveEssayAssignment,
        notifyStudentMessage,
        deleteEssayAssignment,
        fetchEssaySubmissions,
        fetchEssaySubmissionsForStudent,
        fetchAllEssaySubmissions,
        fetchMyEssayAssignments,
        fetchEssayAssignmentByKey,
        deleteEssaySubmission,
        getEssaySignedUrl,
        fetchMyMessages,
        sendMessageAsStudent,
        markMessagesReadByStudent,
        fetchMyNewsFlashes,
        markNewsFlashReadAsStudent,
    };
}

export function useEssaysValue(state: StoreData, actions: EssaysActions): EssaysValue {
    return useMemo(
        () => ({
            essayAssignments: state.essayAssignments,
            essaySubmissions: state.essaySubmissions,
            essayTemplates: state.essayTemplates,
            messages: state.messages,
            newsFlashes: state.newsFlashes,
            newsFlashReads: state.newsFlashReads,
            notificationDismissals: state.notificationDismissals,
            ...actions,
        }),
        [
            actions,
            state.essayAssignments,
            state.essaySubmissions,
            state.essayTemplates,
            state.messages,
            state.newsFlashes,
            state.newsFlashReads,
            state.notificationDismissals,
        ]
    );
}

export function EssaysProvider({
    ctx,
    state,
    children,
}: {
    ctx: StoreActionsCtx;
    state: StoreData;
    children: ReactNode;
}) {
    const actions = useMemo(() => createEssaysActions(ctx), [ctx]);
    const value = useEssaysValue(state, actions);
    return <EssaysContext.Provider value={value}>{children}</EssaysContext.Provider>;
}

export function useEssays(): EssaysValue {
    return useContextOrThrow(EssaysContext, 'useEssays');
}
