import type { Class, Student, VoTrack } from '../types';

/** A cohort groups students by shared track/entry-year, derived from current + past class memberships — no membership table needed. */
export interface CohortFilter {
    voTrack: VoTrack | 'all';
    year: string | 'all';
}

export const ALL_COHORTS: CohortFilter = { voTrack: 'all', year: 'all' };

/** Returns the ids of every student whose current class, or any past class, matches the given track/year. */
export function getCohortStudentIds(students: Student[], classes: Class[], filter: CohortFilter): Set<string> {
    const classesById = new Map(classes.map((c) => [c.id, c]));
    const matches = (classId: string | undefined) => {
        const c = classId ? classesById.get(classId) : undefined;
        if (!c) return false;
        if (filter.voTrack !== 'all' && c.voTrack !== filter.voTrack) return false;
        if (filter.year !== 'all' && c.year !== filter.year) return false;
        return true;
    };
    const ids = new Set<string>();
    for (const s of students) {
        if (matches(s.classId) || s.pastClassMemberships?.some((m) => matches(m.classId))) ids.add(s.id);
    }
    return ids;
}

export function isAllCohorts(filter: CohortFilter): boolean {
    return filter.voTrack === 'all' && filter.year === 'all';
}
