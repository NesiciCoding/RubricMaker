// Generated from src/context/AppContext.tsx by the domain-split refactor.
import React, { createContext, useMemo, ReactNode } from 'react';
import {
    AppContextValue,
    StoreActionsCtx,
    StudentEraseResult,
    flushToLocalStorage,
    isOffline,
    useContextOrThrow,
} from '../storeCore';
import type { Attachment, Class, ComparativeMatchup, ScoreEntry, Student, StudentRubric } from '../../types';
import { StoreData } from '../../store/storage';
import { nanoid } from '../../utils/nanoid';
import { loadDb } from '../../services/database/lazyDb';
import { loadSupabaseConfig } from '../../services/database/supabaseConfig';
import { isLocalMode, loadPendingQueue, removePendingWrites } from '../../store/storage';
import { eraseStudentFromStore, pendingWritesForStudent } from '../../utils/eraseStudent';
import { staleCohortOverridePatch } from '../../utils/cohortOverrides';
import { logAuditEvent } from '../../services/database/AuditLogger';

export type RosterValue = Pick<
    AppContextValue,
    | 'students'
    | 'classes'
    | 'studentRubrics'
    | 'attachments'
    | 'archivedStudents'
    | 'deletedStudentRubrics'
    | 'comparativeMatchups'
    | 'addStudent'
    | 'updateStudent'
    | 'deleteStudent'
    | 'restoreStudent'
    | 'anonymizeStudent'
    | 'eraseStudent'
    | 'addClass'
    | 'updateClass'
    | 'deleteClass'
    | 'mergeClasses'
    | 'saveStudentRubric'
    | 'saveRubricSelfAssessment'
    | 'createStudentRubric'
    | 'createGroupStudentRubrics'
    | 'updateStudentGroup'
    | 'deleteStudentRubric'
    | 'restoreStudentRubric'
    | 'addAttachment'
    | 'deleteAttachment'
    | 'setStudentPassword'
    | 'addComparativeMatchup'
>;

const RosterContext = createContext<RosterValue | null>(null);

// The roster domain is itself split further so a grading dispatch (studentRubrics) only
// re-renders grading consumers — not consumers that merely read students or classes.
// Each sub-value memoizes on its own slices, so a `saveStudentRubric` re-renders only
// `useGrading` subscribers; `useRoster()` stays available as the merged compatibility view.
export type StudentsValue = Pick<
    RosterValue,
    | 'students'
    | 'archivedStudents'
    | 'addStudent'
    | 'updateStudent'
    | 'deleteStudent'
    | 'restoreStudent'
    | 'anonymizeStudent'
    | 'eraseStudent'
    | 'setStudentPassword'
>;

export type ClassesValue = Pick<RosterValue, 'classes' | 'addClass' | 'updateClass' | 'deleteClass' | 'mergeClasses'>;

export type GradingValue = Pick<
    RosterValue,
    | 'studentRubrics'
    | 'deletedStudentRubrics'
    | 'attachments'
    | 'comparativeMatchups'
    | 'saveStudentRubric'
    | 'saveRubricSelfAssessment'
    | 'createStudentRubric'
    | 'createGroupStudentRubrics'
    | 'updateStudentGroup'
    | 'deleteStudentRubric'
    | 'restoreStudentRubric'
    | 'addAttachment'
    | 'deleteAttachment'
    | 'addComparativeMatchup'
>;

