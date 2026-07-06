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

    describe('compound student+rubric grade shortcut', () => {
        it('promotes a combined grade result to the top when both names co-occur, without suppressing the originals', () => {
            const results = searchAll('José García Persuasive Essay', makeData({ students: [student], rubrics: [rubric], classes: [cls] }));
            expect(results[0]).toEqual({
                type: 'grade',
                id: 's1:r1',
                label: 'José García — Persuasive Essay',
                sublabel: '5A',
                route: '/rubrics/r1/grade/s1',
            });
            expect(results.some((r) => r.type === 'student' && r.id === 's1')).toBe(true);
            expect(results.some((r) => r.type === 'rubric' && r.id === 'r1')).toBe(true);
        });

        it('does not synthesize a grade result when only one name is present', () => {
            const results = searchAll('José García', makeData({ students: [student], rubrics: [rubric] }));
            expect(results.some((r) => r.type === 'grade')).toBe(false);
        });

        it('ignores names shorter than 3 characters to avoid initials-based noise', () => {
            const shortNameStudent: Student = { id: 's5', name: 'Jo', classId: 'c1' };
            const results = searchAll('Jo Persuasive Essay', makeData({ students: [shortNameStudent], rubrics: [rubric] }));
            expect(results.some((r) => r.type === 'grade')).toBe(false);
        });

        it('suppresses the grade shortcut under an unrelated type: filter', () => {
            const results = searchAll(
                'type:essay José García Persuasive Essay',
                makeData({ students: [student], rubrics: [rubric] })
            );
            expect(results.some((r) => r.type === 'grade')).toBe(false);
        });

        it('keeps the grade shortcut under type:student and type:rubric filters', () => {
            const asStudent = searchAll(
                'type:student José García Persuasive Essay',
                makeData({ students: [student], rubrics: [rubric] })
            );
            const asRubric = searchAll(
                'type:rubric José García Persuasive Essay',
                makeData({ students: [student], rubrics: [rubric] })
            );
            expect(asStudent.some((r) => r.type === 'grade')).toBe(true);
            expect(asRubric.some((r) => r.type === 'grade')).toBe(true);
        });
    });

    describe('year:/track: filter tokens and metadata free text', () => {
        const havoClass: Class = { id: 'ch', name: 'HAVO 4A', year: 'jaar-4', voTrack: 'havo' };
        const vwoClass: Class = { id: 'cv', name: 'VWO 3B', voTrack: 'vwo' };
        const havoStudent: Student = { id: 'sh', name: 'Emma', classId: 'ch' };
        const vwoStudent: Student = { id: 'sv', name: 'Liam', classId: 'cv' };

        it('filters students by track:', () => {
            const results = searchAll(
                'type:student track:havo',
                makeData({ students: [havoStudent, vwoStudent], classes: [havoClass, vwoClass] })
            );
            expect(results.map((r) => r.id)).toEqual(['sh']);
        });

        it('filters students by year:', () => {
            const results = searchAll(
                'type:student year:jaar-4',
                makeData({ students: [havoStudent, vwoStudent], classes: [havoClass, vwoClass] })
            );
            expect(results.map((r) => r.id)).toEqual(['sh']);
        });

        it('matches a class by its track label as free text, without a track: prefix', () => {
            const results = searchAll('havo', makeData({ classes: [havoClass, vwoClass] }));
            expect(results.map((r) => r.id)).toEqual(['ch']);
        });

        it("a student's own voTrack override wins over the class default for track: filtering", () => {
            const overriddenStudent: Student = { ...havoStudent, id: 'so', voTrack: 'vwo' };
            const results = searchAll(
                'track:vwo',
                makeData({ students: [overriddenStudent], classes: [havoClass] })
            );
            expect(results.map((r) => r.id)).toEqual(['so']);
        });

        it('matches a rubric by cefrTargetLevel as free text', () => {
            const b1Rubric: Rubric = { ...rubric, id: 'r2', cefrTargetLevel: 'B1' };
            const results = searchAll('b1', makeData({ rubrics: [rubric, b1Rubric] }));
            expect(results.map((r) => r.id)).toEqual(['r2']);
        });
    });
});
