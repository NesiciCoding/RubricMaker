import type { Class, Student } from '../types';

// Deliberately loose: one @, no spaces, and a dot in the domain. Catches typos without rejecting unusual valid addresses.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@.]+$/;

export function isValidEmail(email: string): boolean {
    return EMAIL_PATTERN.test(email.trim());
}

export function findDuplicateStudent(
    students: Student[],
    name: string,
    classId: string,
    excludeId?: string
): Student | undefined {
    const key = name.trim().toLowerCase();
    if (!key) return undefined;
    return students.find((s) => s.id !== excludeId && s.classId === classId && s.name.trim().toLowerCase() === key);
}

/** Rows for the students CSV export, with columns the CSV importer maps back automatically. */
export function studentExportRows(
    students: Student[],
    classes: Class[]
): { name: string; email: string; class: string; student_number: string }[] {
    const classNames = new Map(classes.map((c) => [c.id, c.name]));
    return students.map((s) => ({
        name: s.name,
        email: s.email ?? '',
        class: classNames.get(s.classId) ?? '',
        student_number: s.studentNumber ?? '',
    }));
}
