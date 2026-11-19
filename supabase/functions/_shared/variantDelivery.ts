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

function chosenIds(
    questions: VariantQuestion[],
    studentId: string | null | undefined,
    recorded: string[] | undefined
): Map<string, VariantQuestion[]> {
    const chosen = new Map<string, VariantQuestion[]>();
    for (const [familyId, members] of variantFamilies(questions)) {
        const kept = recorded && members.find((m) => recorded.includes(m.id));
        const id = kept ? kept.id : chosenMemberId(familyId, members, studentId);
        chosen.set(
            id,
            members.filter((m) => m.id !== id)
        );
    }
    return chosen;
}

/**
 * Ids of the questions a student is NOT given because a sibling in their family was chosen instead.
 * `recorded` is the member ids saved on the attempt when it was delivered; it wins over the hash so
 * later edits to a family never change what an earlier attempt was given.
 */
export function undeliveredQuestionIds(
    test: { questions: VariantQuestion[] },
    studentId: string | null | undefined,
    recorded?: string[]
): Set<string> {
    if (recorded?.length) {
        return new Set([...chosenIds(test.questions, studentId, recorded).values()].flat().map((q) => q.id));
    }
    // Score views ask this once per student × question, so cache per question array.
    const key = studentId ?? '';
    let perStudent = skippedCache.get(test.questions);
    if (!perStudent) {
        perStudent = new Map();
        skippedCache.set(test.questions, perStudent);
    }
    const cached = perStudent.get(key);
    if (cached) return cached;
    const skipped = new Set([...chosenIds(test.questions, studentId, undefined).values()].flat().map((q) => q.id));
    perStudent.set(key, skipped);
    return skipped;
}

/** The family members a student is given — the value to save on the attempt as `deliveredVariantIds`. */
export function deliveredVariantIds(
    test: { questions: VariantQuestion[] },
    studentId: string | null | undefined
): string[] {
    return [...chosenIds(test.questions, studentId, undefined).keys()];
}

export function isQuestionDelivered(
    test: { questions: VariantQuestion[] },
    studentId: string | null | undefined,
    questionId: string,
    recorded?: string[]
): boolean {
    return !undeliveredQuestionIds(test, studentId, recorded).has(questionId);
}

/** The questions one student is given: every non-family question plus one member per family. */
export function deliveredQuestions<Q extends VariantQuestion>(
    test: { questions: Q[] },
    studentId: string | null | undefined,
    recorded?: string[]
): Q[] {
    const skipped = undeliveredQuestionIds(test, studentId, recorded);
    return skipped.size === 0 ? test.questions : test.questions.filter((q) => !skipped.has(q.id));
}
