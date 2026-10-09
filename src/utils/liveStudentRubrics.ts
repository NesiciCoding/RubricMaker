import type { Student, StudentRubric } from '../types';

/**
 * Grades that count towards analytics: not soft-deleted, and owned by a student in `liveStudents`
 * (callers pass their archive-filtered roster, so archived students' grades drop out everywhere).
 */
export function liveStudentRubrics(studentRubrics: StudentRubric[], liveStudents: Student[]): StudentRubric[] {
    const liveIds = new Set(liveStudents.map((s) => s.id));
    return studentRubrics.filter((sr) => !sr.deletedAt && liveIds.has(sr.studentId));
}

export interface RubricGradeScope {
    /** A class id, or `'all'`/undefined for every live student. */
    classId?: string;
    excludeNotHandedIn?: boolean;
}

/** Live grades for one rubric, optionally narrowed to a class and/or excluding not-handed-in work. */
export function rubricGradesInScope(
    studentRubrics: StudentRubric[],
    rubricId: string,
    liveStudents: Student[],
    { classId, excludeNotHandedIn = false }: RubricGradeScope = {}
): StudentRubric[] {
    const classOf = new Map(liveStudents.map((s) => [s.id, s.classId]));
    return studentRubrics.filter((sr) => {
        if (sr.rubricId !== rubricId || sr.deletedAt) return false;
        if (!classOf.has(sr.studentId)) return false;
        if (excludeNotHandedIn && sr.notHandedIn) return false;
        if (!classId || classId === 'all') return true;
        return classOf.get(sr.studentId) === classId;
    });
}
