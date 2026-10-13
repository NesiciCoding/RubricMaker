import { describe, expect, it } from 'vitest';
import { canOpenAdmin, resolveUserRole } from './userRole';

describe('resolveUserRole', () => {
    it('keeps valid roles and maps the legacy user role to teacher', () => {
        expect(resolveUserRole('admin')).toBe('admin');
        expect(resolveUserRole('teacher')).toBe('teacher');
        expect(resolveUserRole('student')).toBe('student');
        expect(resolveUserRole('user')).toBe('teacher');
    });

    it('treats an unset or unknown role as the local owner', () => {
        expect(resolveUserRole(undefined)).toBe('admin');
        expect(resolveUserRole('bogus')).toBe('admin');
    });
});

describe('canOpenAdmin', () => {
    it('lets a confirmed admin in everywhere and the unset local owner in local mode only', () => {
        expect(canOpenAdmin('admin', false)).toBe(true);
        expect(canOpenAdmin(undefined, true)).toBe(true);
        expect(canOpenAdmin(undefined, false)).toBe(false);
        expect(canOpenAdmin('bogus', false)).toBe(false);
        expect(canOpenAdmin('teacher', true)).toBe(false);
    });
});
