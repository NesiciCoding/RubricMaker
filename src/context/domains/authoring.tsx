// Generated from src/context/AppContext.tsx by the domain-split refactor.
import React, { createContext, useMemo, ReactNode } from 'react';
import { AppContextValue, StoreActionsCtx, isOffline, recordAutoVersion, useContextOrThrow } from '../storeCore';
import type {
    CefrLevel,
    CommentBankItem,
    ExportTemplate,
    GradeScale,
    LinkedStandard,
    QuestionBankItem,
    QuestionBankSkill,
    Rubric,
    RubricVersion,
    TestQuestion,
    UserTemplate,
    VocabularyItem,
} from '../../types';
import { StoreData, loadRubricVersions, upsertRubricVersion } from '../../store/storage';
import { nanoid } from '../../utils/nanoid';
import { getDb } from '../../services/database/lazyDb';
import { logAuditEvent } from '../../services/database/AuditLogger';

export type AuthoringValue = Pick<
    AppContextValue,
    | 'rubrics'
    | 'gradeScales'
    | 'favoriteStandards'
    | 'commentBank'
    | 'exportTemplates'
    | 'userTemplates'
    | 'questionBank'
    | 'addRubric'
    | 'updateRubric'
    | 'deleteRubric'
    | 'addGradeScale'
    | 'updateGradeScale'
    | 'deleteGradeScale'
    | 'addFavoriteStandard'
    | 'removeFavoriteStandard'
    | 'isFavoriteStandard'
    | 'addCommentBankItem'
    | 'updateCommentBankItem'
    | 'deleteCommentBankItem'
    | 'recordCommentBankUsage'
    | 'addQuestionBankItem'
    | 'addSectionBankItem'
    | 'addQuestionBankItems'
    | 'updateQuestionBankItem'
    | 'deleteQuestionBankItem'
    | 'deleteQuestionBankItems'
    | 'bulkUpdateQuestionBankItems'
    | 'addExportTemplate'
    | 'deleteExportTemplate'
    | 'saveUserTemplate'
    | 'deleteUserTemplate'
    | 'syncRubricSnapshot'
    | 'fetchRubricVersions'
    | 'saveRubricVersion'
    | 'restoreRubricVersion'
    | 'addVocabularyItem'
    | 'updateVocabularyItem'
    | 'deleteVocabularyItem'
    | 'deleteVocabularyItems'
>;

const AuthoringContext = createContext<AuthoringValue | null>(null);

export type AuthoringActions = Pick<
    AuthoringValue,
    | 'addRubric'
    | 'updateRubric'
    | 'deleteRubric'
    | 'addGradeScale'
    | 'updateGradeScale'
    | 'deleteGradeScale'
    | 'addFavoriteStandard'
    | 'removeFavoriteStandard'
    | 'isFavoriteStandard'
    | 'addCommentBankItem'
    | 'updateCommentBankItem'
    | 'deleteCommentBankItem'
    | 'recordCommentBankUsage'
    | 'addQuestionBankItem'
    | 'addSectionBankItem'
    | 'addQuestionBankItems'
    | 'updateQuestionBankItem'
    | 'deleteQuestionBankItem'
    | 'deleteQuestionBankItems'
    | 'bulkUpdateQuestionBankItems'
    | 'addExportTemplate'
    | 'deleteExportTemplate'
    | 'syncRubricSnapshot'
    | 'fetchRubricVersions'
    | 'saveRubricVersion'
    | 'restoreRubricVersion'
    | 'addVocabularyItem'
    | 'updateVocabularyItem'
    | 'deleteVocabularyItem'
    | 'deleteVocabularyItems'
    | 'saveUserTemplate'
    | 'deleteUserTemplate'
>;