const StudentsContext = createContext<StudentsValue | null>(null);
const ClassesContext = createContext<ClassesValue | null>(null);
const GradingContext = createContext<GradingValue | null>(null);

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
    | 'updateStudentGroup'
    | 'deleteStudentRubric'
    | 'restoreStudentRubric'
    | 'addAttachment'
    | 'deleteAttachment'
    | 'setStudentPassword'
    | 'anonymizeStudent'
    | 'eraseStudent'
    | 'addComparativeMatchup'
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
        const targetClass = getState().classes.find((c) => c.id === targetClassId);
        const studentsToMove = getState().students.filter((s) => s.classId === sourceClassId);
        // Arriving from a wider class, a student can carry a year or track the target doesn't teach;
        // clear those overrides so nobody stays tagged outside their class's own cohorts.
        studentsToMove.forEach((s) => {
            const patch = staleCohortOverridePatch(s, targetClass);
            updateStudent({ ...s, classId: targetClassId, ...(patch ?? {}) });
        });
        const sourceClass = getState().classes.find((c) => c.id === sourceClassId);
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
    // Shared body of "create a group" and "edit a group": every selected student ends up in
    // `groupId` with the same name, an existing grade keeps its own scores, and members of the
    // groups involved who were left out are ungrouped.
    const applyStudentGroup = (
        rubricId: string,
        studentIds: string[],
        groupId: string,
        groupName: string | undefined,
        staleGroupIds: string[] = []
    ): StudentRubric[] => {
        const rubric = getState().rubrics.find((r) => r.id === rubricId);
        const blankEntries = (): ScoreEntry[] =>
            (rubric?.criteria ?? []).map((c) => ({
                criterionId: c.id,
                levelId: null,
                comment: '',
                checkedSubItems: [],
            }));
        const existingByStudent = new Map<string, StudentRubric>();
        for (const sr of getState().studentRubrics) {
            if (sr.rubricId === rubricId && !sr.isPeerReview) existingByStudent.set(sr.studentId, sr);
        }
        const previousGroupIds = new Set(staleGroupIds);
        // No explicit name means "keep whatever this group was called before".
        const previousName = studentIds
            .map((studentId) => existingByStudent.get(studentId))
            .find((sr) => sr?.groupId && sr.groupName)?.groupName;
        const nextName = groupName === undefined ? previousName : groupName.trim() || undefined;
        const srs = studentIds.map((studentId): StudentRubric => {
            const existing = existingByStudent.get(studentId);
            if (existing?.groupId) previousGroupIds.add(existing.groupId);
            // Grouping only adds a group id and name: an existing grade keeps its scores, comment
            // and gradedAt. Rebuilding the entry list here used to blank a student's grade just
            // for being added to a group.
            return existing
                ? {
                      ...existing,
                      rubricId,
                      studentId,
                      isPeerReview: false,
                      groupId,
                      groupName: nextName,
                      deletedAt: undefined,
                  }
                : {
                      id: nanoid(),
                      rubricId,
                      studentId,
                      entries: blankEntries(),
                      overallComment: '',
                      isPeerReview: false,
                      groupId,
                      groupName: nextName,
                  };
        });
        // Members dropped from a group they used to share must stop fanning grades into it; their
        // stale groupId would otherwise keep propagating scores from a group they are no longer in.
        const selected = new Set(studentIds);
        const droppedMembers = getState().studentRubrics.filter(
            (sr) =>
                !!sr.groupId &&
                previousGroupIds.has(sr.groupId) &&
                sr.rubricId === rubricId &&
                !sr.isPeerReview &&
                !selected.has(sr.studentId)
        );
        dispatch({
            type: 'GROUP_STUDENT_RUBRICS',
            payload: [...srs, ...droppedMembers.map((sr) => ({ ...sr, groupId: undefined, groupName: undefined }))],
        });
        return srs;
    };
    const createGroupStudentRubrics = (rubricId: string, studentIds: string[], groupName?: string): StudentRubric[] =>
        applyStudentGroup(rubricId, studentIds, nanoid(), groupName);
    // Editing keeps the group's id (and its name unless renamed), so the teacher's grouping survives
    // a membership change instead of looking like a brand-new group.
    const updateStudentGroup = (groupId: string, studentIds: string[], groupName?: string): StudentRubric[] => {
        const member = getState().studentRubrics.find((sr) => sr.groupId === groupId && !sr.isPeerReview);
        /* v8 ignore next -- the edit form only opens from a live group row */
        if (!member) return [];
        return applyStudentGroup(member.rubricId, studentIds, groupId, groupName, [groupId]);
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
    const addComparativeMatchup = (rubricId: string, studentAId: string, studentBId: string) => {
        const matchup: ComparativeMatchup = {
            id: nanoid(),
            rubricId,
            studentAId,
            studentBId,
            gradedAt: new Date().toISOString(),
        };
        dispatch({ type: 'ADD_COMPARATIVE_MATCHUP', payload: matchup });
    };
    const setStudentPassword = async (studentEmail: string, password: string) =>
        (await loadDb()).storageSync.setStudentPassword(studentEmail, password);
    const anonymizeStudent = (id: string) => {
        logAuditEvent('admin', 'student_anonymize', 'student', id);
        // The ANONYMIZE_STUDENT reducer mints the canonical record (name/email/anonymizedAt/
        // updatedAt); the AppContext delta-sync effect then pushes that exact record when
        // connected, so a manual loadDb/pushOne here would only risk drifting from it.
        dispatch({ type: 'ANONYMIZE_STUDENT', id });
    };
    // Right to erasure (#644). With a database the server erases first (rows and files); only
    // then is local state purged, so a failed erase can be retried and nothing reappears on the
    // next hydrate. The offline caches are rewritten too — they still hold the student otherwise.
    const eraseStudent = async (id: string): Promise<StudentEraseResult> => {
        let leftoverFiles = 0;
        let erasedRemotely = false;
        if (!isLocalMode() && loadSupabaseConfig()) {
            const { storageSync } = await loadDb();
            if (!storageSync.isConnected()) return { success: false, error: 'offline', leftoverFiles };
            const result = await storageSync.adapter.eraseStudentData(id);
            if (!result.success) return { success: false, error: result.error, leftoverFiles };
            leftoverFiles = result.leftoverFiles.length;
            erasedRemotely = true;
        }
        const { next, changed, recordingIds, attachmentIds } = eraseStudentFromStore(getState(), id);
        if (erasedRemotely) removePendingWrites(pendingWritesForStudent(loadPendingQueue(), id, attachmentIds));
        dispatch({ type: 'ERASE_STUDENT', id });
        if (!isOffline()) await flushToLocalStorage(next, changed);
        if (recordingIds.length > 0) {
            const { deleteBlob } = await import('../../services/mediaStore');
            await Promise.all(recordingIds.map((rid) => deleteBlob(rid).catch(() => undefined)));
        }
        return { success: true, leftoverFiles };
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
        updateStudentGroup,
        deleteStudentRubric,
        restoreStudentRubric,
        addAttachment,
        deleteAttachment,
        setStudentPassword,
        anonymizeStudent,
        eraseStudent,
        addComparativeMatchup,
    };
}

