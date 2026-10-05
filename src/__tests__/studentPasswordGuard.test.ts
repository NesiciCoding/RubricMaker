import { describe, expect, it } from 'vitest';
import {
    authorizeCaller,
    authorizeTarget,
    escapeLikePattern,
    normalizeStudentEmail,
    validatePassword,
} from '../../supabase/functions/_shared/studentPasswordGuard';

describe('authorizeCaller', () => {
    it('allows teachers and admins', () => {
        expect(authorizeCaller({ isAnonymous: false, role: 'teacher' }).ok).toBe(true);
        expect(authorizeCaller({ isAnonymous: false, role: 'admin' }).ok).toBe(true);
    });

    it('denies anonymous sessions even when the profile says teacher', () => {
        expect(authorizeCaller({ isAnonymous: true, role: 'teacher' })).toMatchObject({ ok: false, status: 403 });
    });

    it('denies students and callers without a profile role', () => {
        expect(authorizeCaller({ isAnonymous: false, role: 'student' })).toMatchObject({ ok: false, status: 403 });
        expect(authorizeCaller({ isAnonymous: false, role: null })).toMatchObject({ ok: false, status: 403 });
    });
});

describe('authorizeTarget', () => {
    it('allows creating an account that does not exist yet', () => {
        expect(authorizeTarget('teacher-1', null).ok).toBe(true);
    });

    it('allows resetting an existing student account', () => {
        expect(authorizeTarget('teacher-1', { id: 'stu-1', role: 'student' }).ok).toBe(true);
    });

    it('never touches teacher, admin or the caller own account', () => {
        expect(authorizeTarget('teacher-1', { id: 'other', role: 'teacher' })).toMatchObject({
            ok: false,
            status: 403,
        });
        expect(authorizeTarget('teacher-1', { id: 'other', role: 'admin' })).toMatchObject({ ok: false, status: 403 });
        expect(authorizeTarget('stu-1', { id: 'stu-1', role: 'student' })).toMatchObject({ ok: false, status: 403 });
    });
});

describe('normalizeStudentEmail', () => {
    it('lower-cases and trims a normal address', () => {
        expect(normalizeStudentEmail('  Anna.De_Vries@School.NL ')).toBe('anna.de_vries@school.nl');
    });

    it('rejects wildcards, whitespace, malformed values and non-strings', () => {
        for (const bad of [
            '%@school.nl',
            'a%b@school.nl',
            'a b@school.nl',
            'no-at-sign',
            '@school.nl',
            'a@',
            '',
            42,
            null,
        ]) {
            expect(normalizeStudentEmail(bad)).toBeNull();
        }
    });
});

describe('escapeLikePattern', () => {
    it('escapes the characters that act as wildcards in ilike', () => {
        expect(escapeLikePattern('a_b%c\\d@x.nl')).toBe('a\\_b\\%c\\\\d@x.nl');
    });
});

describe('validatePassword', () => {
    it('requires a string of at least eight characters', () => {
        expect(validatePassword('12345678')).toBe(true);
        expect(validatePassword('1234567')).toBe(false);
        expect(validatePassword(undefined)).toBe(false);
    });
});
