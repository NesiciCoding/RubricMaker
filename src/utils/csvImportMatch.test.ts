import { describe, it, expect } from 'vitest';
import { autoMapCsvHeaders, extractCsvName, matchCsvRows, planCsvImport, summarizeImport } from './csvImportMatch';
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

describe('planCsvImport (#653)', () => {
    it('reports every skipped row with its reason and the row it repeats', () => {
        const { rows, skipped } = planCsvImport(
            [
                { Name: 'Bob', Email: '', Class: '8A' },
                { Name: 'bob', Email: '', Class: '8A' },
                { Name: '', Email: 'x@x.com', Class: '8A' },
                { Name: 'Bob', Email: '', Class: '9A' },
            ],
            mapping,
            classes,
            [],
            'c1'
        );
        expect(rows.map((r) => r.existingClassId)).toEqual(['c1', 'c2']);
        expect(skipped).toEqual([
            { row: 3, name: 'bob', email: '', reason: 'duplicate', duplicateOf: 2 },
            { row: 4, name: '', email: 'x@x.com', reason: 'no_name' },
        ]);
    });

    it('skips rows with no class to land in', () => {
        const { rows, skipped } = planCsvImport([{ Name: 'Bob', Email: '', Class: '' }], mapping, [], [], '');
        expect(rows).toEqual([]);
        expect(skipped).toEqual([{ row: 2, name: 'Bob', email: '', reason: 'no_class' }]);
    });

    it('keeps siblings who share a guardian email as separate students', () => {
        const existing: Student[] = [{ id: 's1', name: 'Sam', email: 'parent@x.nl', classId: 'c1' }];
        const { rows, skipped } = planCsvImport(
            [
                { Name: 'Sam', Email: 'parent@x.nl', Class: '8A' },
                { Name: 'Tess', Email: 'parent@x.nl', Class: '8A' },
            ],
            mapping,
            classes,
            existing,
            'c1'
        );
        expect(skipped).toEqual([]);
        expect(rows.map((r) => [r.name, r.matchedStudent?.id ?? null])).toEqual([
            ['Sam', 's1'],
            ['Tess', null],
        ]);
    });

    it('does not move or rename an existing sibling when only the other one is listed', () => {
        const existing: Student[] = [{ id: 's1', name: 'Sam', email: 'parent@x.nl', classId: 'c1' }];
        const rows = matchCsvRows(
            [{ Name: 'Tess', Email: 'parent@x.nl', Class: '9A' }],
            mapping,
            classes,
            existing,
            'c1'
        );
        expect(rows[0].matchedStudent).toBeNull();
        expect(summarizeImport(rows, existing, false)).toEqual({ created: 1, updated: 0, transferred: 0, removed: 0 });
    });
});

describe('autoMapCsvHeaders (#682)', () => {
    it('maps First name + Last name to first/last, not to the full-name column', () => {
        expect(autoMapCsvHeaders(['First name', 'Last name', 'Email', 'Class'])).toEqual({
            fullName: '',
            firstName: 'First name',
            lastName: 'Last name',
            email: 'Email',
            className: 'Class',
        });
    });

    it('handles reversed order, underscores and surname/given-name variants', () => {
        expect(autoMapCsvHeaders(['Last name', 'First name'])).toMatchObject({
            firstName: 'First name',
            lastName: 'Last name',
            fullName: '',
        });
        expect(autoMapCsvHeaders(['given_name', 'surname'])).toMatchObject({
            firstName: 'given_name',
            lastName: 'surname',
        });
        expect(autoMapCsvHeaders(['Roepnaam', 'Achternaam', 'Klas'])).toMatchObject({
            firstName: 'Roepnaam',
            lastName: 'Achternaam',
            className: 'Klas',
        });
    });

    it('never treats Username as the student name', () => {
        expect(autoMapCsvHeaders(['Username', 'First name', 'Last name'])).toMatchObject({
            fullName: '',
            firstName: 'First name',
            lastName: 'Last name',
        });
        expect(autoMapCsvHeaders(['Username', 'Email']).fullName).toBe('');
    });

    it('maps a single full-name column such as Name or Student name', () => {
        expect(autoMapCsvHeaders(['Name', 'E-mail']).fullName).toBe('Name');
        expect(autoMapCsvHeaders(['Student name', 'Group'])).toMatchObject({
            fullName: 'Student name',
            className: 'Group',
        });
        expect(autoMapCsvHeaders(['Full Name']).fullName).toBe('Full Name');
    });

    it('prefers first + last over a full-name column when both exist', () => {
        expect(autoMapCsvHeaders(['Name', 'First name', 'Last name'])).toMatchObject({
            fullName: '',
            firstName: 'First name',
            lastName: 'Last name',
        });
    });

    it('ignores parent and guardian columns when picking the student name and email', () => {
        expect(autoMapCsvHeaders(['Student name', 'Parent first name', 'Parent last name', 'Guardian email'])).toEqual({
            fullName: 'Student name',
            firstName: '',
            lastName: '',
            email: '',
            className: '',
        });
        expect(autoMapCsvHeaders(['Ouder voornaam', 'Leerling'])).toMatchObject({
            fullName: 'Leerling',
            firstName: '',
        });
    });

    it('falls back to the full-name column for rows missing a first or last name', () => {
        const headers = ['Name', 'First name', 'Last name'];
        const mapping = autoMapCsvHeaders(headers);
        expect(mapping.fullNameFallback).toBe('Name');
        expect(extractCsvName({ Name: 'Anna Jansen', 'First name': 'Anna', 'Last name': '' }, mapping)).toBe(
            'Anna Jansen'
        );
        expect(extractCsvName({ Name: 'A. Jansen', 'First name': 'Anna', 'Last name': 'Jansen' }, mapping)).toBe(
            'Anna Jansen'
        );
        expect(extractCsvName({ Name: '', 'First name': 'Anna', 'Last name': '' }, mapping)).toBe('Anna');
        const rows = matchCsvRows(
            [{ Name: 'Anna Jansen', 'First name': 'Anna', 'Last name': '' }],
            mapping,
            [],
            [],
            'class-1'
        );
        expect(rows[0].name).toBe('Anna Jansen');
    });

    it('imports First name + Last name rows as full names end to end', () => {
        const mapping = autoMapCsvHeaders(['First name', 'Last name', 'Email', 'Class']);
        const rows = matchCsvRows(
            [{ 'First name': 'Anna', 'Last name': 'Jansen', Email: 'a@x.nl', Class: 'HAVO 4A' }],
            mapping,
            [],
            [],
            ''
        );
        expect(rows[0].name).toBe('Anna Jansen');
    });
});

describe('student numbers on import (#668)', () => {
    it('maps the exported student_number column and the Magister Leerlingnummer column', () => {
        expect(autoMapCsvHeaders(['name', 'email', 'class', 'student_number']).studentNumber).toBe('student_number');
        expect(autoMapCsvHeaders(['Naam', 'Leerlingnummer']).studentNumber).toBe('Leerlingnummer');
        expect(autoMapCsvHeaders(['Name', 'Email'])).not.toHaveProperty('studentNumber');
    });

    it('carries the student number onto the planned row', () => {
        const { rows } = planCsvImport(
            [{ Name: 'Bob', Email: '', Class: '8A', Nr: ' 1234 ' }],
            { ...mapping, studentNumber: 'Nr' },
            classes,
            [],
            ''
        );
        expect(rows[0].studentNumber).toBe('1234');
    });
});
