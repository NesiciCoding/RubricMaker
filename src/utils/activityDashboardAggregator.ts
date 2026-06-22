import type {
    Rubric,
    Test,
    EssayAssignment,
    Student,
    StudentRubric,
    StudentTest,
    Class,
    ActivityKind,
    ActivityRow,
    CellData,
} from '../types';
import { sortByDisplayOrder } from './displayOrder';

export function getActivityRows(rubrics: Rubric[], tests: Test[], essayAssignments: EssayAssignment[]): ActivityRow[] {
    const rubricRows: ActivityRow[] = sortByDisplayOrder(rubrics).map((r) => ({
        kind: 'rubric',
        id: r.id,
        name: r.name,
    }));
    const testRows: ActivityRow[] = sortByDisplayOrder(tests).map((t) => ({ kind: 'test', id: t.id, name: t.name }));

    // Group essays by teacherKey; use first assignment's title/displayOrder/createdAt as the row's
    const essayGroups = new Map<string, EssayAssignment>();
    for (const a of essayAssignments) {
        if (!essayGroups.has(a.teacherKey)) {
            essayGroups.set(a.teacherKey, a);
        }
    }
    const essayRows: ActivityRow[] = sortByDisplayOrder(Array.from(essayGroups.values())).map((a) => ({
        kind: 'essay' as ActivityKind,
        id: a.teacherKey,
        name: a.title,
    }));

    return [...rubricRows, ...testRows, ...essayRows];
}

export function buildDashboardMatrix(
    activities: ActivityRow[],
    classes: Class[],
    students: Student[],
    studentRubrics: StudentRubric[],
    studentTests: StudentTest[],
    essayAssignments: EssayAssignment[]
): Record<string, Record<string, CellData>> {
    const matrix: Record<string, Record<string, CellData>> = {};

    for (const activity of activities) {
        const activityKey = `${activity.kind}:${activity.id}`;
        matrix[activityKey] = {};
        for (const cls of classes) {
            const classStudents = students.filter((s) => s.classId === cls.id);
            const totalStudents = classStudents.length;
            const studentIds = new Set(classStudents.map((s) => s.id));

            let cell: CellData;
            if (activity.kind === 'rubric') {
                cell = {
                    isLinked: (cls.rubricIds ?? []).includes(activity.id),
                    submittedCount: studentRubrics.filter(
                        (sr) => sr.rubricId === activity.id && studentIds.has(sr.studentId)
                    ).length,
                    totalStudents,
                };
            } else if (activity.kind === 'test') {
                cell = {
                    submittedCount: studentTests.filter(
                        (st) =>
                            st.testId === activity.id &&
                            studentIds.has(st.studentId) &&
                            (st.status === 'submitted' || st.status === 'graded')
                    ).length,
                    isLinked: studentTests.some((st) => st.testId === activity.id && studentIds.has(st.studentId)),
                    totalStudents,
                };
            } else {
                const classAssignments = essayAssignments.filter(
                    (a) => a.teacherKey === activity.id && studentIds.has(a.studentId)
                );
                cell = {
                    submittedCount: classAssignments.length,
                    isLinked: classAssignments.length > 0,
                    totalStudents,
                };
            }

            matrix[activityKey][cls.id] = cell;
        }
    }

    return matrix;
}
