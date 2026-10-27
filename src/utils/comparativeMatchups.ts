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

/** How many different partners each student has been compared with. */
export function countPartnersPerStudent(matchups: ComparativeMatchup[]): Record<string, number> {
    const partners: Record<string, Set<string>> = {};
    for (const m of matchups) {
        (partners[m.studentAId] ??= new Set()).add(m.studentBId);
        (partners[m.studentBId] ??= new Set()).add(m.studentAId);
    }
    return Object.fromEntries(Object.entries(partners).map(([id, set]) => [id, set.size]));
}

/**
 * Picks the next pair to compare given the matchups already completed (and persisted)
 * for this rubric. `matchupLimit` caps how many matchups a single student may appear
 * in; 0/undefined means unlimited. With `groupOf`, students are only paired within
 * their own group (e.g. a tiered rubric's tier). Returns null once no two eligible
 * students can be paired (i.e. the session is done).
 */
export function pickNextMatchupPair<T extends { id: string }>(
    classStudents: T[],
    matchups: ComparativeMatchup[],
    matchupLimit: number,
    anchorId: string | null,
    groupOf?: (student: T) => string
): { a: T; b: T } | null {
    const counts = countMatchupsPerStudent(matchups);
    const eligible = matchupLimit > 0 ? classStudents.filter((s) => (counts[s.id] ?? 0) < matchupLimit) : classStudents;
    const together = (x: T, y: T) => x.id !== y.id && (!groupOf || groupOf(x) === groupOf(y));
    const pairable = eligible.filter((s) => eligible.some((o) => together(s, o)));
    if (pairable.length < 2) return null;

    let a = anchorId ? (pairable.find((s) => s.id === anchorId) ?? null) : null;
    if (!a) a = pairable[Math.floor(Math.random() * pairable.length)];

    const pairedKeys = new Set(matchups.map((m) => getMatchKey(m.studentAId, m.studentBId)));
    const partners = pairable.filter((s) => together(a!, s));
    let candidatesForB = partners.filter((s) => !pairedKeys.has(getMatchKey(a!.id, s.id)));
    if (candidatesForB.length === 0) candidatesForB = partners;

    const b = candidatesForB[Math.floor(Math.random() * candidatesForB.length)];
    return { a, b };
}

/**
 * How many matchups a session can hold, and how many partners each student has, when
 * students are only paired within their group (no `groupOf`: everyone is one group).
 */
export function matchupCapacity<T extends { id: string }>(
    students: T[],
    matchupLimit: number,
    groupOf?: (student: T) => string
): { sessionMax: number; partners: Record<string, number> } {
    const groups = new Map<string, T[]>();
    for (const s of students) {
        const key = groupOf ? groupOf(s) : '';
        groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    let sessionMax = 0;
    const partners: Record<string, number> = {};
    for (const members of groups.values()) {
        const g = members.length;
        const possible = (g * (g - 1)) / 2;
        // Each student can appear in at most matchupLimit matchups, so a group holds at most floor(g * limit / 2).
        sessionMax += matchupLimit > 0 ? Math.min(Math.floor((g * matchupLimit) / 2), possible) : possible;
        for (const s of members) partners[s.id] = g - 1;
    }
    return { sessionMax, partners };
}
