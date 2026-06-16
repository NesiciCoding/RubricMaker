import { describe, it, expect } from 'vitest';
import { encodeTestAssignment, decodeTestAssignment } from './shareCode';
import type { TestAssignmentPayload } from '../types';

const makeAssignment = (overrides: Partial<TestAssignmentPayload> = {}): TestAssignmentPayload => ({
    testId: 't1',
    studentId: 's1',
    teacherKey: 'tk1',
    requireSEB: false,
    durationMinutes: 45,
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
});

describe('encodeTestAssignment', () => {
    it('returns a non-empty base64 code in offline mode', () => {
        const code = encodeTestAssignment(makeAssignment());
        expect(typeof code).toBe('string');
        expect(code.length).toBeGreaterThan(0);
        expect(code).not.toBe('tk1');
    });

    it('returns just the teacherKey in DB mode', () => {
        const code = encodeTestAssignment(
            makeAssignment({ supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon' })
        );
        expect(code).toBe('tk1');
    });

    it('returns empty string on circular reference', () => {
        const a = makeAssignment() as TestAssignmentPayload & { circular?: unknown };
        a.circular = a;
        expect(encodeTestAssignment(a)).toBe('');
    });
});

describe('decodeTestAssignment', () => {
    it('round-trips an offline assignment', () => {
        const assignment = makeAssignment();
        const decoded = decodeTestAssignment(encodeTestAssignment(assignment));
        expect(decoded).toEqual(assignment);
    });

    it('tolerates surrounding whitespace', () => {
        const code = `  ${encodeTestAssignment(makeAssignment())}  `;
        expect(decodeTestAssignment(code)).toEqual(makeAssignment());
    });

    it('returns null for garbage input', () => {
        expect(decodeTestAssignment('not-a-code')).toBeNull();
        expect(decodeTestAssignment('')).toBeNull();
    });

    it('returns null when required fields are missing', () => {
        const missingTestId = btoa(encodeURIComponent(JSON.stringify({ studentId: 's1', teacherKey: 'tk1' })));
        expect(decodeTestAssignment(missingTestId)).toBeNull();
        const missingStudent = btoa(encodeURIComponent(JSON.stringify({ testId: 't1', teacherKey: 'tk1' })));
        expect(decodeTestAssignment(missingStudent)).toBeNull();
        const missingTeacherKey = btoa(encodeURIComponent(JSON.stringify({ testId: 't1', studentId: 's1' })));
        expect(decodeTestAssignment(missingTeacherKey)).toBeNull();
    });
});
