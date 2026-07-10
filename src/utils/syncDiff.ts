/**
 * Finds which entries in a collection actually changed between two renders of app state,
 * so the delta-sync effect (AppContext.tsx) only pushes what moved instead of re-serializing
 * every record in every collection on every dispatch.
 *
 * The reducer preserves array/item identity for anything untouched by a given dispatch
 * (spreads + `.map()` pass through unrelated entries by reference), so a whole collection
 * can be skipped on `===`, and within a changed collection only items whose reference
 * actually moved need the expensive JSON.stringify compare.
 */
export function diffCollection<T>(
    prevArr: T[],
    currArr: T[],
    getId: (x: T) => string
): { upserted: T[]; deletedIds: string[] } {
    if (prevArr === currArr) return { upserted: [], deletedIds: [] };

    const prevMap = new Map(prevArr.map((x) => [getId(x), x]));
    const currMap = new Map(currArr.map((x) => [getId(x), x]));

    const deletedIds: string[] = [];
    for (const id of prevMap.keys()) {
        if (!currMap.has(id)) deletedIds.push(id);
    }

    const upserted: T[] = [];
    for (const [id, item] of currMap) {
        const prevItem = prevMap.get(id);
        if (prevItem === item) continue;
        if (prevItem === undefined || JSON.stringify(prevItem) !== JSON.stringify(item)) {
            upserted.push(item);
        }
    }

    return { upserted, deletedIds };
}
