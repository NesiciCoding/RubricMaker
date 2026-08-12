// Generated from src/context/AppContext.tsx by the domain-split refactor.
import React, { createContext, useMemo, ReactNode } from 'react';
import { AppContextValue, StoreActionsCtx, useContextOrThrow } from '../storeCore';
import type { Attachment, Class, ScoreEntry, Student, StudentRubric } from '../../types';
import { StoreData } from '../../store/storage';
import { nanoid } from '../../utils/nanoid';
import { loadDb } from '../../services/database/lazyDb';
import { logAuditEvent } from '../../services/database/AuditLogger';

export type RosterValue = Pick<
    AppContextValue,
    | 'students'
    | 'classes'
    | 'studentRubrics'
    | 'attachments'
    | 'archivedStudents'
    | 'deletedStudentRubrics'
    | 'addStudent'
    | 'updateStudent'
    | 'deleteStudent'
    | 'restoreStudent'
    | 'anonymizeStudent'
    | 'addClass'
    | 'updateClass'
    | 'deleteClass'
    | 'mergeClasses'
    | 'saveStudentRubric'
    | 'saveRubricSelfAssessment'
    | 'createStudentRubric'
    | 'createGroupStudentRubrics'
    | 'deleteStudentRubric'
    | 'restoreStudentRubric'
    | 'addAttachment'
    | 'deleteAttachment'
    | 'setStudentPassword'
>;

const RosterContext = createContext<RosterValue | null>(null);

export type RosterActions = Pick<
    RosterValue,
    | 'addStudent'
    | 'updateStudent'
    | 'deleteStudent'
    | 'restoreStudent'
    | 'addClass'
    | 'updateClass'
    | 'deleteClass'
    | 'mergeClasses'
    | 'saveStudentRubric'
    | 'saveRubricSelfAssessment'
    | 'createStudentRubric'
    | 'createGroupStudentRubrics'
    | 'deleteStudentRubric'
    | 'restoreStudentRubric'
    | 'addAttachment'
    | 'deleteAttachment'
    | 'setStudentPassword'
    | 'anonymizeStudent'
>;

