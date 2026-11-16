import type { TestQuestionType } from '../types';
import {
    CLOZE_GAP_PATTERN,
    clozeGapToSyntax,
    gapCorrectAnswers,
    matchClozeGaps,
    parseClozeGaps,
    type ClozeGap,
    type ClozeOptionRole,
} from '../../supabase/functions/_shared/testScoring.ts';

export {
    parseClozeGaps,
    matchClozeGaps,
    parseHotTextFragments,
    gapCorrectAnswers,
    clozeGapToSyntax,
    splitClozeOptions,
} from '../../supabase/functions/_shared/testScoring.ts';
export type { ClozeGapMatch } from '../../supabase/functions/_shared/testScoring.ts';
export type {
    ClozeGap,
    ClozeOptionRole,
    HotTextSegment,
    HotTextTextSegment,
    HotTextFragmentSegment,
} from '../../supabase/functions/_shared/testScoring.ts';

export interface ClozeTextSegment {
    type: 'text';
    text: string;
}

export interface ClozeGapSegment {
    type: 'gap';
    gap: ClozeGap;
}

export type ClozeSegment = ClozeTextSegment | ClozeGapSegment;

export function renderClozeSegments(prompt: string): ClozeSegment[] {
    const segments: ClozeSegment[] = [];
    let lastIndex = 0;
    for (const { gap, start, end } of matchClozeGaps(prompt)) {
        if (start > lastIndex) segments.push({ type: 'text', text: prompt.slice(lastIndex, start) });
        segments.push({ type: 'gap', gap });
        lastIndex = end;
    }
    if (lastIndex < prompt.length) segments.push({ type: 'text', text: prompt.slice(lastIndex) });
    return segments;
}

/**
 * Flattens a cloze/cloze-dropdown prompt to plain, syntax-free text for previews/exports/summaries
 * that aren't rendering the interactive gap-editing UI — a gap becomes its correct answer, so a
 * reader sees "The cat sat" rather than "The {{cat|dog}} sat". Not applicable to hot-text: its
 * [[...]] syntax lives in the separate `hotTextPassage` field, never in `prompt` itself. Every
 * other question type's prompt is returned untouched (it may still be HTML — callers already strip
 * that separately).
 */
export function plainQuestionPromptText(question: { type: TestQuestionType; prompt: string }): string {
    if (question.type === 'cloze' || question.type === 'cloze-dropdown' || question.type === 'cloze-bank') {
        const legacyFirstOnly = question.type === 'cloze-dropdown';
        return renderClozeSegments(question.prompt)
            .map((segment) =>
                segment.type === 'gap'
                    ? (gapCorrectAnswers(segment.gap, legacyFirstOnly)[0] ?? segment.gap.alternatives[0] ?? '')
                    : segment.text
            )
            .join('');
    }
    return question.prompt;
}

/** Adds `word` to the nth `{{…}}` gap: as its answer when the gap is empty, otherwise as one more `|` alternative. */
export function addGapAlternative(prompt: string, gapIndex: number, word: string): string {
    let i = -1;
    return prompt.replace(new RegExp(CLOZE_GAP_PATTERN.source, 'g'), (match, inner: string) =>
        ++i === gapIndex ? `{{${inner.trim() ? `${inner}|${word}` : word}}}` : match
    );
}

/**
 * Adds `word` to a dropdown gap as another correct answer. A legacy gap (`{{correct|wrong}}`) is first
 * rewritten with explicit roles, so the options it already had keep their meaning: the first stays
 * correct, the rest stay distractors.
 */
/**
 * A gap's roles with every hole filled: once any option is marked, unmarked options count as correct
 * (`gapCorrectAnswers` accepts them); only a fully unmarked legacy gap uses position — first correct,
 * the rest wrong.
 */
function resolvedGapRoles(gap: ClozeGap): ClozeOptionRole[] {
    const marked = gap.roles?.some((role) => role !== null) ?? false;
    return gap.alternatives.map((_, i) => gap.roles?.[i] ?? (marked || i === 0 ? 'correct' : 'wrong'));
}

export function addDropdownCorrectAnswer(prompt: string, gapIndex: number, word: string): string {
    const target = parseClozeGaps(prompt)[gapIndex];
    const text = word.trim();
    if (!target || !text) return prompt;
    if (gapCorrectAnswers(target, true).some((answer) => answer.toLowerCase() === text.toLowerCase())) {
        return prompt;
    }
    const serialised = clozeGapToSyntax({
        index: gapIndex,
        alternatives: [...target.alternatives, text],
        roles: [...resolvedGapRoles(target), 'correct'],
    });
    return replaceGap(prompt, gapIndex, serialised);
}

/** Adds `word` to a dropdown gap as another wrong option, upgrading a legacy gap to explicit roles first. */
export function addDropdownDistractor(prompt: string, gapIndex: number, word: string): string {
    const target = parseClozeGaps(prompt)[gapIndex];
    const text = word.trim();
    if (!target || !text) return prompt;
    return replaceGap(
        prompt,
        gapIndex,
        clozeGapToSyntax({
            index: gapIndex,
            alternatives: [...target.alternatives, text],
            roles: [...resolvedGapRoles(target), 'wrong'],
        })
    );
}

function replaceGap(prompt: string, gapIndex: number, replacement: string): string {
    const matches = matchClozeGaps(prompt);
    const target = matches[gapIndex];
    if (!target) return prompt;
    return `${prompt.slice(0, target.start)}${replacement}${prompt.slice(target.end)}`;
}
