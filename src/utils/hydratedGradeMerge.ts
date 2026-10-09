import type { StudentRubric } from '../types';

// `seed` is the blank grade the page started from before the saved record hydrated. A field or
// entry still identical (by reference) to the seed was never touched, so the saved value wins;
// everything the teacher changed is laid over the saved record.
export function mergeEditsOntoSavedGrade(
    seed: StudentRubric,
    local: StudentRubric,
    saved: StudentRubric
): StudentRubric {
    const merged: StudentRubric = { ...saved };
    for (const key of Object.keys(local) as (keyof StudentRubric)[]) {
        if (key === 'id' || key === 'entries' || local[key] === seed[key]) continue;
        Object.assign(merged, { [key]: local[key] });
    }
    const edited = local.entries.filter((e) => !seed.entries.includes(e));
    merged.entries = [
        ...saved.entries.map((e) => edited.find((l) => l.criterionId === e.criterionId) ?? e),
        ...edited.filter((l) => !saved.entries.some((e) => e.criterionId === l.criterionId)),
    ];
    return merged;
}
