/**
 * `audio-response` question answers are always transported as a JSON-encoded
 * `TestAnswer.response` string carrying a data URI — the same jsonb column
 * every other question type already uses, DB-connected or offline.
 *
 * ponytail: capped-duration data URI, not a Storage-bucket upload. Bounded
 * (recorder auto-stops at TestQuestion.maxRecordingSeconds) so a single
 * response stays well under a megabyte, but this is a real ceiling — if
 * audio-response questions see heavy use, move to the recordings bucket +
 * RecordingSync's signed-URL pattern instead of inflating `student_tests`/
 * `test_assignments` jsonb rows.
 */
export interface AudioResponseData {
    dataUri: string;
    mimeType: string;
    durationSec: number;
}

export function encodeAudioResponse(data: AudioResponseData): string {
    return JSON.stringify(data);
}

export function parseAudioResponse(response: string | undefined): AudioResponseData | null {
    if (!response) return null;
    try {
        const parsed = JSON.parse(response) as Partial<AudioResponseData>;
        if (typeof parsed.dataUri !== 'string' || !/^data:/i.test(parsed.dataUri)) return null;
        return {
            dataUri: parsed.dataUri,
            mimeType: typeof parsed.mimeType === 'string' ? parsed.mimeType : 'audio/webm',
            durationSec: typeof parsed.durationSec === 'number' ? parsed.durationSec : 0,
        };
    } catch {
        return null;
    }
}
