import type { Class, SchoolYear, Student, VoTrack } from '../types';
import { getClassYears } from '../data/schoolYears';
import { getClassVoTracks } from '../data/voTracks';

/** The override fields alone, so callers spread the patch over the student rather than a whole record. */
export interface CohortOverridePatch {
    schoolYear?: SchoolYear;
    voTrack?: VoTrack;
}

/**
 * A student's `schoolYear`/`voTrack` override is only meaningful while their own class still
 * teaches that year/track (see the `Student` type). Editing a class down to fewer years or tracks,
 * or merging a class into a narrower one, can strand the override: `getEffectiveSchoolYear` /
 * `getEffectiveVoTrack` would keep reporting a cohort the class no longer holds, and the roster
 * hides the picker once the class has a single option, so the mismatch is invisible.
 *
 * Returns null when both overrides still fit, so callers can skip the write entirely.
 */
export function staleCohortOverridePatch(
    student: Pick<Student, 'schoolYear' | 'voTrack'>,
    cls: Pick<Class, 'year' | 'years' | 'voTrack' | 'voTracks'> | undefined
): CohortOverridePatch | null {
    const years = getClassYears(cls);
    const tracks = getClassVoTracks(cls);
    const staleYear = student.schoolYear !== undefined && !years.includes(student.schoolYear);
    const staleTrack = student.voTrack !== undefined && !tracks.includes(student.voTrack);
    if (!staleYear && !staleTrack) return null;
    // Explicit `undefined` rather than omission, so `{ ...student, ...patch }` clears the field.
    return {
        ...(staleYear ? { schoolYear: undefined } : {}),
        ...(staleTrack ? { voTrack: undefined } : {}),
    };
}
