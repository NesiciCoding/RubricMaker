import type { ComparativeMatchup } from '../types';

export function getMatchKey(id1: string, id2: string): string {
    return [id1, id2].sort().join('|');
}

export function countMatchupsPerStudent(matchups: ComparativeMatchup[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const m of matchups) {
        counts[m.studentAId] = (counts[m.studentAId] ?? 0) + 1;
        counts[m.studentBId] = (counts[m.studentBId] ?? 0) + 1;
    }
    return counts;
}

/**
 * Picks the next pair to compare given the matchups already completed (and persisted)
 * for this rubric. `matchupLimit` caps how many matchups a single student may appear
 * in; 0/undefined means unlimited. Returns null once fewer than 2 students remain
 * eligible (i.e. the session is done).
 */
export function pickNextMatchupPair<T extends { id: string }>(
    classStudents: T[],
    matchups: ComparativeMatchup[],
    matchupLimit: number,
    anchorId: string | null
): { a: T; b: T } | null {
    const counts = countMatchupsPerStudent(matchups);
    const eligible = matchupLimit > 0 ? classStudents.filter((s) => (counts[s.id] ?? 0) < matchupLimit) : classStudents;
    if (eligible.length < 2) return null;

    let a = anchorId ? (eligible.find((s) => s.id === anchorId) ?? null) : null;
    if (!a) a = eligible[Math.floor(Math.random() * eligible.length)];

    const pairedKeys = new Set(matchups.map((m) => getMatchKey(m.studentAId, m.studentBId)));
    let candidatesForB = eligible.filter((s) => s.id !== a!.id && !pairedKeys.has(getMatchKey(a!.id, s.id)));
    if (candidatesForB.length === 0) candidatesForB = eligible.filter((s) => s.id !== a!.id);

    const b = candidatesForB[Math.floor(Math.random() * candidatesForB.length)];
    return { a, b };
}
