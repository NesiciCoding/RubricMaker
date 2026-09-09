import { nanoid } from '../utils/nanoid';
import { putBlob, getBlob, deleteBlob, listIds, type MediaRecord } from './mediaStore';

/**
 * Scan image bytes share the single `rm_media` IndexedDB blob store with recordings
 * (services/mediaStore). This prefix keeps scan ids in their own namespace, and the
 * CRUD wrappers below refuse a non-scan id so a stray recording id can't overwrite a
 * recording's blob in the shared store.
 */
export const SCAN_ID_PREFIX = 'scan_';

export function newScanId(): string {
    return SCAN_ID_PREFIX + nanoid();
}

export function isScanId(id: string): boolean {
    return id.startsWith(SCAN_ID_PREFIX);
}

function assertScanId(id: string): void {
    if (!isScanId(id)) throw new Error(`Not a scan id: ${id}`);
}

export async function putScanBlob(id: string, blob: Blob, mimeType: string): Promise<MediaRecord> {
    assertScanId(id);
    return putBlob(id, blob, mimeType);
}

export async function getScanBlob(id: string): Promise<MediaRecord | null> {
    assertScanId(id);
    return getBlob(id);
}

export async function deleteScanBlob(id: string): Promise<void> {
    assertScanId(id);
    return deleteBlob(id);
}

export async function listScanIds(): Promise<string[]> {
    return (await listIds()).filter(isScanId);
}
