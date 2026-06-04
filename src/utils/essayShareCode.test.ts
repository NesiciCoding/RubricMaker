import { describe, it, expect } from 'vitest';
import { encodeEssayAssignment, decodeEssayAssignment } from './essayShareCode';
import type { EssayAssignment } from '../types';

const makeAssignment = (overrides: Partial<EssayAssignment> = {}): EssayAssignment => ({
    rubricId: 'r1',
    studentId: 's1',
    teacherKey: 'tk1',
    title: 'Descriptive Essay',
    prompt: 'Write about your favourite place.',
    minWords: 100,
    maxWords: 500,
    timeLimitMinutes: 60,
    requireSEB: false,
    readOnlyAfterSubmit: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
});

describe('encodeEssayAssignment', () => {
    it('returns a non-empty string', () => {
        const code = encodeEssayAssignment(makeAssignment());
        expect(typeof code).toBe('string');
        expect(code.length).toBeGreaterThan(0);
    });

    it('returns empty string on circular reference', () => {
        const a = makeAssignment() as any;
        a.circular = a;
        expect(encodeEssayAssignment(a)).toBe('');
    });
});

describe('decodeEssayAssignment', () => {
    it('round-trips a valid assignment', () => {
        const original = makeAssignment();
        const decoded = decodeEssayAssignment(encodeEssayAssignment(original));
        expect(decoded).not.toBeNull();
        expect(decoded!.rubricId).toBe('r1');
        expect(decoded!.studentId).toBe('s1');
        expect(decoded!.title).toBe('Descriptive Essay');
        expect(decoded!.maxWords).toBe(500);
    });

    it('preserves optional fields', () => {
        const original = makeAssignment({ requireSEB: true, timeLimitMinutes: 45 });
        const decoded = decodeEssayAssignment(encodeEssayAssignment(original));
        expect(decoded!.requireSEB).toBe(true);
        expect(decoded!.timeLimitMinutes).toBe(45);
    });

    it('returns null for empty string', () => {
        expect(decodeEssayAssignment('')).toBeNull();
    });

    it('returns null for invalid base64', () => {
        expect(decodeEssayAssignment('!!!not-base64!!!')).toBeNull();
    });

    it('returns null when rubricId is missing', () => {
        const partial = { studentId: 's1', title: 'Test' };
        const code = btoa(encodeURIComponent(JSON.stringify(partial)));
        expect(decodeEssayAssignment(code)).toBeNull();
    });

    it('returns null when studentId is missing', () => {
        const partial = { rubricId: 'r1', title: 'Test' };
        const code = btoa(encodeURIComponent(JSON.stringify(partial)));
        expect(decodeEssayAssignment(code)).toBeNull();
    });

    it('returns null when title is missing', () => {
        const partial = { rubricId: 'r1', studentId: 's1' };
        const code = btoa(encodeURIComponent(JSON.stringify(partial)));
        expect(decodeEssayAssignment(code)).toBeNull();
    });

    it('trims whitespace from input', () => {
        const original = makeAssignment();
        const padded = '  ' + encodeEssayAssignment(original) + '\n';
        expect(decodeEssayAssignment(padded)).not.toBeNull();
    });
});

describe('ownerUserId is never encoded into the URL', () => {
    it('does not include ownerUserId in the encoded string (legacy / offline mode)', () => {
        // No supabaseUrl → full base64 JSON path. ownerUserId must be stripped.
        const a = makeAssignment();
        (a as any).ownerUserId = 'secret-uid-1234';
        const code = encodeEssayAssignment(a);
        const decoded = JSON.parse(decodeURIComponent(atob(code)));
        expect(decoded.ownerUserId).toBeUndefined();
    });

    it('returns bare teacherKey when supabaseUrl is set (short-code mode)', () => {
        // With supabaseUrl the code is just the raw teacherKey — no JSON, no secrets.
        const a = makeAssignment({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon-key' } as any);
        (a as any).ownerUserId = 'secret-uid-1234';
        const code = encodeEssayAssignment(a);
        expect(code).toBe(a.teacherKey);
        expect(code).not.toContain('ownerUserId');
        expect(code).not.toContain('secret-uid-1234');
        expect(code).not.toContain('supabaseAnonKey');
        expect(code).not.toContain('prompt');
    });
});
