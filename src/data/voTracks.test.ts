import { describe, it, expect } from 'vitest';
import {
    VO_TRACKS,
    VO_TRACK_COLORS,
    classHasVoTrack,
    getClassVoTracks,
    getEffectiveVoTrack,
    getTrackBadgeColor,
} from './voTracks';
import type { VoTrack } from '../types';

describe('getClassVoTracks', () => {
    it('returns an empty list without a class', () => {
        expect(getClassVoTracks()).toEqual([]);
    });

    it('returns an empty list for a class with no track at all', () => {
        expect(getClassVoTracks({})).toEqual([]);
    });

    it('falls back to the single legacy voTrack field', () => {
        expect(getClassVoTracks({ voTrack: 'havo' })).toEqual(['havo']);
    });

    it('returns every declared track in VO_TRACKS order', () => {
        expect(getClassVoTracks({ voTracks: ['vwo', 'vmbo-tl'] as VoTrack[] })).toEqual(['vmbo-tl', 'vwo']);
    });

    it('prefers voTracks over a stale singular voTrack', () => {
        expect(getClassVoTracks({ voTrack: 'havo', voTracks: ['vmbo-bb'] as VoTrack[] })).toEqual(['vmbo-bb']);
    });
});

describe('classHasVoTrack', () => {
    it('is false without a class', () => {
        expect(classHasVoTrack(undefined, 'havo')).toBe(false);
    });

    it('matches a mixed class on any of its tracks', () => {
        const cls = { voTracks: ['vmbo-tl', 'havo'] as VoTrack[] };
        expect(classHasVoTrack(cls, 'havo')).toBe(true);
        expect(classHasVoTrack(cls, 'vwo')).toBe(false);
    });
});

describe('getEffectiveVoTrack', () => {
    it('prefers the student override', () => {
        expect(getEffectiveVoTrack({ voTrack: 'vwo' }, { voTracks: ['vmbo-bb'] as VoTrack[] })).toBe('vwo');
    });

    it('falls back to the class primary track', () => {
        expect(getEffectiveVoTrack(undefined, { voTracks: ['havo', 'vwo'] as VoTrack[] })).toBe('havo');
    });

    it('is undefined when neither side declares a track', () => {
        expect(getEffectiveVoTrack(undefined, undefined)).toBeUndefined();
    });
});

describe('getTrackBadgeColor', () => {
    it('prefers a custom class color', () => {
        expect(getTrackBadgeColor({ color: '#123456', voTracks: ['havo'] as VoTrack[] })).toBe('#123456');
    });

    it('falls back to the first declared track swatch', () => {
        expect(getTrackBadgeColor({ voTracks: ['havo', 'vwo'] as VoTrack[] })).toBe(VO_TRACK_COLORS.havo);
    });

    it('is undefined when no color or track is set', () => {
        expect(getTrackBadgeColor({})).toBeUndefined();
    });

    it('covers every track in VO_TRACKS', () => {
        VO_TRACKS.forEach((track) => expect(getTrackBadgeColor({ voTrack: track })).toBe(VO_TRACK_COLORS[track]));
    });
});
