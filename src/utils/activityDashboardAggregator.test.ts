import { describe, it, expect } from 'vitest';
import { getActivityRows, buildDashboardMatrix } from './activityDashboardAggregator';
import type { Rubric, Test, EssayAssignment, Student, StudentRubric, StudentTest, Class } from '../types';

// ─── Builders ─────────────────────────────────────────────────────────────────

function mkRubric(id: string, name = `Rubric ${id}`): Rubric {
    return { id, name, subject: '', description: '', gradeScaleId: 'none', format: {} as never, attachmentIds: [], createdAt: '2024-01-01', updatedAt: '2024-01-01', totalMaxPoints: 0, scoringMode: 'weighted-percentage', criteria: [] };
}

function mkTest(id: string, name = `Test ${id}`): Test {
    return { id, name, questions: [], requireSEB: false, shuffleQuestions: false, createdAt: '2024-01-01', updatedAt: '2024-01-01' };
}

function mkEssay(teacherKey: string, studentId: string, title = 'Essay', rubricId = 'r1'): EssayAssignment {
    return { teacherKey, studentId, rubricId, title, readOnlyAfterSubmit: false, createdAt: '2024-01-01' };
}

function mkStudent(id: string, classId: string): Student {
    return { id, name: `Student ${id}`, classId };
}

function mkClass(id: string, rubricIds?: string[]): Class {
    return { id, name: `Class ${id}`, rubricIds };
}

function mkSR(id: string, rubricId: string, studentId: string): StudentRubric {
    return { id, rubricId, studentId, entries: [], overallComment: '', isPeerReview: false };
}

function mkST(id: string, testId: string, studentId: string, status: StudentTest['status'] = 'submitted'): StudentTest {
    return { id, testId, studentId, answers: [], status, startedAt: '2024-01-01' };
}

// ─── getActivityRows ──────────────────────────────────────────────────────────

describe('getActivityRows', () => {
    it('returns rubric rows with correct kind and id', () => {
        const rows = getActivityRows([mkRubric('r1'), mkRubric('r2')], [], []);
        expect(rows.filter((r) => r.kind === 'rubric')).toHaveLength(2);
        expect(rows[0]).toMatchObject({ kind: 'rubric', id: 'r1', name: 'Rubric r1' });
    });

    it('returns test rows with correct kind and id', () => {
        const rows = getActivityRows([], [mkTest('t1')], []);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ kind: 'test', id: 't1', name: 'Test t1' });
    });

    it('deduplicates essays by teacherKey', () => {
        const essays = [mkEssay('key1', 's1'), mkEssay('key1', 's2'), mkEssay('key2', 's3')];
        const essayRows = getActivityRows([], [], essays).filter((r) => r.kind === 'essay');
        expect(essayRows).toHaveLength(2);
        expect(essayRows.map((r) => r.id).sort()).toEqual(['key1', 'key2']);
    });

    it('uses the first assignment title as the essay row name', () => {
        const essays = [mkEssay('key1', 's1', 'Chapter 1 Essay'), mkEssay('key1', 's2', 'Different Title')];
        const row = getActivityRows([], [], essays).find((r) => r.id === 'key1');
        expect(row?.name).toBe('Chapter 1 Essay');
    });

    it('returns empty when all inputs are empty', () => {
        expect(getActivityRows([], [], [])).toHaveLength(0);
    });

    it('returns rows ordered: rubrics → tests → essays', () => {
        const rows = getActivityRows([mkRubric('r1')], [mkTest('t1')], [mkEssay('ek', 's1')]);
        expect(rows.map((r) => r.kind)).toEqual(['rubric', 'test', 'essay']);
    });

    it('preserves rubric order as-supplied', () => {
        const rows = getActivityRows([mkRubric('rb3'), mkRubric('rb1'), mkRubric('rb2')], [], []);
        expect(rows.map((r) => r.id)).toEqual(['rb3', 'rb1', 'rb2']);
    });

    it('preserves test order as-supplied', () => {
        const rows = getActivityRows([], [mkTest('t3'), mkTest('t1')], []);
        expect(rows.map((r) => r.id)).toEqual(['t3', 't1']);
    });
});

// ─── buildDashboardMatrix ─────────────────────────────────────────────────────

