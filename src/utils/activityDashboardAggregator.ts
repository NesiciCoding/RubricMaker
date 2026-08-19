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
    // Precompute once, outside the activity×class loops, instead of re-scanning the full source
    // arrays per cell: each student's class, per-class totals, and each source record bucketed by
    // the activity id it belongs to. A cell is then a lookup + a tally over one small bucket.
    const studentClass = new Map<string, string>();
    const totalStudentsByClass = new Map<string, number>();
    for (const cls of classes) totalStudentsByClass.set(cls.id, 0);
    for (const s of students) {
        studentClass.set(s.id, s.classId);
        const n = totalStudentsByClass.get(s.classId);
        if (n !== undefined) totalStudentsByClass.set(s.classId, n + 1);
    }
    /* v8 ignore next -- totalFor is only ever called with cls.id from `classes`, which seeds the map */
    const totalFor = (classId: string) => totalStudentsByClass.get(classId) ?? 0;

    const bucket = <T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> => {
        const map = new Map<string, T[]>();
        for (const row of rows) {
            const key = keyOf(row);
            const list = map.get(key);
            if (list) list.push(row);
            else map.set(key, [row]);
        }
        return map;
    };
    const srByRubric = bucket(studentRubrics, (sr) => sr.rubricId);
    const stByTest = bucket(studentTests, (st) => st.testId);
    const eaByKey = bucket(essayAssignments, (a) => a.teacherKey);

    // Count member studentIds per class (skipping students whose class isn't in `classes`).
    const tallyByClass = (studentIds: string[]): Map<string, number> => {
        const counts = new Map<string, number>();
        for (const sid of studentIds) {
            const cls = studentClass.get(sid);
            if (cls === undefined) continue;
            counts.set(cls, (counts.get(cls) ?? 0) + 1);
        }
        return counts;
    };

    const matrix: Record<string, Record<string, CellData>> = {};
    for (const activity of activities) {
        const row: Record<string, CellData> = {};

        if (activity.kind === 'rubric') {
            const submitted = tallyByClass((srByRubric.get(activity.id) ?? []).map((sr) => sr.studentId));
            for (const cls of classes) {
                row[cls.id] = {
                    isLinked: (cls.rubricIds ?? []).includes(activity.id),
                    submittedCount: submitted.get(cls.id) ?? 0,
                    totalStudents: totalFor(cls.id),
                };
            }
        } else if (activity.kind === 'test') {
            const submitted = new Map<string, number>();
            const anyByClass = new Set<string>();
            for (const st of stByTest.get(activity.id) ?? []) {
                const cls = studentClass.get(st.studentId);
                if (cls === undefined) continue;
                anyByClass.add(cls);
                if (st.status === 'submitted' || st.status === 'graded')
                    submitted.set(cls, (submitted.get(cls) ?? 0) + 1);
            }
            for (const cls of classes) {
                row[cls.id] = {
                    submittedCount: submitted.get(cls.id) ?? 0,
                    isLinked: anyByClass.has(cls.id),
                    totalStudents: totalFor(cls.id),
                };
            }
        } else {
            const counts = tallyByClass((eaByKey.get(activity.id) ?? []).map((a) => a.studentId));
            for (const cls of classes) {
                const c = counts.get(cls.id) ?? 0;
                row[cls.id] = { submittedCount: c, isLinked: c > 0, totalStudents: totalFor(cls.id) };
            }
        }

        matrix[`${activity.kind}:${activity.id}`] = row;
    }

    return matrix;
}
