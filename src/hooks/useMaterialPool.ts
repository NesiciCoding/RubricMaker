import { useMemo } from 'react';
import { useSharedMaterials } from './useSharedMaterials';
import type { Rubric, Test } from '../types';

/**
 * Own rubrics plus colleagues' rubrics reachable through `useSharedMaterials` (per-person shares,
 * school sharing, and rubrics used in a co-taught class — see migrations 095/096). Own rubrics win
 * on an id collision. For pages that only ever read rubrics (comparative grading, exports,
 * statistics, student profiles) rather than list/edit a teacher's own library, where
 * `useOwnOrSharedItem` already covers single-item lookups.
 */
export function useRubricPool(ownRubrics: Rubric[]): { rubrics: Rubric[]; isOwnRubric: (id: string) => boolean } {
    const shared = useSharedMaterials('rubric');
    return useMemo(() => {
        const ownIds = new Set(ownRubrics.map((r) => r.id));
        const colleague = shared.items.filter((e) => !ownIds.has(e.item.id)).map((e) => e.item);
        return {
            rubrics: colleague.length ? [...ownRubrics, ...colleague] : ownRubrics,
            isOwnRubric: (id: string) => ownIds.has(id),
        };
    }, [ownRubrics, shared.items]);
}

/** Test counterpart of {@link useRubricPool}. */
export function useTestPool(ownTests: Test[]): { tests: Test[]; isOwnTest: (id: string) => boolean } {
    const shared = useSharedMaterials('test');
    return useMemo(() => {
        const ownIds = new Set(ownTests.map((t) => t.id));
        const colleague = shared.items.filter((e) => !ownIds.has(e.item.id)).map((e) => e.item);
        return {
            tests: colleague.length ? [...ownTests, ...colleague] : ownTests,
            isOwnTest: (id: string) => ownIds.has(id),
        };
    }, [ownTests, shared.items]);
}