export function createAuthoringActions(ctx: StoreActionsCtx): AuthoringActions {
    const { getState, dispatch } = ctx;
    const addRubric = (r: Omit<Rubric, 'id' | 'createdAt' | 'updatedAt'>): Rubric => {
        const now = new Date().toISOString();
        const rubric: Rubric = { ...r, id: nanoid(), createdAt: now, updatedAt: now };
        dispatch({ type: 'ADD_RUBRIC', payload: rubric });
        return rubric;
    };
    const updateRubric = (r: Rubric) => {
        const existing = getState().rubrics.find((x) => x.id === r.id);
        if (existing) recordAutoVersion(existing);
        dispatch({ type: 'UPDATE_RUBRIC', payload: { ...r, updatedAt: new Date().toISOString() } });
        logAuditEvent('grade', 'rubric_edit', 'rubric', r.id);
    };
    const deleteRubric = (id: string) => dispatch({ type: 'DELETE_RUBRIC', id });
    const addGradeScale = (gs: Omit<GradeScale, 'id'>): GradeScale => {
        const scale: GradeScale = { ...gs, id: nanoid() };
        dispatch({ type: 'ADD_GRADE_SCALE', payload: scale });
        return scale;
    };
    const updateGradeScale = (gs: GradeScale) => dispatch({ type: 'UPDATE_GRADE_SCALE', payload: gs });
    const deleteGradeScale = (id: string) => dispatch({ type: 'DELETE_GRADE_SCALE', id });
    const addFavoriteStandard = (s: LinkedStandard) => dispatch({ type: 'ADD_FAVORITE_STANDARD', payload: s });
    const removeFavoriteStandard = (guid: string) => dispatch({ type: 'REMOVE_FAVORITE_STANDARD', guid });
    const isFavoriteStandard = (guid: string) => getState().favoriteStandards.some((s) => s.guid === guid);
    const addCommentBankItem = (text: string, tags: string[]): CommentBankItem => {
        const item: CommentBankItem = { id: nanoid(), text, tags, createdAt: new Date().toISOString() };
        dispatch({ type: 'ADD_COMMENT_BANK_ITEM', payload: item });
        return item;
    };
    const updateCommentBankItem = (item: CommentBankItem) =>
        dispatch({ type: 'UPDATE_COMMENT_BANK_ITEM', payload: item });
    const deleteCommentBankItem = (id: string) => dispatch({ type: 'DELETE_COMMENT_BANK_ITEM', id });
    const recordCommentBankUsage = (id: string) => dispatch({ type: 'RECORD_COMMENT_BANK_USAGE', id });
    const addQuestionBankItem = (
        question: Omit<TestQuestion, 'sectionId'>,
        tags: string[],
        cefrLevel?: CefrLevel
    ): QuestionBankItem => {
        const item: QuestionBankItem = {
            id: nanoid(),
            question,
            cefrLevel,
            tags,
            createdAt: new Date().toISOString(),
        };
        dispatch({ type: 'ADD_QUESTION_BANK_ITEM', payload: item });
        return item;
    };
    const addSectionBankItem = (
        section: Pick<NonNullable<QuestionBankItem['section']>, 'title' | 'content' | 'audioUrl'>,
        questions: Omit<TestQuestion, 'sectionId'>[],
        tags: string[],
        cefrLevel?: CefrLevel
    ): QuestionBankItem => {
        const item: QuestionBankItem = {
            id: nanoid(),
            kind: 'section',
            cefrLevel,
            section: { ...section, questions },
            tags,
            createdAt: new Date().toISOString(),
        };
        dispatch({ type: 'ADD_QUESTION_BANK_ITEM', payload: item });
        return item;
    };
    const addQuestionBankItems = (
        items: Array<Omit<QuestionBankItem, 'id' | 'createdAt' | 'updatedAt'>>
    ): QuestionBankItem[] => {
        const createdAt = new Date().toISOString();
        const created = items.map((i) => ({ ...i, id: nanoid(), createdAt }));
        dispatch({ type: 'ADD_QUESTION_BANK_ITEMS', payload: created });
        return created;
    };
    const updateQuestionBankItem = (item: QuestionBankItem) =>
        dispatch({ type: 'UPDATE_QUESTION_BANK_ITEM', payload: item });
    const deleteQuestionBankItem = (id: string) => dispatch({ type: 'DELETE_QUESTION_BANK_ITEM', id });
    const deleteQuestionBankItems = (ids: string[]) => dispatch({ type: 'DELETE_QUESTION_BANK_ITEMS', ids });
    const bulkUpdateQuestionBankItems = (
        ids: string[],
        patch: {
            addTags?: string[];
            removeTags?: string[];
            cefrLevel?: CefrLevel | null;
            cefrSkill?: QuestionBankSkill | null;
        }
    ) => dispatch({ type: 'BULK_UPDATE_QUESTION_BANK_ITEMS', ids, patch });
    const addExportTemplate = (t: Omit<ExportTemplate, 'id' | 'addedAt'>): ExportTemplate => {
        const template: ExportTemplate = { ...t, id: nanoid(), addedAt: new Date().toISOString() };
        dispatch({ type: 'ADD_EXPORT_TEMPLATE', payload: template });
        return template;
    };
    const deleteExportTemplate = (id: string) => dispatch({ type: 'DELETE_EXPORT_TEMPLATE', id });
    const syncRubricSnapshot = (rubricId: string, updatedRubric: Rubric) => {
        dispatch({ type: 'SYNC_RUBRIC_SNAPSHOT', rubricId, updatedRubric });
    };
    const fetchRubricVersions = async (rubricId: string): Promise<RubricVersion[]> => {
        if (!isOffline()) {
            try {
                const remote = await getDb()?.storageSync.fetchRubricVersions(rubricId);
                if (remote) return remote;
            } catch (e) {
                console.error('[sync] failed to fetch remote rubric versions', e);
            }
        }
        return loadRubricVersions(rubricId);
    };
    const saveRubricVersion = async (rubricId: string, label?: string) => {
        const rubric = getState().rubrics.find((r) => r.id === rubricId);
        if (!rubric) return;
        const version: RubricVersion = { id: nanoid(), savedAt: new Date().toISOString(), label, snapshot: rubric };
        const { evictedIds } = upsertRubricVersion(rubricId, version);
        const db = getDb();
        if (db?.storageSync.isConnected()) {
            await db.storageSync.pushOne('rubricVersion', 'upsert', { ...version, rubricId }, version.id);
            for (const evictedId of evictedIds) {
                db.storageSync
                    .pushOne('rubricVersion', 'delete', null, evictedId)
                    .catch((e) => console.error('[sync] failed to push rubricVersion eviction', e));
            }
        }
    };
    const restoreRubricVersion = (rubricId: string, snapshot: Rubric) => {
        const existing = getState().rubrics.find((r) => r.id === rubricId);
        if (existing) recordAutoVersion(existing);
        dispatch({ type: 'RESTORE_RUBRIC_VERSION', rubricId, snapshot });
    };
    const addVocabularyItem = (rubricId: string, item: Omit<VocabularyItem, 'id'>): VocabularyItem => {
        const v: VocabularyItem = { ...item, id: nanoid() };
        dispatch({ type: 'ADD_VOCABULARY_ITEM', rubricId, payload: v });
        return v;
    };
    const updateVocabularyItem = (rubricId: string, item: VocabularyItem) => {
        dispatch({ type: 'UPDATE_VOCABULARY_ITEM', rubricId, payload: item });
    };
    const deleteVocabularyItem = (rubricId: string, itemId: string) => {
        dispatch({ type: 'DELETE_VOCABULARY_ITEM', rubricId, itemId });
    };
    const deleteVocabularyItems = (rubricId: string, itemIds: string[]) => {
        dispatch({ type: 'DELETE_VOCABULARY_ITEMS_BATCH', rubricId, itemIds });
    };
    const saveUserTemplate = (t: UserTemplate) => {
        dispatch({ type: 'SAVE_USER_TEMPLATE', payload: t });
    };
    const deleteUserTemplate = (id: string) => {
        dispatch({ type: 'DELETE_USER_TEMPLATE', id });
    };
    return {
        addRubric,
        updateRubric,
        deleteRubric,
        addGradeScale,
        updateGradeScale,
        deleteGradeScale,
        addFavoriteStandard,
        removeFavoriteStandard,
        isFavoriteStandard,
        addCommentBankItem,
        updateCommentBankItem,
        deleteCommentBankItem,
        recordCommentBankUsage,
        addQuestionBankItem,
        addSectionBankItem,
        addQuestionBankItems,
        updateQuestionBankItem,
        deleteQuestionBankItem,
        deleteQuestionBankItems,
        bulkUpdateQuestionBankItems,
        addExportTemplate,
        deleteExportTemplate,
        syncRubricSnapshot,
        fetchRubricVersions,
        saveRubricVersion,
        restoreRubricVersion,
        addVocabularyItem,
        updateVocabularyItem,
        deleteVocabularyItem,
        deleteVocabularyItems,
        saveUserTemplate,
        deleteUserTemplate,
    };
}

export function useAuthoringValue(state: StoreData, actions: AuthoringActions): AuthoringValue {
    return useMemo(
        () => ({
            rubrics: state.rubrics,
            gradeScales: state.gradeScales,
            favoriteStandards: state.favoriteStandards,
            commentBank: state.commentBank,
            exportTemplates: state.exportTemplates,
            userTemplates: state.userTemplates,
            questionBank: state.questionBank,
            ...actions,
        }),
        [
            actions,
            state.rubrics,
            state.gradeScales,
            state.favoriteStandards,
            state.commentBank,
            state.exportTemplates,
            state.userTemplates,
            state.questionBank,
        ]
    );
}

export function AuthoringProvider({
    ctx,
    state,
    children,
}: {
    ctx: StoreActionsCtx;
    state: StoreData;
    children: ReactNode;
}) {
    const actions = useMemo(() => createAuthoringActions(ctx), [ctx]);
    const value = useAuthoringValue(state, actions);
    return <AuthoringContext.Provider value={value}>{children}</AuthoringContext.Provider>;
}

export function useAuthoring(): AuthoringValue {
    return useContextOrThrow(AuthoringContext, 'useAuthoring');
}
