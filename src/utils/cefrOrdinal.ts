import type { CefrLevel, CefrSubLevel, CefrSubLevelRange } from '../types';

/** Ordinal scale spanning both CefrLevel and CefrSubLevel; array index is the comparable position. */
export const CEFR_SUBLEVEL_ORDER: CefrSubLevel[] = [
    'pre-a1',
    'a1',
    'a1-plus',
    'a2-minus',
    'a2',
    'a2-plus',
    'b1-minus',
    'b1',
    'b1-plus',
    'b2-minus',
    'b2',
    'b2-plus',
    'c1-minus',
    'c1',
    'c1-plus',
    'c2',
];

const CEFR_LEVEL_TO_SUBLEVEL: Record<CefrLevel, CefrSubLevel> = {
    A1: 'a1',
    A2: 'a2',
    B1: 'b1',
    B2: 'b2',
    C1: 'c1',
    C2: 'c2',
};

export function cefrLevelOrdinal(level: CefrLevel): number {
    return CEFR_SUBLEVEL_ORDER.indexOf(CEFR_LEVEL_TO_SUBLEVEL[level]);
}

export function cefrSubLevelOrdinal(level: CefrSubLevel): number {
    return CEFR_SUBLEVEL_ORDER.indexOf(level);
}

export const CEFR_SUBLEVEL_LABELS: Record<CefrSubLevel, string> = {
    'pre-a1': 'Pre-A1',
    a1: 'A1',
    'a1-plus': 'A1+',
    'a2-minus': 'A2-',
    a2: 'A2',
    'a2-plus': 'A2+',
    'b1-minus': 'B1-',
    b1: 'B1',
    'b1-plus': 'B1+',
    'b2-minus': 'B2-',
    b2: 'B2',
    'b2-plus': 'B2+',
    'c1-minus': 'C1-',
    c1: 'C1',
    'c1-plus': 'C1+',
    c2: 'C2',
};

export type ProgressStatus = 'ahead' | 'on-track' | 'behind' | 'no-data';

export const PROGRESS_STATUS_COLOR: Record<ProgressStatus, string> = {
    ahead: 'var(--green)',
    'on-track': 'var(--accent)',
    behind: 'var(--red)',
    'no-data': 'var(--text-dim)',
};

export function compareToRange(achieved: CefrLevel | undefined, range: CefrSubLevelRange): ProgressStatus {
    if (!achieved) return 'no-data';
    const a = cefrLevelOrdinal(achieved);
    const lo = cefrSubLevelOrdinal(range.min);
    const hi = cefrSubLevelOrdinal(range.max);
    if (a > hi) return 'ahead';
    if (a < lo) return 'behind';
    return 'on-track';
}
