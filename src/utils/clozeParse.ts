import type { TestQuestionType } from '../types';
import {
    CLOZE_GAP_PATTERN,
    splitClozeAlternatives,
    type ClozeGap,
} from '../../supabase/functions/_shared/testScoring.ts';

export { parseClozeGaps, parseHotTextFragments } from '../../supabase/functions/_shared/testScoring.ts';
export type {
    ClozeGap,
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
    let gapIndex = 0;
    let match: RegExpExecArray | null;
    const pattern = new RegExp(CLOZE_GAP_PATTERN.source, 'g');
    while ((match = pattern.exec(prompt)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ type: 'text', text: prompt.slice(lastIndex, match.index) });
        }
        segments.push({ type: 'gap', gap: { index: gapIndex, alternatives: splitClozeAlternatives(match[1]) } });
        gapIndex += 1;
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < prompt.length) {
        segments.push({ type: 'text', text: prompt.slice(lastIndex) });
    }
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
    if (question.type === 'cloze' || question.type === 'cloze-dropdown') {
        return renderClozeSegments(question.prompt)
            .map((segment) => (segment.type === 'gap' ? (segment.gap.alternatives[0] ?? '') : segment.text))
            .join('');
    }
    return question.prompt;
}
