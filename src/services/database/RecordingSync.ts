import type { SessionRecording } from '../../types';
import type { SupabaseAdapter } from './SupabaseAdapter';
import { getBlob, deleteBlob } from '../mediaStore';

const SIGNED_URL_CACHE_PREFIX = 'rm_signed_url_rec_';
const SIGNED_URL_TTL_MS = 55 * 60 * 1000; // 55 min (URLs valid 60 min)

interface CachedUrl {
    url: string;
    expiresAt: number;
}

function getCachedUrl(id: string): string | null {
    try {
        const raw = sessionStorage.getItem(SIGNED_URL_CACHE_PREFIX + id);
        if (!raw) return null;
        const cached: CachedUrl = JSON.parse(raw);
        if (Date.now() > cached.expiresAt) return null;
        return cached.url;
    } catch {
        return null;
    }
}

function setCachedUrl(id: string, url: string) {
    try {
        const entry: CachedUrl = { url, expiresAt: Date.now() + SIGNED_URL_TTL_MS };
        sessionStorage.setItem(SIGNED_URL_CACHE_PREFIX + id, JSON.stringify(entry));
    } catch {
        /* ignore */
    }
}

export class RecordingSync {
    constructor(private adapter: SupabaseAdapter) {}

    /** Resolve a storage path to a signed URL, with session-level caching. */
    async resolveRecordingUrl(id: string, storagePath: string): Promise<string> {
        const cached = getCachedUrl(id);
        if (cached) return cached;
        const url = await this.adapter.getRecordingSignedUrl(storagePath);
        if (url) setCachedUrl(id, url);
        return url ?? '';
    }

    /** Upload the local blob (if present) and upsert its metadata for a recording belonging to a session. */
    async pushRecording(rec: SessionRecording, sessionId: string): Promise<SessionRecording> {
        let storagePath = rec.storagePath;
        const record = await getBlob(rec.id);
        if (record) {
            const path = await this.adapter.uploadRecordingFile(rec.id, record.blob, record.mimeType);
            if (path) storagePath = path;
        }
        const synced = !!storagePath;
        await this.adapter.upsertRecordingMetadata(rec, sessionId, storagePath);
        return { ...rec, storagePath, synced };
    }

    /** Delete a recording's local blob and its cloud object + metadata. */
    async deleteRecording(id: string): Promise<void> {
        await deleteBlob(id);
        await this.adapter.deleteRecordingMetadata(id);
    }

    /** Push every recording of a session (sequential to avoid memory spikes). Returns updated recordings with sync state. */
    async pushSessionRecordings(recordings: SessionRecording[], sessionId: string): Promise<SessionRecording[]> {
        const result: SessionRecording[] = [];
        for (const rec of recordings) {
            if (rec.synced && rec.storagePath) {
                result.push(rec);
                continue;
            }
            result.push(await this.pushRecording(rec, sessionId));
        }
        return result;
    }

    /** Delete all recordings belonging to a session (local blobs + cloud objects/metadata). */
    async deleteSessionRecordings(recordings: SessionRecording[]): Promise<void> {
        for (const rec of recordings) {
            await this.deleteRecording(rec.id);
        }
    }

    /** Delete all recordings (cloud + local) for a session by id, looking up recording ids from the cloud. */
    async deleteSessionRecordingsById(sessionId: string): Promise<void> {
        const ids = await this.adapter.fetchRecordingIdsForSession(sessionId);
        for (const id of ids) {
            await this.deleteRecording(id);
        }
    }
}
