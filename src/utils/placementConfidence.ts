import type { StaircaseStep } from '../types';
import { computeStaircaseState, type StaircaseRunConfig } from './placementStaircase';

/** How settled a placement level estimate is: still walking one way, bracketed, or converged. */
export type PlacementConfidence = 'low' | 'medium' | 'high';

/**
 * Reads the run's own trace rather than any stored score: until the staircase has reversed
 * direction it is still stepping the same way, so the level it reports is where the student was
 * last pushed to, not a level it has bracketed. The first reversal brackets the level between two
 * adjacent levels; the second is the engine's own convergence rule, after which the estimate stops
 * moving. Null when nothing has been asked yet.
 */
export function placementConfidence(
    steps: Pick<StaircaseStep, 'correct' | 'overridden'>[],
    config?: StaircaseRunConfig
): PlacementConfidence | null {
    if (steps.length === 0) return null;
    const { reversalCount, converged } = computeStaircaseState(steps, config);
    if (converged) return 'high';
    return reversalCount >= 1 ? 'medium' : 'low';
}
