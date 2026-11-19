import type { Test } from '../types';
import {
    chosenMemberId,
    deliveredQuestions,
    hasVariantFamilies,
    isQuestionDelivered,
    undeliveredQuestionIds,
    variantFamilies,
} from '../../supabase/functions/_shared/variantDelivery.ts';

export {
    chosenMemberId,
    deliveredQuestions,
    hasVariantFamilies,
    isQuestionDelivered,
    undeliveredQuestionIds,
    variantFamilies,
};

/**
 * An easier copy of a cloze question (`buildEasierClozeVariant`) sits next to its source and points
 * back through `variantOfQuestionId`. Together they are one family, and a student must be given
 * exactly one member: the copy can fill a gap with the very answer the original asks for.
 *
 * The member is derived from the student id and the family id (see `_shared/variantDelivery.ts`), so the runner, the printed paper, the
 * scan and every score view agree without a stored field. Members keep identical `points`, so which
 * member a student gets never changes the total.
 */

/** The test as one student receives it; the same object when it has no variant families. */
export function deliveredTest(test: Test, studentId: string | null | undefined): Test {
    const questions = deliveredQuestions(test, studentId);
    return questions === test.questions ? test : { ...test, questions };
}

/**
 * Maximum points one student can earn. Members share their points, so this only differs from the
 * plain sum when a family's members were edited apart; then the student's own member decides.
 */
export function deliveredMaxPoints(test: Pick<Test, 'questions'>, studentId: string | null | undefined): number {
    return deliveredQuestions(test, studentId).reduce((sum, q) => sum + q.points, 0);
}

/**
 * Groups students that receive the same set of questions, so a printed stack needs one booklet per
 * group. Students are kept in the order given; a test without families yields a single group.
 */
export function groupStudentsByDelivery<T extends { id: string }>(
    test: Test,
    students: T[]
): { test: Test; students: T[] }[] {
    if (!hasVariantFamilies(test)) return [{ test, students }];
    const groups = new Map<string, { test: Test; students: T[] }>();
    for (const student of students) {
        const skipped = [...undeliveredQuestionIds(test, student.id)].sort().join('|');
        const group = groups.get(skipped) ?? { test: deliveredTest(test, student.id), students: [] };
        group.students.push(student);
        groups.set(skipped, group);
    }
    return [...groups.values()];
}

/** One paper per member slot (original first), for a stack printed without named students. */
export function genericVariantPapers(test: Test): Test[] {
    const families = variantFamilies(test.questions);
    if (families.size === 0) return [test];
    const slots = Math.max(...[...families.values()].map((members) => members.length));
    return Array.from({ length: slots }, (_, slot) => {
        const skipped = new Set<string>();
        for (const members of families.values()) {
            const keep = members[slot % members.length].id;
            for (const member of members) if (member.id !== keep) skipped.add(member.id);
        }
        return { ...test, questions: test.questions.filter((q) => !skipped.has(q.id)) };
    });
}

/**
 * The papers to print for a stack: named students are grouped by the members they are given (so a
 * scan reads the same layout the student answered); an unnamed stack gets one paper per member slot.
 */
export function examPapers<T extends { id: string }>(
    test: Test,
    students: T[] | undefined
): { test: Test; students: T[] }[] {
    if (!hasVariantFamilies(test)) return [{ test, students: students ?? [] }];
    if (students && students.length > 0) return groupStudentsByDelivery(test, students);
    return genericVariantPapers(test).map((paper) => ({ test: paper, students: [] }));
}