export function createRosterActions(ctx: StoreActionsCtx): RosterActions {
    const { getState, dispatch } = ctx;
    const addStudent = (s: Omit<Student, 'id'>): Student => {
        const student: Student = { ...s, id: nanoid() };
        dispatch({ type: 'ADD_STUDENT', payload: student });
        return student;
    };
    const updateStudent = (s: Student) => dispatch({ type: 'UPDATE_STUDENT', payload: s });
    const deleteStudent = (id: string) => {
        logAuditEvent('admin', 'student_delete', 'student', id);
        dispatch({ type: 'DELETE_STUDENT', id });
    };
    const restoreStudent = (id: string) => {
        logAuditEvent('admin', 'student_restore', 'student', id);
        dispatch({ type: 'RESTORE_STUDENT', id });
    };
    const addClass = (c: Omit<Class, 'id'>): Class => {
        const cls: Class = { ...c, id: nanoid() };
        dispatch({ type: 'ADD_CLASS', payload: cls });
        return cls;
    };
    const updateClass = (c: Class) => dispatch({ type: 'UPDATE_CLASS', payload: c });
    const deleteClass = (id: string, deleteStudents: boolean = false) => {
        if (deleteStudents) {
            getState()
                .students.filter((s) => s.classId === id)
                .forEach((s) => deleteStudent(s.id));
        }
        dispatch({ type: 'DELETE_CLASS', id });
    };
    const mergeClasses = (sourceClassId: string, targetClassId: string) => {
        const studentsToMove = getState().students.filter((s) => s.classId === sourceClassId);
        studentsToMove.forEach((s) => updateStudent({ ...s, classId: targetClassId }));
        const sourceClass = getState().classes.find((c) => c.id === sourceClassId);
        const targetClass = getState().classes.find((c) => c.id === targetClassId);
        if (sourceClass && targetClass) {
            const sourceRubricIds = sourceClass.rubricIds ?? [];
            const targetRubricIds = targetClass.rubricIds ?? [];
            if (sourceRubricIds.length > 0) {
                const merged = Array.from(new Set([...targetRubricIds, ...sourceRubricIds]));
                dispatch({ type: 'UPDATE_CLASS', payload: { ...targetClass, rubricIds: merged } });
            }
        }
        deleteClass(sourceClassId, false);
    };
    const saveStudentRubricFn = (sr: StudentRubric) => {
        logAuditEvent('grade', 'grade_save', 'student_rubric', sr.id, {
            rubricId: sr.rubricId,
            studentId: sr.studentId,
        });
        dispatch({ type: 'SAVE_STUDENT_RUBRIC', payload: sr });
    };
    const saveRubricSelfAssessment = (id: string, levels: Record<string, string | null>, reflection: string) => {
        dispatch({ type: 'SAVE_RUBRIC_SELF_ASSESSMENT', id, levels, reflection });
    };
    const createStudentRubric = (rubricId: string, studentId: string): StudentRubric => {
        const rubric = getState().rubrics.find((r) => r.id === rubricId);
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
    };
    const createGroupStudentRubrics = (rubricId: string, studentIds: string[]): StudentRubric[] => {
        const rubric = getState().rubrics.find((r) => r.id === rubricId);
        const entries: ScoreEntry[] = (rubric?.criteria ?? []).map((c) => ({
            criterionId: c.id,
            levelId: null,
            comment: '',
            checkedSubItems: [],
        }));
        const groupId = nanoid();
        const srs = studentIds.map((studentId): StudentRubric => {
            const existing = getState().studentRubrics.find(
                (sr) => sr.rubricId === rubricId && sr.studentId === studentId && !sr.isPeerReview
            );
            return {
                ...existing,
                id: existing?.id ?? nanoid(),
                rubricId,
                studentId,
                entries: entries.map((e) => ({ ...e })),
                overallComment: '',
                isPeerReview: false,
                groupId,
                gradedBy: undefined,
                gradedAt: undefined,
                submittedAt: undefined,
                notHandedIn: undefined,
                round: undefined,
                deletedAt: undefined,
            };
        });
        srs.forEach((sr) => dispatch({ type: 'SAVE_STUDENT_RUBRIC', payload: sr }));
        return srs;
    };
    const deleteStudentRubric = (id: string, scope: 'student' | 'group') => {
        logAuditEvent('grade', 'student_rubric_delete', 'student_rubric', id, { scope });
        dispatch({ type: 'DELETE_STUDENT_RUBRIC', id, scope });
    };
    const restoreStudentRubric = (id: string) => {
        logAuditEvent('grade', 'student_rubric_restore', 'student_rubric', id);
        dispatch({ type: 'RESTORE_STUDENT_RUBRIC', id });
    };
    const addAttachment = (a: Omit<Attachment, 'id' | 'addedAt'>): Attachment => {
        const att: Attachment = { ...a, id: nanoid(), addedAt: new Date().toISOString() };
        dispatch({ type: 'ADD_ATTACHMENT', payload: att });
        return att;
    };
    const deleteAttachment = (id: string) => dispatch({ type: 'DELETE_ATTACHMENT', id });
    const setStudentPassword = async (studentEmail: string, password: string) =>
        (await loadDb()).storageSync.setStudentPassword(studentEmail, password);
    const anonymizeStudent = (id: string) => {
        logAuditEvent('admin', 'student_anonymize', 'student', id);
        // The ANONYMIZE_STUDENT reducer mints the canonical record (name/email/anonymizedAt/
        // updatedAt); the AppContext delta-sync effect then pushes that exact record when
        // connected, so a manual loadDb/pushOne here would only risk drifting from it.
        dispatch({ type: 'ANONYMIZE_STUDENT', id });
    };
    return {
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
        restoreStudentRubric,
        addAttachment,
        deleteAttachment,
        setStudentPassword,
        anonymizeStudent,
    };
}

export function useRosterValue(state: StoreData, actions: RosterActions): RosterValue {
    const activeStudents = useMemo(() => state.students.filter((s) => !s.archivedAt), [state.students]);
    const archivedStudents = useMemo(() => state.students.filter((s) => !!s.archivedAt), [state.students]);
    const activeStudentRubrics = useMemo(
        () => state.studentRubrics.filter((sr) => !sr.deletedAt),
        [state.studentRubrics]
    );
    const deletedStudentRubrics = useMemo(
        () => state.studentRubrics.filter((sr) => !!sr.deletedAt),
        [state.studentRubrics]
    );

    return useMemo(
        () => ({
            students: activeStudents,
            classes: state.classes,
            studentRubrics: activeStudentRubrics,
            attachments: state.attachments,
            archivedStudents: archivedStudents,
            deletedStudentRubrics: deletedStudentRubrics,
            ...actions,
        }),
        [
            actions,
            activeStudents,
            archivedStudents,
            activeStudentRubrics,
            deletedStudentRubrics,
            state.classes,
            state.attachments,
        ]
    );
}

export function RosterProvider({
    ctx,
    state,
    children,
}: {
    ctx: StoreActionsCtx;
    state: StoreData;
    children: ReactNode;
}) {
    const actions = useMemo(() => createRosterActions(ctx), [ctx]);
    const value = useRosterValue(state, actions);
    return <RosterContext.Provider value={value}>{children}</RosterContext.Provider>;
}

export function useRoster(): RosterValue {
    return useContextOrThrow(RosterContext, 'useRoster');
}
