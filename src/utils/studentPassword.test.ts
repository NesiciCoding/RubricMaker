import { describe, it, expect } from 'vitest';
import { generateStudentPassword } from './studentPassword';

describe('generateStudentPassword', () => {
    it('generates a password of the default length', () => {
        expect(generateStudentPassword()).toHaveLength(10);
    });

    it('generates a password of a requested length', () => {
        expect(generateStudentPassword(6)).toHaveLength(6);
        expect(generateStudentPassword(16)).toHaveLength(16);
    });

    it('excludes visually ambiguous characters (0, O, 1, l, I)', () => {
        const password = generateStudentPassword(500);
        expect(password).not.toMatch(/[0O1lI]/);
    });

    it('generates different passwords across calls', () => {
        const a = generateStudentPassword();
        const b = generateStudentPassword();
        expect(a).not.toBe(b);
    });
});
