// Single source of truth for multistage (MST) placement routing. Imported by the client
// (src/utils/placementRouting.ts) and by submit-test, which replays the routing walk to reject a
// forged sectionPath. May only import sibling _shared modules — see testScoring.ts.

import { autoScoreResponse, isAutoScorable, type ScorableQuestion } from './testScoring.ts';

export interface RoutableQuestion extends ScorableQuestion {
    id: string;
    sectionId?: string;
}

export interface RoutableSection {
    id: string;
    /** Deterministic branching rule: scoring at/above the threshold routes to passSectionId, otherwise failSectionId. */
    routing?: { thresholdPct: number; passSectionId: string; failSectionId: string };
}

/** Shape the routing helpers need — narrow enough for builder-in-progress state and the server's minimal test row alike. */
export interface RoutableTest<Q extends RoutableQuestion = RoutableQuestion> {
    questions?: Q[];
    sections?: RoutableSection[];
}

export interface RoutableAnswer {
    questionId: string;
    response: string;
    /** A teacher's manual score; overrides auto-scoring. Never present on a student submission (submit-test strips it). */
    pointsEarned?: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function isStagedTest(test: { mode?: string; sections?: RoutableSection[] }): boolean {
    return test.mode === 'placement' && (test.sections ?? []).some((s) => s.routing);
}

export function entrySectionId(test: Pick<RoutableTest, 'sections'>): string | null {
    return test.sections?.[0]?.id ?? null;
}

/** Questions presented for a given section — the entry section also picks up any question left without a sectionId. */
export function sectionQuestions<Q extends RoutableQuestion>(test: RoutableTest<Q>, sectionId: string): Q[] {
    const isEntry = entrySectionId(test) === sectionId;
    return (test.questions ?? []).filter((q) => q.sectionId === sectionId || (isEntry && !q.sectionId));
}

export function sectionMaxPoints(test: RoutableTest, sectionId: string): number {
    return sectionQuestions(test, sectionId)
        .filter(isAutoScorable)
        .reduce((sum, q) => sum + q.points, 0);
}

function sectionRawPoints(test: RoutableTest, sectionId: string, answers: RoutableAnswer[]): number {
    const latestByQuestionId = new Map<string, RoutableAnswer>();
    for (const answer of answers) latestByQuestionId.set(answer.questionId, answer);
    return sectionQuestions(test, sectionId)
        .filter(isAutoScorable)
        .reduce((sum, q) => {
            const answer = latestByQuestionId.get(q.id);
            if (!answer) return sum;
            const earned = answer.pointsEarned ?? autoScoreResponse(q, answer.response);
            return sum + earned;
        }, 0);
}

export function scoreSectionPct(test: RoutableTest, sectionId: string, answers: RoutableAnswer[]): number {
    const max = sectionMaxPoints(test, sectionId);
    if (max <= 0) return 0;
    return clamp((sectionRawPoints(test, sectionId, answers) / max) * 100, 0, 100);
}

export function resolveNextSection(
    test: RoutableTest,
    sectionId: string,
    answers: RoutableAnswer[],
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

/** Replays the routing walk from the entry section using the given answers; null if the test has no entry section. */
export function recomputeSectionPath(test: RoutableTest, answers: RoutableAnswer[]): string[] | null {
    const entry = entrySectionId(test);
    if (!entry) return null;
    const path = [entry];
    // Bounded by section count — resolveNextSection's visited-list guard prevents cycles anyway.
    const maxHops = (test.sections ?? []).length + 1;
    while (path.length <= maxHops) {
        const next = resolveNextSection(test, path[path.length - 1], answers, path);
        if (!next) break;
        path.push(next);
    }
    return path;
}

export function sectionPathsMatch(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function maxPointsForPath(test: RoutableTest, sectionPath: string[]): number {
    return sectionPath.reduce((sum, id) => sum + sectionMaxPoints(test, id), 0);
}

export function hasRoutingCycle(test: Pick<RoutableTest, 'sections'>): boolean {
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
