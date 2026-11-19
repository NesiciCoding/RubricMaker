// Single source of truth for which member of an easier-cloze family a student is given. Imported by
// the client (src/utils/variantDelivery.ts) and by submit-test, whose section-path replay must see
// the same questions the runner routed on. See testScoring.ts for the sharing rules.

export interface VariantQuestion {
    id: string;
    variantOfQuestionId?: string;
}

function familyIdOf(question: VariantQuestion): string {
    return question.variantOfQuestionId ?? question.id;
}

/** Families with at least two members present, in test order, keyed by the source question id. */
export function variantFamilies<Q extends VariantQuestion>(questions: Q[]): Map<string, Q[]> {
    const referenced = new Set(questions.flatMap((q) => (q.variantOfQuestionId ? [q.variantOfQuestionId] : [])));
    const byFamily = new Map<string, Q[]>();
    for (const question of questions) {
        const id = familyIdOf(question);
        if (!referenced.has(id)) continue;
        byFamily.set(id, [...(byFamily.get(id) ?? []), question]);
    }
    for (const [id, members] of byFamily) if (members.length < 2) byFamily.delete(id);
    return byFamily;
}

export function hasVariantFamilies(test: { questions?: VariantQuestion[] }): boolean {
    return variantFamilies(test.questions ?? []).size > 0;
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
 * member, i.e. the original question. Members are ordered by id before hashing, so reordering the
 * questions in the builder never moves a student to a different member.
 */
export function chosenMemberId(
    familyId: string,
    members: VariantQuestion[],
    studentId: string | null | undefined
): string {
    if (!studentId) return members[0].id;
    const ordered = [...members].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return ordered[hashOf(`${studentId}:${familyId}`) % ordered.length].id;
}

const skippedCache = new WeakMap<VariantQuestion[], Map<string, Set<string>>>();

/** Ids of the questions a student is NOT given because a sibling in their family was chosen instead. */
export function undeliveredQuestionIds(
    test: { questions: VariantQuestion[] },
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

export function isQuestionDelivered(
    test: { questions: VariantQuestion[] },
    studentId: string | null | undefined,
    questionId: string
): boolean {
    return !undeliveredQuestionIds(test, studentId).has(questionId);
}

/** The questions one student is given: every non-family question plus one member per family. */
export function deliveredQuestions<Q extends VariantQuestion>(
    test: { questions: Q[] },
    studentId: string | null | undefined
): Q[] {
    const skipped = undeliveredQuestionIds(test, studentId);
    return skipped.size === 0 ? test.questions : test.questions.filter((q) => !skipped.has(q.id));
}
