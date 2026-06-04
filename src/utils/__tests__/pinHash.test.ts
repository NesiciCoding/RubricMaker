import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin, isHashed } from '../pinHash';
import { nanoid } from '../nanoid';

describe('hashPin', () => {
    it('returns a string prefixed with rm-pin-v2:', async () => {
        const hash = await hashPin('1234');
        expect(hash.startsWith('rm-pin-v2:')).toBe(true);
    });

    it('returns a non-trivially-short string', async () => {
        const hash = await hashPin('1234');
        expect(hash.length).toBeGreaterThan(20);
    });

    it('produces different hashes for the same input (random salt)', async () => {
        const a = await hashPin('1234');
        const b = await hashPin('1234');
        expect(a).not.toBe(b);
    });

    it('produces different hashes for different inputs', async () => {
        const a = await hashPin('1234');
        const b = await hashPin('5678');
        expect(a).not.toBe(b);
    });
});

describe('isHashed', () => {
    it('returns true for a v2 value produced by hashPin', async () => {
        const hash = await hashPin('abc');
        expect(isHashed(hash)).toBe(true);
    });

    it('returns true for a legacy v1 hash', () => {
        // rm-pin-v1: prefix used by the old bare-SHA-256 implementation
        expect(isHashed('rm-pin-v1:03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4')).toBe(true);
    });

    it('returns false for a plaintext value', () => {
        expect(isHashed('1234')).toBe(false);
    });

    it('returns false for an empty string', () => {
        expect(isHashed('')).toBe(false);
    });
});

describe('verifyPin', () => {
    it('resolves true when pin matches the stored v2 hash', async () => {
        const hash = await hashPin('secret');
        expect(await verifyPin('secret', hash)).toBe(true);
    });

    it('resolves false when pin does not match the stored v2 hash', async () => {
        const hash = await hashPin('secret');
        expect(await verifyPin('wrong', hash)).toBe(false);
    });

    it('verifies legacy v1 hashes (sha256 of "1234")', async () => {
        // sha256("1234") = 03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4
        const v1Hash = 'rm-pin-v1:03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';
        expect(await verifyPin('1234', v1Hash)).toBe(true);
        expect(await verifyPin('wrong', v1Hash)).toBe(false);
    });

    it('falls back to plaintext comparison for legacy unhashed values', async () => {
        expect(await verifyPin('plain', 'plain')).toBe(true);
        expect(await verifyPin('wrong', 'plain')).toBe(false);
    });

    it('returns false for a v2 hash with a malformed structure (no colon separator)', async () => {
        expect(await verifyPin('x', 'rm-pin-v2:noseparatorhere')).toBe(false);
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