describe('buildDashboardMatrix', () => {
    const students = [mkStudent('s1', 'cls1'), mkStudent('s2', 'cls1'), mkStudent('s3', 'cls2')];
    const classes = [mkClass('cls1', ['r1']), mkClass('cls2')];

    describe('rubric cells', () => {
        it('isLinked true when rubric is in Class.rubricIds', () => {
            const activities = [{ kind: 'rubric' as const, id: 'r1', name: 'R1' }];
            const matrix = buildDashboardMatrix(activities, classes, students, [], [], []);
            expect(matrix['r1']['cls1'].isLinked).toBe(true);
        });

        it('isLinked false when rubric not in Class.rubricIds', () => {
            const activities = [{ kind: 'rubric' as const, id: 'r1', name: 'R1' }];
            const matrix = buildDashboardMatrix(activities, classes, students, [], [], []);
            expect(matrix['r1']['cls2'].isLinked).toBe(false);
        });

        it('isLinked false when class has no rubricIds field', () => {
            const activities = [{ kind: 'rubric' as const, id: 'r99', name: 'R99' }];
            const matrix = buildDashboardMatrix(activities, [mkClass('cls_empty')], students, [], [], []);
            expect(matrix['r99']['cls_empty'].isLinked).toBe(false);
        });

        it('submittedCount counts graded students in the class', () => {
            const activities = [{ kind: 'rubric' as const, id: 'r1', name: 'R1' }];
            const srs = [mkSR('a', 'r1', 's1'), mkSR('b', 'r1', 's2')];
            const matrix = buildDashboardMatrix(activities, classes, students, srs, [], []);
            expect(matrix['r1']['cls1'].submittedCount).toBe(2);
        });

        it('submittedCount does not count students from other classes', () => {
            const activities = [{ kind: 'rubric' as const, id: 'r1', name: 'R1' }];
            const srs = [mkSR('a', 'r1', 's3')]; // s3 is in cls2
            const matrix = buildDashboardMatrix(activities, classes, students, srs, [], []);
            expect(matrix['r1']['cls1'].submittedCount).toBe(0);
            expect(matrix['r1']['cls2'].submittedCount).toBe(1);
        });

        it('submittedCount does not count grades for other rubrics', () => {
            const activities = [{ kind: 'rubric' as const, id: 'r1', name: 'R1' }];
            const srs = [mkSR('a', 'r_other', 's1')];
            const matrix = buildDashboardMatrix(activities, classes, students, srs, [], []);
            expect(matrix['r1']['cls1'].submittedCount).toBe(0);
        });

        it('submittedCount is 0 when no studentRubrics', () => {
            const activities = [{ kind: 'rubric' as const, id: 'r1', name: 'R1' }];
            const matrix = buildDashboardMatrix(activities, classes, students, [], [], []);
            expect(matrix['r1']['cls1'].submittedCount).toBe(0);
        });
    });

    describe('test cells', () => {
        it('submittedCount counts only submitted and graded, not in_progress', () => {
            const activities = [{ kind: 'test' as const, id: 't1', name: 'T1' }];
            const sts = [
                mkST('a', 't1', 's1', 'submitted'),
                mkST('b', 't1', 's2', 'in_progress'),
            ];
            const matrix = buildDashboardMatrix(activities, classes, students, [], sts, []);
            expect(matrix['t1']['cls1'].submittedCount).toBe(1);
        });

        it('submittedCount counts graded status', () => {
            const activities = [{ kind: 'test' as const, id: 't1', name: 'T1' }];
            const sts = [mkST('a', 't1', 's1', 'graded')];
            const matrix = buildDashboardMatrix(activities, classes, students, [], sts, []);
            expect(matrix['t1']['cls1'].submittedCount).toBe(1);
        });

        it('isLinked true when any student in class has a StudentTest (even in_progress)', () => {
            const activities = [{ kind: 'test' as const, id: 't1', name: 'T1' }];
            const sts = [mkST('a', 't1', 's1', 'in_progress')];
            const matrix = buildDashboardMatrix(activities, classes, students, [], sts, []);
            expect(matrix['t1']['cls1'].isLinked).toBe(true);
            expect(matrix['t1']['cls2'].isLinked).toBe(false);
        });

        it('isLinked false when no students in class have started the test', () => {
            const activities = [{ kind: 'test' as const, id: 't1', name: 'T1' }];
            const matrix = buildDashboardMatrix(activities, classes, students, [], [], []);
            expect(matrix['t1']['cls1'].isLinked).toBe(false);
        });

        it('does not count tests for other testIds', () => {
            const activities = [{ kind: 'test' as const, id: 't1', name: 'T1' }];
            const sts = [mkST('a', 't_other', 's1', 'submitted')];
            const matrix = buildDashboardMatrix(activities, classes, students, [], sts, []);
            expect(matrix['t1']['cls1'].submittedCount).toBe(0);
        });
    });

    describe('essay cells', () => {
        it('submittedCount equals the number of assigned students in class', () => {
            const activities = [{ kind: 'essay' as const, id: 'ek1', name: 'Essay' }];
            const essays = [mkEssay('ek1', 's1'), mkEssay('ek1', 's2')];
            const matrix = buildDashboardMatrix(activities, classes, students, [], [], essays);
            expect(matrix['ek1']['cls1'].submittedCount).toBe(2);
            expect(matrix['ek1']['cls2'].submittedCount).toBe(0);
        });

        it('isLinked true when at least one student in class is assigned', () => {
            const activities = [{ kind: 'essay' as const, id: 'ek1', name: 'Essay' }];
            const essays = [mkEssay('ek1', 's1')];
            const matrix = buildDashboardMatrix(activities, classes, students, [], [], essays);
            expect(matrix['ek1']['cls1'].isLinked).toBe(true);
        });

        it('isLinked false when no students in class are assigned', () => {
            const activities = [{ kind: 'essay' as const, id: 'ek1', name: 'Essay' }];
            const essays = [mkEssay('ek1', 's1')]; // s1 in cls1 only
            const matrix = buildDashboardMatrix(activities, classes, students, [], [], essays);
            expect(matrix['ek1']['cls2'].isLinked).toBe(false);
        });

        it('does not count assignments for other teacherKeys', () => {
            const activities = [{ kind: 'essay' as const, id: 'ek1', name: 'Essay' }];
            const essays = [mkEssay('ek_other', 's1')];
            const matrix = buildDashboardMatrix(activities, classes, students, [], [], essays);
            expect(matrix['ek1']['cls1'].submittedCount).toBe(0);
        });

        it('only counts assignments for students in the class, not other classes', () => {
            const activities = [{ kind: 'essay' as const, id: 'ek1', name: 'Essay' }];
            const essays = [mkEssay('ek1', 's3')]; // s3 in cls2
            const matrix = buildDashboardMatrix(activities, classes, students, [], [], essays);
            expect(matrix['ek1']['cls1'].submittedCount).toBe(0);
            expect(matrix['ek1']['cls2'].submittedCount).toBe(1);
        });
    });

    describe('totalStudents', () => {
        it('reflects the number of students in the class', () => {
            const activities = [{ kind: 'rubric' as const, id: 'r1', name: 'R1' }];
            const matrix = buildDashboardMatrix(activities, classes, students, [], [], []);
            expect(matrix['r1']['cls1'].totalStudents).toBe(2); // s1, s2
            expect(matrix['r1']['cls2'].totalStudents).toBe(1); // s3
        });

        it('is 0 for a class with no students', () => {
            const activities = [{ kind: 'rubric' as const, id: 'r1', name: 'R1' }];
            const matrix = buildDashboardMatrix(activities, [mkClass('empty')], students, [], [], []);
            expect(matrix['r1']['empty'].totalStudents).toBe(0);
        });

        it('is the same across all activity kinds for the same class', () => {
            const activities = [
                { kind: 'rubric' as const, id: 'r1', name: 'R1' },
                { kind: 'test' as const, id: 't1', name: 'T1' },
                { kind: 'essay' as const, id: 'ek1', name: 'E1' },
            ];
            const matrix = buildDashboardMatrix(activities, [mkClass('cls1')], students, [], [], []);
            expect(matrix['r1']['cls1'].totalStudents).toBe(2);
            expect(matrix['t1']['cls1'].totalStudents).toBe(2);
            expect(matrix['ek1']['cls1'].totalStudents).toBe(2);
        });
    });

    describe('matrix structure', () => {
        it('creates an entry for every activity × class combination', () => {
            const activities = [
                { kind: 'rubric' as const, id: 'r1', name: 'R1' },
                { kind: 'test' as const, id: 't1', name: 'T1' },
            ];
            const matrix = buildDashboardMatrix(activities, classes, students, [], [], []);
            expect(Object.keys(matrix)).toHaveLength(2);
            expect(Object.keys(matrix['r1'])).toHaveLength(2);
            expect(Object.keys(matrix['t1'])).toHaveLength(2);
        });

        it('returns empty matrix when no activities', () => {
            const matrix = buildDashboardMatrix([], classes, students, [], [], []);
            expect(Object.keys(matrix)).toHaveLength(0);
        });

        it('returns matrix with empty class-rows when no classes', () => {
            const activities = [{ kind: 'rubric' as const, id: 'r1', name: 'R1' }];
            const matrix = buildDashboardMatrix(activities, [], students, [], [], []);
            expect(matrix['r1']).toEqual({});
        });
    });
});

