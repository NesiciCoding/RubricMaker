import { describe, it, expect } from 'vitest';
import { VO_TRACKS, isAdjacentTrack } from './voTracks';

describe('isAdjacentTrack', () => {
    it('is true for the same track', () => {
        expect(isAdjacentTrack('havo', 'havo')).toBe(true);
    });

    it('is true for immediate neighbours in VO_TRACKS', () => {
        expect(isAdjacentTrack('vmbo-tl', 'havo')).toBe(true);
        expect(isAdjacentTrack('havo', 'vmbo-tl')).toBe(true);
        expect(isAdjacentTrack('havo', 'vwo')).toBe(true);
    });

    it('is false for tracks more than one apart', () => {
        expect(isAdjacentTrack('vmbo-bb', 'havo')).toBe(false);
        expect(isAdjacentTrack('vmbo-bb', 'vwo')).toBe(false);
    });

    it('covers every track in VO_TRACKS being adjacent to itself', () => {
        VO_TRACKS.forEach((track) => expect(isAdjacentTrack(track, track)).toBe(true));
    });
});
