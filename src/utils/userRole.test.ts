import { describe, expect, it } from 'vitest';
import { resolveUserRole } from './userRole';

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
