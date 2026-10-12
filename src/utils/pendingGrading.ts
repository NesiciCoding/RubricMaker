import type { EssayAssignment, EssaySubmission, Student, StudentRubric, StudentTest, Test } from '../types';

export interface PendingGradingGroup {
    /** `test:<testId>` or `essay:<teacherKey>` */
    key: string;
    kind: 'test' | 'essay';
    title: string;
    studentIds: string[];
    oldestSubmittedAt: string;
    /** Changes whenever more work is handed in, so a dismissed group comes back for new submissions. */
    newestSubmittedAt: string;
    daysWaiting: number;
    path: string;
}

interface Input {
    students: Pick<Student, 'id' | 'archivedAt'>[];
    tests: Pick<Test, 'id' | 'name'>[];
    studentTests: Pick<StudentTest, 'id' | 'testId' | 'studentId' | 'status' | 'submittedAt'>[];
    essayAssignments: Pick<EssayAssignment, 'teacherKey' | 'title'>[];
    essaySubmissions: Pick<
        EssaySubmission,
        'teacherKey' | 'assignmentStudentId' | 'assignmentRubricId' | 'submittedAt'
    >[];
    studentRubrics: Pick<StudentRubric, 'studentId' | 'rubricId' | 'gradedAt' | 'isPeerReview' | 'deletedAt'>[];
    thresholdDays: number;
    now?: number;
}

const DAY_MS = 86_400_000;

/**
 * Work that has been handed in but not graded for at least `thresholdDays`, one group per test or
 * essay (#665). Students who were never assigned anything, or whose work is graded, don't appear;
 * archived students are left out.
 */
export function findPendingGrading({
    students,
    tests,
    studentTests,
    essayAssignments,
    essaySubmissions,
    studentRubrics,
    thresholdDays,
    now = Date.now(),
}: Input): PendingGradingGroup[] {
    const active = new Set(students.filter((s) => !s.archivedAt).map((s) => s.id));
    const waitedLongEnough = (submittedAt: string) => now - new Date(submittedAt).getTime() >= thresholdDays * DAY_MS;
    const groups = new Map<string, PendingGradingGroup>();

    function add(
        key: string,
        kind: 'test' | 'essay',
        title: string,
        studentId: string,
        submittedAt: string,
        path: () => string
    ) {
        const group = groups.get(key);
        if (!group) {
            groups.set(key, {
                key,
                kind,
                title,
                studentIds: [studentId],
                oldestSubmittedAt: submittedAt,
                newestSubmittedAt: submittedAt,
                daysWaiting: 0,
                path: path(),
            });
            return;
        }
        if (!group.studentIds.includes(studentId)) group.studentIds.push(studentId);
        if (submittedAt < group.oldestSubmittedAt) {
            group.oldestSubmittedAt = submittedAt;
            group.path = path();
        }
        if (submittedAt > group.newestSubmittedAt) group.newestSubmittedAt = submittedAt;
    }

    for (const st of studentTests) {
        if (st.status !== 'submitted' || !st.submittedAt || !active.has(st.studentId)) continue;
        if (!waitedLongEnough(st.submittedAt)) continue;
        const title = tests.find((test) => test.id === st.testId)?.name ?? st.testId;
        add(
            `test:${st.testId}`,
            'test',
            title,
            st.studentId,
            st.submittedAt,
            () => `/tests/${st.testId}/results/${st.id}`
        );
    }

    for (const sub of essaySubmissions) {
        const studentId = sub.assignmentStudentId;
        if (!active.has(studentId) || !waitedLongEnough(sub.submittedAt)) continue;
        const graded = studentRubrics.some(
            (sr) =>
                sr.studentId === studentId &&
                sr.rubricId === sub.assignmentRubricId &&
                !sr.isPeerReview &&
                !sr.deletedAt &&
                !!sr.gradedAt &&
                sr.gradedAt >= sub.submittedAt
        );
        if (graded) continue;
        const title = essayAssignments.find((a) => a.teacherKey === sub.teacherKey)?.title ?? sub.teacherKey;
        add(`essay:${sub.teacherKey}`, 'essay', title, studentId, sub.submittedAt, () => `/essays/${sub.teacherKey}`);
    }

    return [...groups.values()]
        .map((g) => ({ ...g, daysWaiting: Math.floor((now - new Date(g.oldestSubmittedAt).getTime()) / DAY_MS) }))
        .sort((a, b) => a.oldestSubmittedAt.localeCompare(b.oldestSubmittedAt));
}
