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
