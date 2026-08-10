import type { StudentRubric, ScoreEntry } from '../../types';
import type { SupabaseAdapter } from './SupabaseAdapter';

const SIGNED_URL_CACHE_PREFIX = 'rm_signed_url_fb_';
const SIGNED_URL_TTL_MS = 55 * 60 * 1000; // 55 min (teacher-playback URLs valid 60 min)

// Long TTL for signed URLs embedded in a /feedback/:code share link: the link is meant to
// outlive a session, and the student page has no auth to re-sign. Supabase caps this per project
// config; if it clamps lower the teacher can regenerate the link.
const SHARE_URL_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year

interface CachedUrl {
    url: string;
    expiresAt: number;
}

function getCachedUrl(path: string): string | null {
    try {
        const raw = sessionStorage.getItem(SIGNED_URL_CACHE_PREFIX + path);
        if (!raw) return null;
        const cached: CachedUrl = JSON.parse(raw);
        if (Date.now() > cached.expiresAt) return null;
        return cached.url;
    } catch {
        return null;
    }
}

function setCachedUrl(path: string, url: string) {
    try {
        const entry: CachedUrl = { url, expiresAt: Date.now() + SIGNED_URL_TTL_MS };
        sessionStorage.setItem(SIGNED_URL_CACHE_PREFIX + path, JSON.stringify(entry));
    } catch {
        /* ignore */
    }
}

/** Parse a `data:<mime>;base64,<data>` URL into a Blob. Returns null for non-base64/malformed URLs. */
export function dataUrlToBlob(dataUrl: string): { blob: Blob; mime: string } | null {
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
    if (!match) return null;
    const mime = match[1];
    try {
        const binary = atob(match[2]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return { blob: new Blob([bytes], { type: mime }), mime };
    } catch {
        return null;
    }
}

/**
 * Keeps voice-feedback audio out of the student_rubrics.data jsonb (issue #275). At push time it
 * uploads any inline base64 `audioDataUrl` to the feedback-audio bucket, replacing it with a small
 * `audioStoragePath`, so both the Supabase write and every hydrate transfer kilobytes instead of
 * megabytes. Old records recorded before this existed migrate lazily the first time they're pushed.
 */
export class FeedbackAudioSync {
    constructor(private adapter: SupabaseAdapter) {}

    // audioDataUrl (content) -> storage path uploaded this session. Keyed by content, not by
    // criterion, so re-pushing an unchanged record (state carries the base64 until the next
    // hydrate) reuses the path, while a *re-recording* (new content for the same criterion)
    // is a cache miss and gets uploaded rather than silently dropped.
    private uploadedByContent = new Map<string, string>();

    /** Resolve a storage path to a signed URL for teacher-side playback, with session caching. */
    async resolveUrl(storagePath: string): Promise<string> {
        const cached = getCachedUrl(storagePath);
        if (cached) return cached;
        const url = await this.adapter.getFeedbackAudioSignedUrl(storagePath);
        if (url) setCachedUrl(storagePath, url);
        return url ?? '';
    }

    /** Mint a long-TTL signed URL to embed in a self-contained /feedback/:code share link. */
    async signForShare(storagePath: string): Promise<string | null> {
        return this.adapter.getFeedbackAudioSignedUrl(storagePath, SHARE_URL_TTL_SECONDS);
    }

    /**
     * Inline stored audio back into a StudentRubric for a self-contained /feedback/:code share link:
     * each entry on a storage path gets a long-TTL signed URL written to audioDataUrl, which the
     * student page plays directly. Entries already holding base64 (not yet migrated) are left as-is.
     */
    async inlineForShare(sr: StudentRubric): Promise<StudentRubric> {
        if (!sr.entries.some((e) => e.audioStoragePath && !e.audioDataUrl)) return sr;
        const entries = await Promise.all(
            sr.entries.map(async (e) => {
                if (e.audioStoragePath && !e.audioDataUrl) {
                    const url = await this.signForShare(e.audioStoragePath);
                    if (url) return { ...e, audioDataUrl: url };
                }
                return e;
            })
        );
        return { ...sr, entries };
    }

    /** Best-effort delete of a bucket object when a teacher removes a recording. */
    async deleteByPath(storagePath: string): Promise<void> {
        try {
            sessionStorage.removeItem(SIGNED_URL_CACHE_PREFIX + storagePath);
        } catch {
            /* ignore */
        }
        await this.adapter.deleteFeedbackAudio(storagePath);
    }

    /**
     * Return a copy of `sr` safe to write to Supabase: any entry holding inline base64 audio has it
     * uploaded to the bucket and swapped for `audioStoragePath`. On upload failure the base64 is kept
     * so playback still works and the next push retries. Entries already on a storage path are
     * untouched. Returns the original reference when nothing needed uploading (cheap no-op path).
     */
    async prepareForPush(sr: StudentRubric): Promise<StudentRubric> {
        if (!sr.entries.some((e) => e.audioDataUrl)) return sr;

        const entries: ScoreEntry[] = [];
        let changed = false;
        for (const entry of sr.entries) {
            if (!entry.audioDataUrl) {
                entries.push(entry);
                continue;
            }
            // audioDataUrl present means there's a local recording to upload — a fresh or a
            // re-recording. Never reuse entry.audioStoragePath here (that would keep the OLD
            // audio and drop the new one); only skip the upload if this exact content already
            // went up this session.
            let storagePath = this.uploadedByContent.get(entry.audioDataUrl);
            if (!storagePath) {
                const parsed = dataUrlToBlob(entry.audioDataUrl);
                if (parsed) {
                    const suffix = `${sr.id}/${entry.criterionId}`;
                    const path = await this.adapter.uploadFeedbackAudio(suffix, parsed.blob, parsed.mime);
                    if (path) {
                        storagePath = path;
                        this.uploadedByContent.set(entry.audioDataUrl, path);
                    }
                }
            }
            if (storagePath) {
                entries.push({ ...entry, audioStoragePath: storagePath, audioDataUrl: undefined });
                changed = true;
            } else {
                // Upload failed (offline / transient) — keep base64 so playback works and retry later.
                entries.push(entry);
            }
        }
        return changed ? { ...sr, entries } : sr;
    }
}
