import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin, isHashed } from '../pinHash';
import { nanoid } from '../nanoid';

describe('hashPin', () => {
    it('returns a string prefixed with rm-pin-v1:', async () => {
        const hash = await hashPin('1234');
        expect(hash.startsWith('rm-pin-v1:')).toBe(true);
    });

    it('returns a non-trivially-short string', async () => {
        const hash = await hashPin('1234');
        expect(hash.length).toBeGreaterThan(20);
    });

    it('produces the same hash for the same input', async () => {
        const a = await hashPin('1234');
        const b = await hashPin('1234');
        expect(a).toBe(b);
    });

    it('produces different hashes for different inputs', async () => {
        const a = await hashPin('1234');
        const b = await hashPin('5678');
        expect(a).not.toBe(b);
    });
});

describe('isHashed', () => {
    it('returns true for a value produced by hashPin', async () => {
        const hash = await hashPin('abc');
        expect(isHashed(hash)).toBe(true);
    });

    it('returns false for a plaintext value', () => {
        expect(isHashed('1234')).toBe(false);
    });

    it('returns false for an empty string', () => {
        expect(isHashed('')).toBe(false);
    });
});

describe('verifyPin', () => {
    it('resolves true when pin matches the stored hash', async () => {
        const hash = await hashPin('secret');
        expect(await verifyPin('secret', hash)).toBe(true);
    });

    it('resolves false when pin does not match the stored hash', async () => {
        const hash = await hashPin('secret');
        expect(await verifyPin('wrong', hash)).toBe(false);
    });

    it('falls back to plaintext comparison for legacy unhashed values', async () => {
        expect(await verifyPin('plain', 'plain')).toBe(true);
        expect(await verifyPin('wrong', 'plain')).toBe(false);
    });
});

describe('nanoid', () => {
    it('returns a non-empty string', () => {
        expect(nanoid()).toBeTruthy();
    });

    it('returns a string of the requested length', () => {
        expect(nanoid(8)).toHaveLength(8);
        expect(nanoid(20)).toHaveLength(20);
    });

    it('uses default length of 12', () => {
        expect(nanoid()).toHaveLength(12);
    });

    it('returns different values on successive calls', () => {
        const a = nanoid();
        const b = nanoid();
        expect(a).not.toBe(b);
    });

    it('only contains alphanumeric characters', () => {
        const id = nanoid(100);
        expect(/^[A-Za-z0-9]+$/.test(id)).toBe(true);
    });
});
