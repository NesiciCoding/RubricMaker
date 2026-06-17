import type { Rubric, Test, EssayAssignment, Student, StudentRubric, StudentTest, Class } from '../types';

export type ActivityKind = 'rubric' | 'test' | 'essay';

export interface ActivityRow {
    kind: ActivityKind;
    id: string; // rubricId, testId, or teacherKey
    name: string;
}

export interface CellData {
    submittedCount: number;
    totalStudents: number;
    isLinked: boolean; // rubric in Class.rubricIds; essay has ≥1 assignment in this class
}

export function getActivityRows(
    rubrics: Rubric[],
    tests: Test[],
    essayAssignments: EssayAssignment[]
): ActivityRow[] {
    const rubricRows: ActivityRow[] = rubrics.map((r) => ({ kind: 'rubric', id: r.id, name: r.name }));
    const testRows: ActivityRow[] = tests.map((t) => ({ kind: 'test', id: t.id, name: t.name }));

    // Group essays by teacherKey; use first assignment's title as the row name
    const essayGroups = new Map<string, string>();
    for (const a of essayAssignments) {
        if (!essayGroups.has(a.teacherKey)) {
            essayGroups.set(a.teacherKey, a.title);
        }
    }
    const essayRows: ActivityRow[] = Array.from(essayGroups.entries()).map(([key, title]) => ({
        kind: 'essay' as ActivityKind,
        id: key,
        name: title,
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
        matrix[activity.id] = {};
        for (const cls of classes) {
            const classStudents = students.filter((s) => s.classId === cls.id);
            const totalStudents = classStudents.length;
            const studentIds = new Set(classStudents.map((s) => s.id));

            let submittedCount = 0;
            let isLinked = false;

            if (activity.kind === 'rubric') {
                isLinked = (cls.rubricIds ?? []).includes(activity.id);
                submittedCount = studentRubrics.filter(
                    (sr) => sr.rubricId === activity.id && studentIds.has(sr.studentId)
                ).length;
            } else if (activity.kind === 'test') {
                submittedCount = studentTests.filter(
                    (st) =>
                        st.testId === activity.id &&
                        studentIds.has(st.studentId) &&
                        (st.status === 'submitted' || st.status === 'graded')
                ).length;
                isLinked = studentTests.some(
                    (st) => st.testId === activity.id && studentIds.has(st.studentId)
                );
            } else {
                const classAssignments = essayAssignments.filter(
                    (a) => a.teacherKey === activity.id && studentIds.has(a.studentId)
                );
                submittedCount = classAssignments.length;
                isLinked = classAssignments.length > 0;
            }

            matrix[activity.id][cls.id] = { submittedCount, totalStudents, isLinked };
        }
    }

    return matrix;
}
