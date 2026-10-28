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

/** Custom color if set, else the track's swatch; undefined when neither is available. */
export function getTrackBadgeColor(entity: {
    color?: string;
    voTrack?: VoTrack;
    voTracks?: VoTrack[];
}): string | undefined {
    const track = entity.voTrack ?? entity.voTracks?.[0];
    return entity.color ?? (track ? VO_TRACK_COLORS[track] : undefined);
}

/**
 * Every track in a class, in VO_TRACKS order. Falls back to the single legacy `voTrack` field so
 * classes stored before heterogeneous-class support keep working untouched.
 */
export function getClassVoTracks(cls?: { voTrack?: VoTrack; voTracks?: VoTrack[] }): VoTrack[] {
    if (!cls) return [];
    const tracks = cls.voTracks?.length ? cls.voTracks : cls.voTrack ? [cls.voTrack] : [];
    return VO_TRACKS.filter((t) => tracks.includes(t));
}

/** True when the class holds this track (its own track, or one of the tracks it mixes). */
export function classHasVoTrack(cls: { voTrack?: VoTrack; voTracks?: VoTrack[] } | undefined, track: VoTrack): boolean {
    return getClassVoTracks(cls).includes(track);
}

/**
 * A student's own track override, falling back to their class's primary track. A heterogeneous
 * class leaves the primary track as the class default until the student is assigned one.
 */
export function getEffectiveVoTrack(
    student?: { voTrack?: VoTrack },
    cls?: { voTrack?: VoTrack; voTracks?: VoTrack[] }
): VoTrack | undefined {
    return student?.voTrack ?? getClassVoTracks(cls)[0];
}
