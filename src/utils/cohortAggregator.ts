import type { Class, CohortFilter, Student } from '../types';
import { classHasVoTrack } from '../data/voTracks';
import { classHasSchoolYear } from '../data/schoolYears';

export const ALL_COHORTS: CohortFilter = { voTrack: 'all', year: 'all' };

export function getCohortStudentIds(students: Student[], classes: Class[], filter: CohortFilter): Set<string> {
    const classesById = new Map(classes.map((c) => [c.id, c]));
    const matches = (classId: string | undefined, student?: Student) => {
        const c = classId ? classesById.get(classId) : undefined;
        if (!c) return false;
        // A mixed class (several tracks or years) counts as matching any one of them, but a student
        // pinned to one of them belongs to that cohort only — the same rule search applies.
        if (filter.voTrack !== 'all') {
            const own = student?.voTrack;
            if (own ? own !== filter.voTrack : !classHasVoTrack(c, filter.voTrack)) return false;
        }
        if (filter.year !== 'all') {
            const own = student?.schoolYear;
            if (own ? own !== filter.year : !classHasSchoolYear(c, filter.year)) return false;
        }
        return true;
    };
    const ids = new Set<string>();
    for (const s of students) {
        // Only the current class sees the student's own tag: a past membership carries its class's
        // cohorts, and the override describes where the student sits today.
        if (matches(s.classId, s) || s.pastClassMemberships?.some((m) => matches(m.classId))) ids.add(s.id);
    }
    return ids;
}

export function isAllCohorts(filter: CohortFilter): boolean {
    return filter.voTrack === 'all' && filter.year === 'all';
}
