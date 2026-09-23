import type { TestQuestionType } from '../types';

export interface ClozeGap {
    index: number;
    alternatives: string[];
}

export interface ClozeTextSegment {
    type: 'text';
    text: string;
}

export interface ClozeGapSegment {
    type: 'gap';
    gap: ClozeGap;
}

export type ClozeSegment = ClozeTextSegment | ClozeGapSegment;

const GAP_PATTERN = /\{\{(.*?)\}\}/g;

export function parseClozeGaps(prompt: string): ClozeGap[] {
    const gaps: ClozeGap[] = [];
    let match: RegExpExecArray | null;
    let index = 0;
    GAP_PATTERN.lastIndex = 0;
    while ((match = GAP_PATTERN.exec(prompt)) !== null) {
        const alternatives = match[1]
            .split('|')
            .map((alt) => alt.trim())
            .filter((alt) => alt.length > 0);
        gaps.push({ index, alternatives });
        index += 1;
    }
    return gaps;
}

export interface HotTextTextSegment {
    type: 'text';
    text: string;
}

export interface HotTextFragmentSegment {
    type: 'fragment';
    index: number;
    text: string;
}

export type HotTextSegment = HotTextTextSegment | HotTextFragmentSegment;

const FRAGMENT_PATTERN = /\[\[(.*?)\]\]/g;

export function parseHotTextFragments(passage: string): HotTextSegment[] {
    const segments: HotTextSegment[] = [];
    let lastIndex = 0;
    let fragmentIndex = 0;
    let match: RegExpExecArray | null;
    FRAGMENT_PATTERN.lastIndex = 0;
    while ((match = FRAGMENT_PATTERN.exec(passage)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ type: 'text', text: passage.slice(lastIndex, match.index) });
        }
        segments.push({ type: 'fragment', index: fragmentIndex, text: match[1] });
        fragmentIndex += 1;
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < passage.length) {
        segments.push({ type: 'text', text: passage.slice(lastIndex) });
    }
    return segments;
}

export function renderClozeSegments(prompt: string): ClozeSegment[] {
    const segments: ClozeSegment[] = [];
    let lastIndex = 0;
    let gapIndex = 0;
    let match: RegExpExecArray | null;
    GAP_PATTERN.lastIndex = 0;
    while ((match = GAP_PATTERN.exec(prompt)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ type: 'text', text: prompt.slice(lastIndex, match.index) });
        }
        const alternatives = match[1]
            .split('|')
            .map((alt) => alt.trim())
            .filter((alt) => alt.length > 0);
        segments.push({ type: 'gap', gap: { index: gapIndex, alternatives } });
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
