import type { Scan } from '../../types';
import type { SupabaseAdapter } from './SupabaseAdapter';
import { getScanBlob, deleteScanBlob } from '../scanStore';
import { getCachedSignedUrl, setCachedSignedUrl } from './signedUrlCache';

const SIGNED_URL_CACHE_PREFIX = 'rm_signed_url_scan_';

/**
 * Cloud sync for handwriting scans (Phase 33.5), mirroring RecordingSync: the image
 * blob lives in the shared IndexedDB store (scanStore) while offline and in the `scans`
 * bucket once uploaded, with only its storage path kept on the Scan record. A scan whose
 * image was discarded after OCR (keepImage=false) has no blob — its text-only metadata
 * still syncs so the transcription survives across devices.
 */
export class ScanSync {
    constructor(private adapter: SupabaseAdapter) {}

    /** Resolve a storage path to a signed URL, with session-level caching. */
    async resolveScanUrl(id: string, storagePath: string): Promise<string> {
        const cached = getCachedSignedUrl(SIGNED_URL_CACHE_PREFIX + id);
        if (cached) return cached;
        const url = await this.adapter.getScanSignedUrl(storagePath);
        if (url) setCachedSignedUrl(SIGNED_URL_CACHE_PREFIX + id, url);
        return url ?? '';
    }

    /** Upload the local image blob (if present) and upsert the scan's metadata. */
    async pushScan(scan: Scan): Promise<Scan> {
        let storagePath = scan.storagePath;
        const record = await getScanBlob(scan.id);
        if (record) {
            const path = await this.adapter.uploadScanFile(scan.id, record.blob, record.mimeType);
            if (path) storagePath = path;
        }
        const result = await this.adapter.upsertScanMetadata(scan, storagePath);
        if (!result.success) throw new Error(result.error ?? 'Failed to upsert scan metadata');
        return { ...scan, storagePath, synced: true };
    }

    /** Delete a scan's local blob and its cloud object + metadata. */
    async deleteScan(id: string): Promise<void> {
        await deleteScanBlob(id);
        const result = await this.adapter.deleteScanMetadata(id);
        if (!result.success) throw new Error(result.error ?? 'Failed to delete scan metadata');
    }

    /** Push several scans (sequential to avoid memory spikes). Returns them with sync state. */
    async pushScans(scans: Scan[]): Promise<Scan[]> {
        const result: Scan[] = [];
        for (const scan of scans) {
            // A text-only scan (image discarded after OCR) is synced without a storagePath,
            // so `synced` alone — not the path — decides whether a re-push is needed.
            if (scan.synced) {
                result.push(scan);
                continue;
            }
            result.push(await this.pushScan(scan));
        }
        return result;
    }

    /** Delete several scans (local blobs + cloud objects/metadata). */
    async deleteScans(scans: Scan[]): Promise<void> {
        for (const scan of scans) {
            await this.deleteScan(scan.id);
        }
    }

    /** Delete every scan belonging to a student, looking up scan ids from the cloud. */
    async deleteScansForStudent(studentId: string): Promise<void> {
        const ids = await this.adapter.fetchScanIdsForStudent(studentId);
        for (const id of ids) {
            await this.deleteScan(id);
        }
    }
}
