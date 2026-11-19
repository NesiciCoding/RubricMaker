import { describe, expect, it } from 'vitest';
import type { StudentTest, Test, TestQuestion } from '../types';
import {
    deliveredMaxPoints,
    deliveredQuestions,
    deliveredTest,
    examPapers,
    genericVariantPapers,
    groupStudentsByDelivery,
    hasVariantFamilies,
    isQuestionDelivered,
    undeliveredQuestionIds,
    variantFamilies,
} from './variantDelivery';
import { scoreStudentTest } from './studentTestScore';
import { calcTestMaxPoints } from './testCalc';
import { calcTestQuality } from './testQualityMetrics';
import { calcTestItemAnalysis } from './testSummaryAggregator';
import { isSheetComplete } from './scoreSheet';

function q(id: string, extra: Partial<TestQuestion> = {}): TestQuestion {
    return { id, type: 'cloze', prompt: `[${id}]`, points: 2, ...extra } as TestQuestion;
}

const test: Test = {
    id: 't1',
    name: 'T',
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01',
    questions: [q('a'), q('a2', { variantOfQuestionId: 'a' }), q('b', { type: 'open', points: 3 })],
};

const STUDENTS = Array.from({ length: 40 }, (_, i) => `student-${i}`);

describe('variant families', () => {
    it('groups a source and its copies, and ignores everything else', () => {
        const families = variantFamilies(test.questions);
        expect([...families.keys()]).toEqual(['a']);
        expect(families.get('a')?.map((m) => m.id)).toEqual(['a', 'a2']);
        expect(hasVariantFamilies(test)).toBe(true);
        expect(hasVariantFamilies({ questions: [q('x'), q('y')] })).toBe(false);
    });

    it('does not treat a copy whose source was deleted as a family of one', () => {
        expect(variantFamilies([q('c', { variantOfQuestionId: 'gone' })]).size).toBe(0);
    });
});

describe('delivery', () => {
    it('gives every student exactly one member, the same one every time', () => {
        for (const id of STUDENTS) {
            const given = deliveredQuestions(test, id).map((x) => x.id);
            expect(given.filter((x) => x === 'a' || x === 'a2')).toHaveLength(1);
            expect(given).toContain('b');
            expect(deliveredQuestions(test, id).map((x) => x.id)).toEqual(given);
        }
    });

    it('spreads a class across both members', () => {
        const seen = new Set(STUDENTS.map((id) => (isQuestionDelivered(test, id, 'a') ? 'a' : 'a2')));
        expect(seen).toEqual(new Set(['a', 'a2']));
    });

    it('hands an unnamed paper the original and leaves a plain test untouched', () => {
        expect(deliveredQuestions(test, null).map((x) => x.id)).toEqual(['a', 'b']);
        const plain: Test = { ...test, questions: [q('x')] };
        expect(deliveredTest(plain, 's')).toBe(plain);
        expect(undeliveredQuestionIds(plain, 's').size).toBe(0);
    });

    it('keeps the maximum points the same whichever member a student gets', () => {
        for (const id of STUDENTS) expect(deliveredMaxPoints(test, id)).toBe(5);
        expect(calcTestMaxPoints(test)).toBe(5);
    });
});

describe('scores and statistics', () => {
    const attempt = (studentId: string, answers: StudentTest['answers']): StudentTest => ({
        id: `st-${studentId}`,
        testId: 't1',
        studentId,
        status: 'submitted',
        startedAt: '2026-01-01',
        answers,
    });

    it('scores out of the delivered total and lists only delivered questions', () => {
        const id = STUDENTS[0];
        const given = isQuestionDelivered(test, id, 'a') ? 'a' : 'a2';
        const score = scoreStudentTest(test, attempt(id, [{ questionId: given, response: '', pointsEarned: 2 }]));
        expect(score.maxPoints).toBe(5);
        expect(score.pathQuestions.map((x) => x.id)).toContain(given);
        expect(score.pathQuestions).toHaveLength(2);
        expect(score.percentage).toBeCloseTo(40);
    });

    it('does not count the sibling a student never saw as a miss in item analysis', () => {
        const attempts = STUDENTS.map((id) => {
            const given = isQuestionDelivered(test, id, 'a') ? 'a' : 'a2';
            return attempt(id, [
                { questionId: given, response: '', pointsEarned: 2 },
                { questionId: 'a' === given ? 'a2' : 'a', response: '' },
                { questionId: 'b', response: 'x', pointsEarned: 3 },
            ]);
        });
        const rows = calcTestItemAnalysis(attempts, test);
        const sample = (id: string) => rows.find((r) => r.questionId === id)?.sampleSize ?? 0;
        expect(sample('a') + sample('a2')).toBe(STUDENTS.length);
        expect(sample('b')).toBe(STUDENTS.length);
    });

    it('keeps every student in the quality report by scoring a family as one item', () => {
        const attempts = STUDENTS.map((id, i) => {
            const given = isQuestionDelivered(test, id, 'a') ? 'a' : 'a2';
            return attempt(id, [
                { questionId: given, response: '', pointsEarned: i % 3 === 0 ? 0 : 2 },
                { questionId: 'b', response: 'x', pointsEarned: i % 2 === 0 ? 1 : 3 },
            ]);
        });
        const report = calcTestQuality(test, attempts);
        expect(report.summary.n).toBe(STUDENTS.length);
        expect(report.items.map((item) => item.itemId)).toEqual(['a', 'b']);
        expect(report.summary.maxPoints).toBe(5);
    });

    it('treats a sheet as complete once the delivered questions have scores', () => {
        const id = STUDENTS[1];
        const given = isQuestionDelivered(test, id, 'a') ? 'a' : 'a2';
        const st = attempt(id, [
            { questionId: given, response: '', pointsEarned: 1 },
            { questionId: 'b', response: '', pointsEarned: 1 },
        ]);
        expect(isSheetComplete(test, st)).toBe(true);
        expect(isSheetComplete(test, { ...st, answers: st.answers.slice(0, 1) })).toBe(false);
    });
});

describe('printed papers', () => {
    const students = STUDENTS.slice(0, 12).map((id) => ({ id }));

    it('prints one paper per distinct set of questions and keeps every student on exactly one', () => {
        const groups = groupStudentsByDelivery(test, students);
        expect(groups).toHaveLength(2);
        expect(groups.flatMap((g) => g.students)).toHaveLength(students.length);
        for (const group of groups) {
            expect(group.test.questions).toHaveLength(2);
            for (const s of group.students) {
                expect(group.test.questions.map((x) => x.id)).toEqual(deliveredQuestions(test, s.id).map((x) => x.id));
            }
        }
    });

    it('prints one paper per member slot for an unnamed stack', () => {
        const papers = genericVariantPapers(test);
        expect(papers.map((p) => p.questions.map((x) => x.id))).toEqual([
            ['a', 'b'],
            ['a2', 'b'],
        ]);
        expect(examPapers(test, undefined)).toHaveLength(2);
        expect(examPapers(test, [])).toHaveLength(2);
    });

    it('is a single paper when the test has no variants', () => {
        const plain: Test = { ...test, questions: [q('x')] };
        expect(examPapers(plain, students)).toEqual([{ test: plain, students }]);
        expect(examPapers(plain, undefined)).toEqual([{ test: plain, students: [] }]);
    });
});
