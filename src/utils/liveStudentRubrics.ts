import type { Rubric, Student, StudentRubric } from '../types';

/**
 * Grades that count towards analytics: not soft-deleted, owned by a student in `liveStudents`
 * (callers pass their archive-filtered roster), and — when `liveRubrics` is given — for a rubric
 * that still exists. Only one grade per student and rubric counts: the first one, which is the
 * record GradeStudent opens, so legacy duplicates can't inflate counts or averages.
 */
export function liveStudentRubrics(
    studentRubrics: StudentRubric[],
    liveStudents: Student[],
    liveRubrics?: Rubric[]
): StudentRubric[] {
    const liveIds = new Set(liveStudents.map((s) => s.id));
    const rubricIds = liveRubrics ? new Set(liveRubrics.map((r) => r.id)) : null;
    const seen = new Set<string>();
    return studentRubrics.filter((sr) => {
        if (sr.deletedAt || !liveIds.has(sr.studentId)) return false;
        if (rubricIds && !rubricIds.has(sr.rubricId)) return false;
        const key = `${sr.rubricId}\u0000${sr.studentId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
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
    return liveStudentRubrics(
        studentRubrics.filter((sr) => sr.rubricId === rubricId),
        liveStudents
    ).filter((sr) => {
        if (excludeNotHandedIn && sr.notHandedIn) return false;
        if (!classId || classId === 'all') return true;
        return classOf.get(sr.studentId) === classId;
    });
}
