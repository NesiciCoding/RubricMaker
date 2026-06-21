import { describe, it, expect } from 'vitest';
import { matchCsvRows, summarizeImport } from './csvImportMatch';
import type { Class, Student } from '../types';

const mapping = { fullName: 'Name', firstName: '', lastName: '', email: 'Email', className: 'Class' };

const classes: Class[] = [
    { id: 'c1', name: '8A' },
    { id: 'c2', name: '9A' },
];

const students: Student[] = [{ id: 's1', name: 'Alice', email: 'alice@x.com', classId: 'c1' }];

describe('matchCsvRows + summarizeImport', () => {
    it('detects a new student to create', () => {
        const rows = matchCsvRows([{ Name: 'Bob', Email: 'bob@x.com', Class: '8A' }], mapping, classes, students, 'c1');
        expect(rows).toHaveLength(1);
        expect(rows[0].matchedStudent).toBeNull();
        expect(summarizeImport(rows, students, false)).toEqual({ created: 1, updated: 0, transferred: 0, removed: 0 });
    });

    it('detects an update when name+class match', () => {
        const rows = matchCsvRows([{ Name: 'Alice', Email: '', Class: '8A' }], mapping, classes, students, 'c1');
        expect(rows[0].matchedStudent?.id).toBe('s1');
        expect(summarizeImport(rows, students, false)).toEqual({ created: 0, updated: 1, transferred: 0, removed: 0 });
    });

    it('detects a transfer when email matches but class differs', () => {
        const rows = matchCsvRows(
            [{ Name: 'Alice', Email: 'alice@x.com', Class: '9A' }],
            mapping,
            classes,
            students,
            'c1'
        );
        expect(rows[0].matchedStudent?.id).toBe('s1');
        expect(rows[0].existingClassId).toBe('c2');
        expect(summarizeImport(rows, students, false)).toEqual({ created: 0, updated: 0, transferred: 1, removed: 0 });
    });

    it('treats a move to a brand-new class as a transfer', () => {
        const rows = matchCsvRows(
            [{ Name: 'Alice', Email: 'alice@x.com', Class: '10A' }],
            mapping,
            classes,
            students,
            'c1'
        );
        expect(rows[0].newClassName).toBe('10A');
        expect(summarizeImport(rows, students, false)).toEqual({ created: 0, updated: 0, transferred: 1, removed: 0 });
    });

    it('counts unmatched students in touched classes as removed when syncMode is on', () => {
        const rows = matchCsvRows([{ Name: 'New Kid', Email: '', Class: '8A' }], mapping, classes, students, 'c1');
        expect(summarizeImport(rows, students, true)).toEqual({ created: 1, updated: 0, transferred: 0, removed: 1 });
    });

    it('deduplicates rows with the same email', () => {
        const rows = matchCsvRows(
            [
                { Name: 'Bob', Email: 'bob@x.com', Class: '8A' },
                { Name: 'Bob', Email: 'bob@x.com', Class: '8A' },
            ],
            mapping,
            classes,
            students,
            'c1'
        );
        expect(rows).toHaveLength(1);
    });
});
