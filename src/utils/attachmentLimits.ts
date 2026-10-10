/**
 * Local mode keeps attachments as base64 inside localStorage, which holds roughly 5 MB for the
 * whole app; base64 inflates a file by a third, so anything near that silently fails to persist.
 */
export const LOCAL_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;

/** The Supabase `attachments` bucket's file_size_limit (003_storage_buckets.sql). */
export const CLOUD_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

export function attachmentMaxBytes(connected: boolean): number {
    return connected ? CLOUD_ATTACHMENT_MAX_BYTES : LOCAL_ATTACHMENT_MAX_BYTES;
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
