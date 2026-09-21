import { describe, it, expect } from 'vitest';
import { nanoid, loginCode } from './nanoid';

describe('loginCode', () => {
    it('never emits look-alike characters (I, O, l, 0, 1)', () => {
        const codes = Array.from({ length: 200 }, () => loginCode());
        for (const code of codes) {
            expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/);
        }
    });

    it('respects the requested size', () => {
        expect(loginCode(8)).toHaveLength(8);
    });
});

describe('nanoid', () => {
    it('produces an id of the requested length', () => {
        expect(nanoid(12)).toHaveLength(12);
    });
});
