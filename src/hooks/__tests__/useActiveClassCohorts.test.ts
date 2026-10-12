import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useActiveClassCohorts } from '../useActiveClassCohorts';

const classes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

function setup(initial: string | undefined) {
    const setActiveClassId = vi.fn();
    const hook = renderHook(
        ({ activeClassId }) => useActiveClassCohorts({ activeClassId, classes, setActiveClassId }),
        { initialProps: { activeClassId: initial } }
    );
    return { ...hook, setActiveClassId };
}

describe('useActiveClassCohorts (#661)', () => {
    it('seeds the chips from the active class', () => {
        expect(setup('b').result.current.selectedCohorts).toEqual(['b']);
        expect(setup(undefined).result.current.isAllCohorts).toBe(true);
        expect(setup('gone').result.current.isAllCohorts).toBe(true);
    });

    it('follows the topbar when it picks or clears a class', () => {
        const { result, rerender, setActiveClassId } = setup(undefined);
        rerender({ activeClassId: 'c' });
        expect(result.current.selectedCohorts).toEqual(['c']);
        rerender({ activeClassId: undefined });
        expect(result.current.isAllCohorts).toBe(true);
        expect(setActiveClassId).not.toHaveBeenCalled();
    });

    it('writes back only a single selected class', () => {
        const { result, rerender, setActiveClassId } = setup(undefined);
        act(() => result.current.toggleCohort('a'));
        expect(setActiveClassId).toHaveBeenLastCalledWith('a');
        rerender({ activeClassId: 'a' });
        act(() => result.current.toggleCohort('b'));
        expect(result.current.selectedCohorts).toEqual(['a', 'b']);
        expect(setActiveClassId).toHaveBeenLastCalledWith(undefined);
        rerender({ activeClassId: undefined });
        expect(result.current.selectedCohorts).toEqual(['a', 'b']);
        act(() => result.current.selectAllCohorts());
        expect(result.current.isAllCohorts).toBe(true);
    });

    it('accepts an updater for the selection', () => {
        const { result, setActiveClassId } = setup('a');
        act(() => result.current.setSelectedCohorts((prev) => prev.map((id) => (id === 'a' ? 'c' : id))));
        expect(result.current.selectedCohorts).toEqual(['c']);
        expect(setActiveClassId).toHaveBeenLastCalledWith('c');
    });
});
