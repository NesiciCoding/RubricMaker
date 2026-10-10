export function distributeWeights<T extends { weight: number }>(criteria: T[]): T[] {
    if (criteria.length === 0) return criteria;
    const base = Math.floor(100 / criteria.length);
    const remainder = 100 - base * criteria.length;
    return criteria.map((c, i) => ({ ...c, weight: base + (i < remainder ? 1 : 0) }));
}

// A split that totals 100 with no criterion more than a point off the others is one the teacher
// has not tuned by hand, so it is safe to rebalance when criteria are added or removed.
export function hasEvenWeights(criteria: { weight: number }[]): boolean {
    if (criteria.length === 0) return true;
    const weights = criteria.map((c) => c.weight || 0);
    const total = weights.reduce((sum, w) => sum + w, 0);
    return total === 100 && Math.max(...weights) - Math.min(...weights) <= 1;
}

export function remainingWeight(criteria: { weight: number }[]): number {
    return Math.max(0, 100 - criteria.reduce((sum, c) => sum + (c.weight || 0), 0));
}
