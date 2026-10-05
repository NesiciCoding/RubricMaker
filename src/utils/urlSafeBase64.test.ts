import { describe, expect, it } from 'vitest';
import { decodeUrlSafeBase64, encodeUrlSafeBase64, MAX_SHARE_CODE_LENGTH } from './urlSafeBase64';

describe('urlSafeBase64', () => {
    it('round-trips text', () => {
        expect(decodeUrlSafeBase64(encodeUrlSafeBase64('héllo/wörld?'))).toBe('héllo/wörld?');
    });

    it('refuses to decode an oversized code', () => {
        expect(() => decodeUrlSafeBase64('A'.repeat(MAX_SHARE_CODE_LENGTH + 1))).toThrow('Share code too large');
    });
});
