import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin, isHashed } from '../pinHash';
import { nanoid } from '../nanoid';

// Canonical v2 wire format: rm-pin-v2:<32 hex salt>:<64 hex hash>
const V2_FORMAT_RE = /^rm-pin-v2:([0-9a-f]{32}):([0-9a-f]{64})$/;

describe('hashPin', () => {
    it('conforms to the full v2 wire format rm-pin-v2:<32 hex>:<64 hex>', async () => {
        const hash = await hashPin('1234');
        expect(V2_FORMAT_RE.test(hash)).toBe(true);
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

    it('returns false for a v2 hash with no colon separator', async () => {
        expect(await verifyPin('x', 'rm-pin-v2:noseparatorhere')).toBe(false);
    });

    it('returns false for a v2 hash with wrong salt length (not 32 hex chars)', async () => {
        // 30 hex salt chars instead of 32
        expect(await verifyPin('x', 'rm-pin-v2:' + 'a'.repeat(30) + ':' + 'b'.repeat(64))).toBe(false);
    });

    it('returns false for a v2 hash with wrong hash length (not 64 hex chars)', async () => {
        // Correct 32 hex salt but only 60 hex chars for hash
        expect(await verifyPin('x', 'rm-pin-v2:' + 'a'.repeat(32) + ':' + 'b'.repeat(60))).toBe(false);
    });

    it('returns false for a v2 hash with non-hex characters in body', async () => {
        expect(await verifyPin('x', 'rm-pin-v2:' + 'z'.repeat(32) + ':' + 'b'.repeat(64))).toBe(false);
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
