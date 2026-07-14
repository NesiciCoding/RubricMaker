import { describe, it, expect } from 'vitest';
import { encodeAudioResponse, parseAudioResponse } from './audioResponseCode';

describe('audioResponseCode', () => {
    it('round-trips a valid response', () => {
        const encoded = encodeAudioResponse({
            dataUri: 'data:audio/webm;base64,AAA',
            mimeType: 'audio/webm',
            durationSec: 12,
        });
        expect(parseAudioResponse(encoded)).toEqual({
            dataUri: 'data:audio/webm;base64,AAA',
            mimeType: 'audio/webm',
            durationSec: 12,
        });
    });

    it('returns null for empty/undefined response', () => {
        expect(parseAudioResponse(undefined)).toBeNull();
        expect(parseAudioResponse('')).toBeNull();
    });

    it('returns null for malformed JSON', () => {
        expect(parseAudioResponse('not json')).toBeNull();
    });

    it('returns null when dataUri is missing', () => {
        expect(parseAudioResponse(JSON.stringify({ mimeType: 'audio/webm', durationSec: 5 }))).toBeNull();
    });

    it('defaults mimeType/durationSec when absent', () => {
        expect(parseAudioResponse(JSON.stringify({ dataUri: 'data:audio/webm;base64,BBB' }))).toEqual({
            dataUri: 'data:audio/webm;base64,BBB',
            mimeType: 'audio/webm',
            durationSec: 0,
        });
    });
});
