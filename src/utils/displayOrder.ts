/** Shared sort/reorder helpers for manually-orderable list views (RubricList, TestListPage, EssayListPage, Activity Dashboard). */

export function sortByDisplayOrder<T extends { displayOrder?: number; createdAt: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        if (a.displayOrder != null && b.displayOrder != null) return a.displayOrder - b.displayOrder;
        if (a.displayOrder != null) return -1;
        if (b.displayOrder != null) return 1;
        return a.createdAt.localeCompare(b.createdAt);
    });
}

/** Reorders `sorted` by moving the item at `fromIndex` to `toIndex` and returns [item, newDisplayOrder] pairs to persist. */
export function reorderDisplayOrder<T>(sorted: T[], fromIndex: number, toIndex: number): Array<[T, number]> {
    const items = [...sorted];
    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);
    return items.map((item, i) => [item, i]);
}
