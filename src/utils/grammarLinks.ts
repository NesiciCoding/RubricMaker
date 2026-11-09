import type { LinkedFrameworkDescriptor, TestQuestion } from '../types';
import { resolveGrammarItemId } from '../data/grammarStandards';

/** All grammar item ids linked to a question: prefers the explicit multi field, then framework chips, then the legacy single field. */
export function getQuestionGrammarIds(
    q: Pick<TestQuestion, 'linkedGrammarItemIds' | 'linkedGrammarItemId' | 'frameworkDescriptors'>
): string[] {
    if (q.linkedGrammarItemIds && q.linkedGrammarItemIds.length > 0) return [...q.linkedGrammarItemIds];
    const fromChips = (q.frameworkDescriptors ?? [])
        .filter((d) => d.framework === 'grammar')
        .map((d) => d.descriptorId);
    if (fromChips.length > 0) return fromChips;
    if (q.linkedGrammarItemId) return [q.linkedGrammarItemId];
    return [];
}

/** Keeps linkedGrammarItemIds / legacy linkedGrammarItemId derived from framework chips (single source of truth for the picker). */
export function withGrammarIds(q: TestQuestion, frameworkDescriptors: LinkedFrameworkDescriptor[]): TestQuestion {
    const ids = frameworkDescriptors.filter((d) => d.framework === 'grammar').map((d) => d.descriptorId);
    return {
        ...q,
        frameworkDescriptors,
        linkedGrammarItemIds: ids.length > 0 ? ids : undefined,
        // Legacy single field stays populated with the first id so older aggregations/exports keep working.
        linkedGrammarItemId: ids[0],
    };
}

/**
 * Parses user-pasted or imported grammar id lists. Accepts arrays, or strings split on
 * commas, semicolons, pipes, or newlines — with surrounding punctuation/whitespace trimmed
 * and legacy ids resolved, so `gr-mech-end-punctuation, gr-mech-question-mark;` just works.
 */
export function parseGrammarIdList(input: unknown): string[] {
    const raw: string[] = Array.isArray(input)
        ? input.filter((v): v is string => typeof v === 'string')
        : typeof input === 'string'
          ? input.split(/[,;|\n]+/)
          : [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (let token of raw) {
        // Trim whitespace plus common wrapping punctuation: quotes, brackets, trailing periods.
        token = token
            .trim()
            .replace(/^['"([{<]+|['")\]}>.:]+$/g, '')
            .trim();
        if (!token) continue;
        const resolved = resolveGrammarItemId(token);
        if (seen.has(resolved)) continue;
        seen.add(resolved);
        out.push(resolved);
    }
    return out;
}
