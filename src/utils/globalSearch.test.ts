import { describe, expect, it } from 'vitest';
import { searchAll, type SearchableData } from './globalSearch';
import type { Class, EssayAssignment, Rubric, Student, Test } from '../types';

function makeData(overrides: Partial<SearchableData> = {}): SearchableData {
    return {
        rubrics: [],
        tests: [],
        students: [],
        classes: [],
        essayAssignments: [],
        ...overrides,
    };
}

const rubric: Rubric = {
    id: 'r1',
    name: 'Persuasive Essay',
    subject: 'English',
    description: '',
    criteria: [],
    gradeScaleId: 'gs1',
    format: {} as Rubric['format'],
    attachmentIds: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
};

const cls: Class = { id: 'c1', name: '5A' };

const student: Student = { id: 's1', name: 'José García', classId: 'c1' };

const test: Test = {
    id: 't1',
    name: 'Grammar Quiz',
    questions: [],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01',
};

const essay: EssayAssignment = {
    rubricId: 'r1',
    studentId: 's1',
    teacherKey: 'tk1',
    title: 'My Summer',
    readOnlyAfterSubmit: false,
    createdAt: '2026-01-01',
};

describe('searchAll', () => {
    it('returns no results for an empty query', () => {
        expect(searchAll('', makeData({ rubrics: [rubric] }))).toEqual([]);
    });

    it('matches by substring across entity types', () => {
        const results = searchAll('persuas', makeData({ rubrics: [rubric] }));
        expect(results).toEqual([
            { type: 'rubric', id: 'r1', label: 'Persuasive Essay', sublabel: 'English', route: '/rubrics/r1' },
        ]);
    });

    it('is diacritic-insensitive', () => {
        const results = searchAll('jose', makeData({ students: [student], classes: [cls] }));
        expect(results.map((r) => r.id)).toEqual(['s1']);
    });

    it('filters by type: token', () => {
        const data = makeData({ rubrics: [rubric], tests: [test] });
        const results = searchAll('type:test', data);
        expect(results.map((r) => r.type)).toEqual(['test']);
    });

    it('filters by class: token, scoped to that class only', () => {
        const otherClass: Class = { id: 'c2', name: '5B' };
        const otherStudent: Student = { id: 's2', name: 'José García', classId: 'c2' };
        const results = searchAll(
            'class:5A jose',
            makeData({ students: [student, otherStudent], classes: [cls, otherClass] })
        );
        expect(results.map((r) => r.id)).toEqual(['s1']);
    });

    it('supports a quoted class: value for multi-word class names, with free text still applied', () => {
        const multiWordClass: Class = { id: 'c3', name: 'English 1' };
        const otherClass: Class = { id: 'c4', name: 'Math 1' };
        const inClass: Student = { id: 's3', name: 'Alice', classId: 'c3' };
        const inOtherClass: Student = { id: 's4', name: 'Alice', classId: 'c4' };
        const results = searchAll(
            'class:"English 1" alice',
            makeData({ students: [inClass, inOtherClass], classes: [multiWordClass, otherClass] })
        );
        expect(results.map((r) => r.id)).toEqual(['s3']);
    });

    it('groups essay assignments by teacherKey and routes to the group', () => {
        const dup: EssayAssignment = { ...essay, studentId: 's2' };
        const results = searchAll('summer', makeData({ essayAssignments: [essay, dup] }));
        expect(results).toEqual([{ type: 'essay', id: 'tk1', label: 'My Summer', route: '/essays/tk1' }]);
    });
});
