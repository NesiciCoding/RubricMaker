import type { Test, TestQuestion } from '../types';

/**
 * An easier copy of a cloze question (`buildEasierClozeVariant`) sits next to its source and points
 * back through `variantOfQuestionId`. Together they are one family, and a student must be given
 * exactly one member: the copy can fill a gap with the very answer the original asks for.
 *
 * The member is derived from the student id and the family id, so the runner, the printed paper, the
 * scan and every score view agree without a stored field. Members keep identical `points`, so which
 * member a student gets never changes the total.
 */

function familyIdOf(question: TestQuestion): string {
    return question.variantOfQuestionId ?? question.id;
}

/** Families with at least two members present, in test order, keyed by the source question id. */
export function variantFamilies(questions: TestQuestion[]): Map<string, TestQuestion[]> {
    const referenced = new Set(questions.flatMap((q) => (q.variantOfQuestionId ? [q.variantOfQuestionId] : [])));
    const byFamily = new Map<string, TestQuestion[]>();
    for (const question of questions) {
        const id = familyIdOf(question);
        if (!referenced.has(id)) continue;
        byFamily.set(id, [...(byFamily.get(id) ?? []), question]);
    }
    for (const [id, members] of byFamily) if (members.length < 2) byFamily.delete(id);
    return byFamily;
}

export function hasVariantFamilies(test: Pick<Test, 'questions'>): boolean {
    return variantFamilies(test.questions).size > 0;
}

/** Stable 32-bit FNV-1a hash of a string. */
function hashOf(key: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash;
}

/**
 * Which member of a family a student receives. `null` (a blank, unnamed paper) takes the first
 * member, i.e. the original question.
 */
export function chosenMemberId(
    familyId: string,
    members: TestQuestion[],
    studentId: string | null | undefined
): string {
    if (!studentId) return members[0].id;
    return members[hashOf(`${studentId}:${familyId}`) % members.length].id;
}

/** Ids of the questions a student is NOT given because a sibling in their family was chosen instead. */
export function undeliveredQuestionIds(
    test: Pick<Test, 'questions'>,
    studentId: string | null | undefined
): Set<string> {
    // Score views ask this once per student × question, so cache per question array.
    const key = studentId ?? '';
    let perStudent = skippedCache.get(test.questions);
    if (!perStudent) {
        perStudent = new Map();
        skippedCache.set(test.questions, perStudent);
    }
    const cached = perStudent.get(key);
    if (cached) return cached;
    const skipped = new Set<string>();
    for (const [familyId, members] of variantFamilies(test.questions)) {
        const chosen = chosenMemberId(familyId, members, studentId);
        for (const member of members) if (member.id !== chosen) skipped.add(member.id);
    }
    perStudent.set(key, skipped);
    return skipped;
}

const skippedCache = new WeakMap<TestQuestion[], Map<string, Set<string>>>();

export function isQuestionDelivered(
    test: Pick<Test, 'questions'>,
    studentId: string | null | undefined,
    questionId: string
): boolean {
    return !undeliveredQuestionIds(test, studentId).has(questionId);
}

/** The questions one student is given: every non-family question plus one member per family. */
export function deliveredQuestions(
    test: Pick<Test, 'questions'>,
    studentId: string | null | undefined
): TestQuestion[] {
    const skipped = undeliveredQuestionIds(test, studentId);
    return skipped.size === 0 ? test.questions : test.questions.filter((q) => !skipped.has(q.id));
}

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
