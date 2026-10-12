import { describe, expect, it } from 'vitest';
import { findDuplicateStudent, isValidEmail, studentExportRows } from './studentValidation';
import type { Class, Student } from '../types';

describe('isValidEmail (#668)', () => {
    it('accepts ordinary addresses and surrounding spaces', () => {
        expect(isValidEmail('anna@school.nl')).toBe(true);
        expect(isValidEmail(' j.de-vries+test@leerling.school.nl ')).toBe(true);
    });

    it('rejects addresses without an @, a domain dot, or with spaces', () => {
        expect(isValidEmail('not-an-email')).toBe(false);
        expect(isValidEmail('anna@school')).toBe(false);
        expect(isValidEmail('anna@@school.nl')).toBe(false);
        expect(isValidEmail('an na@school.nl')).toBe(false);
        expect(isValidEmail('anna@school.')).toBe(false);
    });
});

const students: Student[] = [
    { id: 's1', name: 'Anna Z', classId: 'c1', email: 'a@x.nl', studentNumber: '1001' },
    { id: 's2', name: 'Bo', classId: 'c2' },
];

describe('findDuplicateStudent (#668)', () => {
    it('finds a same-named student in the same class, ignoring case and spaces', () => {
        expect(findDuplicateStudent(students, '  anna z ', 'c1')?.id).toBe('s1');
    });

    it('ignores other classes, the student being edited, and blank names', () => {
        expect(findDuplicateStudent(students, 'Anna Z', 'c2')).toBeUndefined();
        expect(findDuplicateStudent(students, 'Anna Z', 'c1', 's1')).toBeUndefined();
        expect(findDuplicateStudent(students, '  ', 'c1')).toBeUndefined();
    });
});

describe('studentExportRows (#668)', () => {
    it('includes the class name and student number', () => {
        const classes: Class[] = [{ id: 'c1', name: '3A' }];
        expect(studentExportRows(students, classes)).toEqual([
            { name: 'Anna Z', email: 'a@x.nl', class: '3A', student_number: '1001' },
            { name: 'Bo', email: '', class: '', student_number: '' },
        ]);
    });
});
