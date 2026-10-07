/** Base64 characters per second of browser-recorded voice audio (~128 kbps Opus/WebM, inflated 4/3 by base64). */
export const AUDIO_CHARS_PER_SECOND = 22_000;
/** Below this many seconds of headroom a new recording isn't started at all. */
export const MIN_RECORDING_SECONDS = 10;
/** Below this many seconds of headroom the teacher is warned and the recording is capped. */
export const LOW_STORAGE_RECORDING_SECONDS = 120;

/**
 * Seconds of voice feedback that still fit in localStorage, keeping 20% of the free space for the
 * grade record itself and other writes.
 */
export function voiceRecordingBudgetSeconds(usedChars: number, quotaChars: number): number {
    const free = Math.max(0, quotaChars - usedChars);
    return Math.floor((free * 0.8) / AUDIO_CHARS_PER_SECOND);
}
