/**
 * Groups a collection by student id so a per-student aggregator (getCefrStudentOverview,
 * getStudentMasteryProfile, etc.) can be called with each student's own slice instead of the
 * full app-wide array — those aggregators re-filter by studentId internally, so a pre-sliced
 * array is behavior-identical, just without the O(students × records) rescan. See
 * docs/PERFORMANCE_AUDIT_2026-11.md #1107.
 */
export function groupByStudentId<T>(items: T[], studentId: (item: T) => string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) {
        const id = studentId(item);
        const arr = map.get(id);
        if (arr) arr.push(item);
        else map.set(id, [item]);
    }
    return map;
}