export function useRosterValue(
    state: StoreData,
    actions: RosterActions
): {
    studentsValue: StudentsValue;
    classesValue: ClassesValue;
    gradingValue: GradingValue;
    value: RosterValue;
} {
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

    // Actions are identity-stable (memoized on ctx in RosterProvider), so each sub-value
    // only changes when its own slices change.
    const studentsValue = useMemo(
        () => ({
            students: activeStudents,
            archivedStudents: archivedStudents,
            addStudent: actions.addStudent,
            updateStudent: actions.updateStudent,
            deleteStudent: actions.deleteStudent,
            restoreStudent: actions.restoreStudent,
            anonymizeStudent: actions.anonymizeStudent,
            eraseStudent: actions.eraseStudent,
            setStudentPassword: actions.setStudentPassword,
        }),
        [activeStudents, archivedStudents, actions]
    );
    const classesValue = useMemo(
        () => ({
            classes: state.classes,
            addClass: actions.addClass,
            updateClass: actions.updateClass,
            deleteClass: actions.deleteClass,
            mergeClasses: actions.mergeClasses,
        }),
        [state.classes, actions]
    );
    const gradingValue = useMemo(
        () => ({
            studentRubrics: activeStudentRubrics,
            deletedStudentRubrics: deletedStudentRubrics,
            attachments: state.attachments,
            comparativeMatchups: state.comparativeMatchups,
            saveStudentRubric: actions.saveStudentRubric,
            saveRubricSelfAssessment: actions.saveRubricSelfAssessment,
            createStudentRubric: actions.createStudentRubric,
            createGroupStudentRubrics: actions.createGroupStudentRubrics,
            updateStudentGroup: actions.updateStudentGroup,
            deleteStudentRubric: actions.deleteStudentRubric,
            restoreStudentRubric: actions.restoreStudentRubric,
            addAttachment: actions.addAttachment,
            deleteAttachment: actions.deleteAttachment,
            addComparativeMatchup: actions.addComparativeMatchup,
        }),
        [activeStudentRubrics, deletedStudentRubrics, state.attachments, state.comparativeMatchups, actions]
    );

    // Merged compatibility view: re-creates whenever any roster slice changes, which is
    // exactly the granularity of the pre-split single RosterValue.
    const value = useMemo(
        () => ({ ...studentsValue, ...classesValue, ...gradingValue }),
        [studentsValue, classesValue, gradingValue]
    );

    return { studentsValue, classesValue, gradingValue, value };
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
    const { studentsValue, classesValue, gradingValue, value } = useRosterValue(state, actions);
    return (
        <StudentsContext.Provider value={studentsValue}>
            <ClassesContext.Provider value={classesValue}>
                <GradingContext.Provider value={gradingValue}>
                    <RosterContext.Provider value={value}>{children}</RosterContext.Provider>
                </GradingContext.Provider>
            </ClassesContext.Provider>
        </StudentsContext.Provider>
    );
}

export function useStudents(): StudentsValue {
    return useContextOrThrow(StudentsContext, 'useStudents');
}

export function useClasses(): ClassesValue {
    return useContextOrThrow(ClassesContext, 'useClasses');
}

export function useGrading(): GradingValue {
    return useContextOrThrow(GradingContext, 'useGrading');
}

export function useRoster(): RosterValue {
    return useContextOrThrow(RosterContext, 'useRoster');
}
