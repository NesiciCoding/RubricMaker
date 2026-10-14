import { useCallback, useEffect, useState } from 'react';
import type { Class } from '../types';

interface Options {
    activeClassId: string | undefined;
    classes: Pick<Class, 'id'>[];
    setActiveClassId: (classId: string | undefined) => void;
}

/**
 * Cohort-chip selection kept in step with the topbar class selector (settings.activeClassId,
 * read app-wide as "one class, or unset = all"). An empty selection means all classes. Picking a
 * class in the topbar selects just that cohort here; picking chips writes back a class only when
 * exactly one is selected (#661).
 */
export function useActiveClassCohorts({ activeClassId, classes, setActiveClassId }: Options) {
    const knownActive = activeClassId && classes.some((c) => c.id === activeClassId) ? activeClassId : undefined;
    const [selectedCohorts, setSelectedCohorts] = useState<string[]>(knownActive ? [knownActive] : []);
    const singleClassId = selectedCohorts.length === 1 ? selectedCohorts[0] : undefined;
    const classKey = classes.map((c) => c.id).join('\u0000');

    useEffect(() => {
        if (classes.length === 0) return;
        if (knownActive && knownActive !== singleClassId) setSelectedCohorts([knownActive]);
        else if (!activeClassId && singleClassId) setSelectedCohorts([]);
        // Only an outside change to the active class should move the chips.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeClassId, knownActive, classes.length]);

    const choose = useCallback(
        (update: string[] | ((prev: string[]) => string[])) => {
            const next = typeof update === 'function' ? update(selectedCohorts) : update;
            setSelectedCohorts(next);
            const nextSingle = next.length === 1 ? next[0] : undefined;
            if (nextSingle !== activeClassId) setActiveClassId(nextSingle);
        },
        [activeClassId, selectedCohorts, setActiveClassId]
    );

    useEffect(() => {
        if (classes.length === 0) return;
        const ids = new Set(classes.map((c) => c.id));
        const kept = selectedCohorts.filter((id) => ids.has(id));
        if (kept.length !== selectedCohorts.length) choose(kept);
        // A deleted class must drop out of the chips, but a selection change alone shouldn't re-run this.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [classKey]);

    const toggleCohort = useCallback(
        (id: string) => choose((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
        [choose]
    );
    const selectAllCohorts = useCallback(() => choose([]), [choose]);

    return {
        selectedCohorts,
        setSelectedCohorts: choose,
        toggleCohort,
        selectAllCohorts,
        isAllCohorts: selectedCohorts.length === 0,
        singleClassId,
    };
}
