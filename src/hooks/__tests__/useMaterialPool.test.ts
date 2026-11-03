import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Rubric, Test } from '../../types';

const sharedState = vi.hoisted(() => ({
    rubric: { items: [] as { item: Rubric }[] },
    test: { items: [] as { item: Test }[] },
}));

vi.mock('../useSharedMaterials', () => ({
    useSharedMaterials: (kind: 'rubric' | 'test') => sharedState[kind],
}));

import { useRubricPool, useTestPool } from '../useMaterialPool';

const rubric = (id: string): Rubric =>
    ({ id, name: id, criteria: [], levels: [], scoringMode: 'points' }) as unknown as Rubric;
const rmTest = (id: string): Test => ({ id, name: id, questions: [] }) as unknown as Test;

describe('useRubricPool', () => {
    it('returns just the own list when nothing is shared', () => {
        sharedState.rubric.items = [];
        const own = [rubric('r1')];
        const { result } = renderHook(() => useRubricPool(own));
        expect(result.current.rubrics).toBe(own);
        expect(result.current.isOwnRubric('r1')).toBe(true);
        expect(result.current.isOwnRubric('r2')).toBe(false);
    });

    it('appends colleague rubrics not already in the own list', () => {
        sharedState.rubric.items = [{ item: rubric('colleague') }];
        const own = [rubric('r1')];
        const { result } = renderHook(() => useRubricPool(own));
        expect(result.current.rubrics.map((r) => r.id)).toEqual(['r1', 'colleague']);
        expect(result.current.isOwnRubric('colleague')).toBe(false);
    });

    it('own rubrics win on an id collision with a shared entry', () => {
        const ownR1 = rubric('r1');
        sharedState.rubric.items = [{ item: { ...rubric('r1'), name: 'colleague-copy' } }];
        const { result } = renderHook(() => useRubricPool([ownR1]));
        expect(result.current.rubrics).toHaveLength(1);
        expect(result.current.rubrics[0]).toBe(ownR1);
    });
});

describe('useTestPool', () => {
    it('appends colleague tests not already owned', () => {
        sharedState.test.items = [{ item: rmTest('colleague-test') }];
        const own = [rmTest('t1')];
        const { result } = renderHook(() => useTestPool(own));
        expect(result.current.tests.map((t) => t.id)).toEqual(['t1', 'colleague-test']);
        expect(result.current.isOwnTest('t1')).toBe(true);
        expect(result.current.isOwnTest('colleague-test')).toBe(false);
    });
});
