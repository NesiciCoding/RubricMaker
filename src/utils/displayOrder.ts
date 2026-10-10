/** Shared sort/reorder helpers for manually-orderable list views (RubricList, TestListPage, EssayListPage, Activity Dashboard). */

export function sortByDisplayOrder<T extends { displayOrder?: number; createdAt?: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        if (a.displayOrder != null && b.displayOrder != null) return a.displayOrder - b.displayOrder;
        if (a.displayOrder != null) return -1;
        if (b.displayOrder != null) return 1;
        return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
    });
}

/** Reorders `sorted` by moving the item at `fromIndex` to `toIndex` and returns [item, newDisplayOrder] pairs to persist. */
export function reorderDisplayOrder<T>(sorted: T[], fromIndex: number, toIndex: number): Array<[T, number]> {
    const items = [...sorted];
    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);
    return items.map((item, i) => [item, i]);
}

/**
 * A displayOrder that sorts a new item directly after `sorted[index]`, plus any positions that
 * must be written first. Takes the midpoint to the next item when both are placed, so placing a
 * copy normally writes nothing else. A next item tied with the source would sort before an
 * appended copy, so tied followers are bumped just far enough to leave room. Items that have no
 * position yet up to and including the source get numbered, after the highest existing position.
 */
export function displayOrderAfter<T extends { displayOrder?: number }>(
    sorted: T[],
    index: number
): { order: number; updates: Array<[T, number]> } {
    const source = sorted[index];
    const next = sorted[index + 1];
    if (source.displayOrder != null) {
        if (next?.displayOrder == null) return { order: source.displayOrder + 1, updates: [] };
        if (next.displayOrder > source.displayOrder) {
            return { order: (source.displayOrder + next.displayOrder) / 2, updates: [] };
        }
        const order = source.displayOrder + 1;
        const updates: Array<[T, number]> = [];
        let last = order;
        for (const item of sorted.slice(index + 1)) {
            if (item.displayOrder == null || item.displayOrder > last) break;
            updates.push([item, ++last]);
        }
        return { order, updates };
    }
    let order = Math.max(-1, ...sorted.map((item) => item.displayOrder ?? -1));
    const updates: Array<[T, number]> = [];
    for (const item of sorted.slice(0, index + 1)) {
        if (item.displayOrder == null) updates.push([item, ++order]);
    }
    return { order: order + 1, updates };
}
