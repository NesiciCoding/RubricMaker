import type { VoTrack } from '../types';
import type { CefrLevel } from '../types';

export const VO_TRACKS: VoTrack[] = ['vmbo-bb', 'vmbo-kb', 'vmbo-tl', 'havo', 'vwo'];

export const VO_TRACK_LABELS: Record<VoTrack, string> = {
    'vmbo-bb': 'VMBO-BB',
    'vmbo-kb': 'VMBO-KB',
    'vmbo-tl': 'VMBO-TL',
    havo: 'HAVO',
    vwo: 'VWO',
};

/** Accent colour per track — used for badges and progress indicators */
export const VO_TRACK_COLORS: Record<VoTrack, string> = {
    'vmbo-bb': '#f97316', // orange
    'vmbo-kb': '#eab308', // amber
    'vmbo-tl': '#22c55e', // green
    havo: '#3b82f6', // blue
    vwo: '#8b5cf6', // violet
};

/** Default CEFR target level per track (end-of-year expectation for EFL) */
export const VO_TRACK_DEFAULT_CEFR: Record<VoTrack, CefrLevel> = {
    'vmbo-bb': 'A2',
    'vmbo-kb': 'A2',
    'vmbo-tl': 'B1',
    havo: 'B1',
    vwo: 'B2',
};

/** True when two tracks are the same or immediate neighbours in VO_TRACKS — used to bound a per-student track override to the class default. */
export function isAdjacentTrack(a: VoTrack, b: VoTrack): boolean {
    return Math.abs(VO_TRACKS.indexOf(a) - VO_TRACKS.indexOf(b)) <= 1;
}

/** Custom color if set, else the track's swatch; undefined when neither is available. */
export function getTrackBadgeColor(entity: { color?: string; voTrack?: VoTrack }): string | undefined {
    return entity.color ?? (entity.voTrack ? VO_TRACK_COLORS[entity.voTrack] : undefined);
}

/** A student's own track override, falling back to their class's default track. */
export function getEffectiveVoTrack(student?: { voTrack?: VoTrack }, cls?: { voTrack?: VoTrack }): VoTrack | undefined {
    return student?.voTrack ?? cls?.voTrack;
}
