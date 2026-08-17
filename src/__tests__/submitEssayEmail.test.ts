import { describe, expect, it } from 'vitest';
import { resolveStudentEmail } from '../../supabase/functions/submit-essay/email';

describe('submit-essay email resolution', () => {
    it('falls back to the client email when the auth record has an EMPTY-STRING email (anonymous session regression)', () => {
        // GoTrue anonymous sessions carry an empty-string email claim, not null.
        // `authEmail ?? bodyEmail` would let the empty string win and the function
        // would reject every anonymous submission as missing studentEmail.
        const result = resolveStudentEmail('', 'student@school.nl');
        expect(result).toEqual({ email: 'student@school.nl', mismatch: false });
    });

    it('uses the auth email when present and matching', () => {
        expect(resolveStudentEmail('student@school.nl', 'student@school.nl')).toEqual({
            email: 'student@school.nl',
            mismatch: false,
        });
    });

    it('treats emails case-insensitively', () => {
        expect(resolveStudentEmail('Student@School.NL', 'student@school.nl')).toEqual({
            email: 'Student@School.NL',
            mismatch: false,
        });
    });

    it('flags a mismatch when the auth and client emails differ (403 path)', () => {
        const result = resolveStudentEmail('student@school.nl', 'other@school.nl');
        expect(result.email).toBe('student@school.nl');
        expect(result.mismatch).toBe(true);
    });

    it('uses the auth email when the client sends none', () => {
        expect(resolveStudentEmail('student@school.nl', undefined)).toEqual({
            email: 'student@school.nl',
            mismatch: false,
        });
    });

    it('uses the client email when there is no auth email at all', () => {
        expect(resolveStudentEmail(undefined, 'student@school.nl')).toEqual({
            email: 'student@school.nl',
            mismatch: false,
        });
    });

    it('resolves to null when neither source has an email', () => {
        expect(resolveStudentEmail(undefined, undefined)).toEqual({ email: null, mismatch: false });
        expect(resolveStudentEmail('', null)).toEqual({ email: null, mismatch: false });
    });
});