// ─── Stress tests ─────────────────────────────────────────────────────────────

describe('stress test — large dataset', () => {
    const CLASSES = Array.from({ length: 12 }, (_, i) =>
        mkClass(`cls${i}`, i % 2 === 0 ? ['r0', 'r1', 'r2'] : [])
    );
    const STUDENTS = CLASSES.flatMap((cls) =>
        Array.from({ length: 35 }, (_, j) => mkStudent(`${cls.id}_s${j}`, cls.id))
    );
    const RUBRIC_ACTIVITIES = Array.from({ length: 8 }, (_, i) => ({ kind: 'rubric' as const, id: `r${i}`, name: `Rubric ${i}` }));
    const TEST_ACTIVITIES = Array.from({ length: 4 }, (_, i) => ({ kind: 'test' as const, id: `t${i}`, name: `Test ${i}` }));
    const ESSAY_ACTIVITIES = Array.from({ length: 5 }, (_, i) => ({ kind: 'essay' as const, id: `ek${i}`, name: `Essay ${i}` }));
    const ALL_ACTIVITIES = [...RUBRIC_ACTIVITIES, ...TEST_ACTIVITIES, ...ESSAY_ACTIVITIES];

    const STUDENT_RUBRICS = RUBRIC_ACTIVITIES.flatMap((rb) =>
        STUDENTS.slice(0, 200).map((s) => mkSR(`sr_${rb.id}_${s.id}`, rb.id, s.id))
    );
    const STUDENT_TESTS = TEST_ACTIVITIES.flatMap((t) =>
        STUDENTS.slice(0, 120).map((s) => mkST(`st_${t.id}_${s.id}`, t.id, s.id, 'submitted'))
    );
    const ESSAY_ASSIGNMENTS = ESSAY_ACTIVITIES.flatMap((e) =>
        STUDENTS.slice(0, 100).map((s) => mkEssay(e.id, s.id, `Essay ${e.id}`))
    );

    it('builds 17-activity × 12-class matrix without throwing', () => {
        expect(() =>
            buildDashboardMatrix(ALL_ACTIVITIES, CLASSES, STUDENTS, STUDENT_RUBRICS, STUDENT_TESTS, ESSAY_ASSIGNMENTS)
        ).not.toThrow();
    });

    it('produces exactly 17 activity keys and 12 class keys each', () => {
        const matrix = buildDashboardMatrix(ALL_ACTIVITIES, CLASSES, STUDENTS, STUDENT_RUBRICS, STUDENT_TESTS, ESSAY_ASSIGNMENTS);
        expect(Object.keys(matrix)).toHaveLength(17);
        for (const actId of Object.keys(matrix)) {
            expect(Object.keys(matrix[actId])).toHaveLength(12);
        }
    });

    it('totalStudents is 35 for all classes', () => {
        const matrix = buildDashboardMatrix(ALL_ACTIVITIES, CLASSES, STUDENTS, [], [], []);
        for (const actId of Object.keys(matrix)) {
            for (const clsId of Object.keys(matrix[actId])) {
                expect(matrix[actId][clsId].totalStudents).toBe(35);
            }
        }
    });

    it('rubric isLinked matches Class.rubricIds (even-indexed classes have r0-r2 linked)', () => {
        const matrix = buildDashboardMatrix(ALL_ACTIVITIES, CLASSES, STUDENTS, [], [], []);
        // cls0 (even): has r0, r1, r2 linked
        expect(matrix['r0']['cls0'].isLinked).toBe(true);
        expect(matrix['r1']['cls0'].isLinked).toBe(true);
        expect(matrix['r2']['cls0'].isLinked).toBe(true);
        expect(matrix['r3']['cls0'].isLinked).toBe(false); // r3 not in rubricIds
        // cls1 (odd): no rubricIds
        expect(matrix['r0']['cls1'].isLinked).toBe(false);
    });

    it('getActivityRows deduplicates 500 essay assignments into 5 rows', () => {
        const essayAssignments = ESSAY_ACTIVITIES.flatMap((e) =>
            STUDENTS.map((s) => mkEssay(e.id, s.id, `Essay ${e.id}`))
        );
        const rows = getActivityRows([], [], essayAssignments);
        expect(rows.filter((r) => r.kind === 'essay')).toHaveLength(5);
    });

    it('all submittedCounts are non-negative integers', () => {
        const matrix = buildDashboardMatrix(ALL_ACTIVITIES, CLASSES, STUDENTS, STUDENT_RUBRICS, STUDENT_TESTS, ESSAY_ASSIGNMENTS);
        for (const actId of Object.keys(matrix)) {
            for (const clsId of Object.keys(matrix[actId])) {
                const { submittedCount } = matrix[actId][clsId];
                expect(submittedCount).toBeGreaterThanOrEqual(0);
                expect(Number.isInteger(submittedCount)).toBe(true);
            }
        }
    });
});
