/**
 * Index of the next undecided answer after `from`, or -1 when every later one is already decided.
 * Saving and advancing must never land on an answer the teacher has just saved or skipped, so the
 * decision is expressed as a flag list rather than re-derived from the queue's saved state.
 */
export function findNextUndecided(decided: boolean[], from: number): number {
    for (let i = from + 1; i < decided.length; i++) {
        if (!decided[i]) return i;
    }
    return -1;
}
