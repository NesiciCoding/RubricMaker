import type { Class, Student } from '../types';

/**
 * The roster a rubric-grade surface should list: students in the classes that link the rubric.
 * A class that links no rubrics grades with the teacher's whole library (the same rule the
 * students page's grade menu uses), so its students stay in the roster; a class that links a
 * specific set without this rubric is left out.
 */
export function studentsForRubric(rubricId: string, students: Student[], classes: Class[]): Student[] {
    const classById = new Map(classes.map((c) => [c.id, c]));
    const candidates = students.filter((s) => {
        const cls = s.classId ? classById.get(s.classId) : undefined;
        if (!cls) return true;
        const linked = cls.rubricIds ?? [];
        return linked.length === 0 || linked.includes(rubricId);
    });
    return [...candidates].sort((a, b) => a.name.localeCompare(b.name));
}
