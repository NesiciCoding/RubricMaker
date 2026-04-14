import type { VoTrack } from '../types';
import type { CefrLevel } from '../types';

export const VO_TRACKS: VoTrack[] = ['vmbo-bb', 'vmbo-kb', 'vmbo-tl', 'havo', 'vwo'];

export const VO_TRACK_LABELS: Record<VoTrack, string> = {
    'vmbo-bb': 'VMBO-BB',
    'vmbo-kb': 'VMBO-KB',
    'vmbo-tl': 'VMBO-TL',
    'havo': 'HAVO',
    'vwo': 'VWO',
};

/** Accent colour per track — used for badges and progress indicators */
export const VO_TRACK_COLORS: Record<VoTrack, string> = {
    'vmbo-bb': '#f97316', // orange
    'vmbo-kb': '#eab308', // amber
    'vmbo-tl': '#22c55e', // green
    'havo': '#3b82f6',    // blue
    'vwo': '#8b5cf6',     // violet
};

/** Default CEFR target level per track (end-of-year expectation for EFL) */
export const VO_TRACK_DEFAULT_CEFR: Record<VoTrack, CefrLevel> = {
    'vmbo-bb': 'A2',
    'vmbo-kb': 'A2',
    'vmbo-tl': 'B1',
    'havo': 'B1',
    'vwo': 'B2',
};
