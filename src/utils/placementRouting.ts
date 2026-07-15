import type { Test, TestQuestion, TestAnswer } from '../types';
import { autoScoreResponse } from './testCalc';

/** Shape needed by the routing helpers below — narrower than `Test` so builder-in-progress state (not yet a saved Test) can reuse them directly. */
type SectionedTest = Pick<Test, 'questions' | 'sections'>;

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** A staged (routed) test has at least one section with a routing rule. */
export function isStagedTest(test: SectionedTest): boolean {
    return (test.sections ?? []).some((s) => s.routing);
}

export function entrySectionId(test: SectionedTest): string | null {
    return test.sections?.[0]?.id ?? null;
}

/** Open questions require manual grading and can't drive automatic routing. */
export function isAutoScorable(question: TestQuestion): boolean {
    return question.type !== 'open';
}

/** Questions presented for a given section — the entry section also picks up any question left without a sectionId. */
export function sectionQuestions(test: SectionedTest, sectionId: string): TestQuestion[] {
    const isEntry = entrySectionId(test) === sectionId;
    return test.questions.filter((q) => q.sectionId === sectionId || (isEntry && !q.sectionId));
}

export function sectionMaxPoints(test: SectionedTest, sectionId: string): number {
    return sectionQuestions(test, sectionId).reduce((sum, q) => sum + q.points, 0);
}

function sectionRawPoints(test: SectionedTest, sectionId: string, answers: TestAnswer[]): number {
    const latestByQuestionId = new Map<string, TestAnswer>();
    for (const answer of answers) latestByQuestionId.set(answer.questionId, answer);
    return sectionQuestions(test, sectionId).reduce((sum, q) => {
        const answer = latestByQuestionId.get(q.id);
        if (!answer) return sum;
        const earned = answer.pointsEarned ?? autoScoreResponse(q, answer.response);
        return sum + earned;
    }, 0);
}

export function scoreSectionPct(test: SectionedTest, sectionId: string, answers: TestAnswer[]): number {
    const max = sectionMaxPoints(test, sectionId);
    if (max <= 0) return 0;
    return clamp((sectionRawPoints(test, sectionId, answers) / max) * 100, 0, 100);
}

/**
 * Resolves the next section for a staged test given the answers submitted so far for
 * `sectionId`. Returns null when the current section is terminal (no routing), the
 * routing target doesn't exist, or the target was already visited (cycle guard).
 */
export function resolveNextSection(
    test: SectionedTest,
    sectionId: string,
    answers: TestAnswer[],
    visited: string[]
): string | null {
    const section = (test.sections ?? []).find((s) => s.id === sectionId);
    if (!section?.routing) return null;

    const pct = scoreSectionPct(test, sectionId, answers);
    const nextId = pct >= section.routing.thresholdPct ? section.routing.passSectionId : section.routing.failSectionId;
    const nextExists = (test.sections ?? []).some((s) => s.id === nextId);
    if (!nextExists || visited.includes(nextId)) return null;
    return nextId;
}

/** Total points available across only the sections a student actually saw, for path-aware scoring. */
export function maxPointsForPath(test: SectionedTest, sectionPath: string[]): number {
    return sectionPath.reduce((sum, id) => sum + sectionMaxPoints(test, id), 0);
}

/**
 * Static cycle detection over a test's routing graph (both pass and fail edges,
 * independent of any one student's answers) — used by the builder to warn authors
 * before a routed test is ever taken.
 */
export function hasRoutingCycle(test: Pick<Test, 'sections'>): boolean {
    const sections = test.sections ?? [];
    const bySectionId = new Map(sections.map((s) => [s.id, s]));
    const state = new Map<string, 'visiting' | 'done'>();

    function visit(id: string): boolean {
        const status = state.get(id);
        if (status === 'visiting') return true;
        if (status === 'done') return false;

        state.set(id, 'visiting');
        const routing = bySectionId.get(id)?.routing;
        const edges = routing ? [routing.passSectionId, routing.failSectionId] : [];
        const cycle = edges.some((next) => bySectionId.has(next) && visit(next));
        state.set(id, 'done');
        return cycle;
    }

    return sections.some((s) => visit(s.id));
}
