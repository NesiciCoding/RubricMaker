import { describe, expect, it } from 'vitest';
import {
    canManageClass,
    isClassOwner,
    isMyClass,
    resolveRosterFetch,
    resolveRosterScope,
    scopeRoster,
    type RosterScopeState,
} from './rosterScope';
import type { Class, Student, StudentRubric } from '../types';

const ME = 'teacher-me';
const OTHER = 'teacher-other';

const owned: Class = { id: 'c-owned', name: 'Mine', ownerId: ME };
const coTaught: Class = { id: 'c-shared', name: 'Shared', ownerId: OTHER };
const foreign: Class = { id: 'c-foreign', name: 'Theirs', ownerId: OTHER };
const legacy: Class = { id: 'c-legacy', name: 'Cached before ownership' };

const students: Student[] = [
    { id: 's1', name: 'A', classId: 'c-owned', ownerId: ME },
    { id: 's2', name: 'B', classId: 'c-shared', ownerId: OTHER },
    { id: 's3', name: 'C', classId: 'c-foreign', ownerId: OTHER },
];

const studentRubrics: StudentRubric[] = [
    { id: 'sr1', rubricId: 'r1', studentId: 's1', entries: [], overallComment: '', isPeerReview: false },
    { id: 'sr2', rubricId: 'r1', studentId: 's3', entries: [], overallComment: '', isPeerReview: false },
];

const adminMine: RosterScopeState = { userId: ME, roles: { 'c-shared': 'editor' }, isAdmin: true, scope: 'mine' };

describe('isMyClass', () => {
    it('counts owned, co-taught and ownership-less classes as mine', () => {
        expect(isMyClass(owned, ME, {})).toBe(true);
        expect(isMyClass(coTaught, ME, { 'c-shared': 'viewer' })).toBe(true);
        expect(isMyClass(legacy, ME, {})).toBe(true);
    });

    it('excludes a colleague class I neither own nor co-teach', () => {
        expect(isMyClass(foreign, ME, { 'c-shared': 'editor' })).toBe(false);
    });

    it('never hides classes while the co-teacher list is unknown', () => {
        expect(isMyClass(foreign, ME, null)).toBe(true);
    });

    it('treats an unset user (local profile) as owning everything', () => {
        expect(isMyClass(foreign, undefined, {})).toBe(true);
    });
});

describe('resolveRosterScope', () => {
    it('honours an explicit preference', () => {
        expect(resolveRosterScope({ rosterScope: 'school' }, [owned, foreign], ME, {})).toBe('school');
        expect(resolveRosterScope({ rosterScope: 'mine' }, [owned, foreign], ME, {})).toBe('mine');
    });

    it('defaults to my classes when the admin teaches at least one', () => {
        expect(resolveRosterScope({}, [owned, foreign], ME, {})).toBe('mine');
    });

    it('defaults to the school view for an admin who owns no class', () => {
        expect(resolveRosterScope({}, [foreign], ME, {})).toBe('school');
    });
});

describe('scopeRoster', () => {
    it('keeps only my classes, their students and their grades in mine scope', () => {
        const scoped = scopeRoster({ classes: [owned, coTaught, foreign], students, studentRubrics }, adminMine);
        expect(scoped.classes.map((c) => c.id)).toEqual(['c-owned', 'c-shared']);
        expect(scoped.students.map((s) => s.id)).toEqual(['s1', 's2']);
        expect(scoped.studentRubrics.map((sr) => sr.id)).toEqual(['sr1']);
    });

    it('returns everything in school scope', () => {
        const input = { classes: [owned, foreign], students, studentRubrics };
        expect(scopeRoster(input, { ...adminMine, scope: 'school' })).toBe(input);
    });

    it('is a no-op for teachers, whose access is already limited server-side', () => {
        const input = { classes: [owned, foreign], students, studentRubrics };
        expect(scopeRoster(input, { ...adminMine, isAdmin: false })).toBe(input);
    });

    it("hides nothing in local mode, where every class is the only user's own", () => {
        const input = { classes: [owned, foreign], students, studentRubrics };
        const scoped = scopeRoster(input, { ...adminMine, userId: undefined });
        expect(scoped.classes.map((c) => c.id)).toEqual(['c-owned', 'c-foreign']);
        expect(scoped.students.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    });
});

describe('canManageClass', () => {
    it('lets an owner manage their own class', () => {
        expect(canManageClass(owned, adminMine)).toBe(true);
    });

    it('blocks a class the admin does not own while they are in my-classes scope', () => {
        expect(canManageClass(coTaught, adminMine)).toBe(false);
        expect(canManageClass(foreign, adminMine)).toBe(false);
    });

    it('allows an admin to intervene on any class in school scope', () => {
        expect(canManageClass(coTaught, { ...adminMine, scope: 'school' })).toBe(true);
        expect(canManageClass(foreign, { ...adminMine, scope: 'school' })).toBe(true);
    });

    it('never grants a non-owner teacher the school-scope override', () => {
        expect(canManageClass(foreign, { ...adminMine, scope: 'school', isAdmin: false })).toBe(false);
    });
});

describe('resolveRosterFetch', () => {
    it('narrows an admin on my classes, including the unset default', () => {
        expect(resolveRosterFetch('admin', undefined)).toBe('mine');
        expect(resolveRosterFetch('admin', 'mine')).toBe('mine');
    });

    it('pulls the school for an admin who asked for it', () => {
        expect(resolveRosterFetch('admin', 'school')).toBe('all');
    });

    it('never narrows a teacher — RLS already limits them', () => {
        expect(resolveRosterFetch('teacher', undefined)).toBe('all');
        expect(resolveRosterFetch('teacher', 'mine')).toBe('all');
    });

    it('treats an unknown role as unconfirmed and pulls everything', () => {
        expect(resolveRosterFetch(undefined, 'mine')).toBe('all');
        expect(resolveRosterFetch('student', 'mine')).toBe('all');
    });
});

describe('isClassOwner', () => {
    it('treats cached rows without ownership as owned', () => {
        expect(isClassOwner(legacy, ME)).toBe(true);
        expect(isClassOwner(foreign, ME)).toBe(false);
    });
});
