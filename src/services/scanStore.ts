import { nanoid } from '../utils/nanoid';
import { putBlob, getBlob, deleteBlob, listIds, type MediaRecord } from './mediaStore';

/**
 * Scan image bytes share the single `rm_media` IndexedDB blob store with recordings
 * (services/mediaStore). This prefix keeps scan ids in their own namespace so the two
 * kinds never collide and scans can be listed/pruned independently.
 */
export const SCAN_ID_PREFIX = 'scan_';

/** A fresh, prefixed scan id. */
export function newScanId(): string {
    return SCAN_ID_PREFIX + nanoid();
}

/** Whether an id belongs to the scan namespace. */
export function isScanId(id: string): boolean {
    return id.startsWith(SCAN_ID_PREFIX);
}

export function putScanBlob(id: string, blob: Blob, mimeType: string): Promise<MediaRecord> {
    return putBlob(id, blob, mimeType);
}

export function getScanBlob(id: string): Promise<MediaRecord | null> {
    return getBlob(id);
}

export function deleteScanBlob(id: string): Promise<void> {
    return deleteBlob(id);
}

/** Ids of every locally-stored scan blob (recording blobs are excluded by prefix). */
export async function listScanIds(): Promise<string[]> {
    return (await listIds()).filter(isScanId);
}
