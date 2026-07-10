import type { Attachment, ExportTemplate } from '../../types';
import type { SupabaseAdapter } from './SupabaseAdapter';

const SIGNED_URL_CACHE_PREFIX = 'rm_signed_url_';
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

function base64ToBlob(dataUrl: string): Blob {
    const [header, b64] = dataUrl.split(',');
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
}

export class AttachmentSync {
    constructor(private adapter: SupabaseAdapter) {}

    /** Upload an attachment that has a base64 dataUrl. Returns the storage path. */
    async uploadAttachment(att: Attachment): Promise<string | null> {
        if (!att.dataUrl.startsWith('data:')) return null; // already a URL
        const blob = base64ToBlob(att.dataUrl);
        return this.adapter.uploadAttachmentFile(att.id, blob, att.mimeType);
    }

    /** Upload an export template that has a base64 dataUrl. Returns the storage path. */
    async uploadExportTemplate(tpl: ExportTemplate): Promise<string | null> {
        if (!tpl.dataUrl.startsWith('data:')) return null;
        const blob = base64ToBlob(tpl.dataUrl);
        return this.adapter.uploadExportTemplateFile(tpl.id, blob);
    }

    /** Resolve a storage path to a signed URL, with session-level caching. */
    async resolveAttachmentUrl(id: string, storagePath: string): Promise<string> {
        const cached = getCachedUrl(id);
        if (cached) return cached;
        const url = await this.adapter.getAttachmentSignedUrl(storagePath);
        if (url) setCachedUrl(id, url);
        return url ?? '';
    }

    /** Resolve an export template URL. */
    async resolveExportTemplateUrl(id: string, storagePath: string): Promise<string> {
        const cached = getCachedUrl('tpl_' + id);
        if (cached) return cached;
        const url = await this.adapter.getExportTemplateSignedUrl(storagePath);
        if (url) setCachedUrl('tpl_' + id, url);
        return url ?? '';
    }

    /** Push a single attachment to storage + metadata table. */
    async pushAttachment(att: Attachment): Promise<void> {
        const { dataUrl, ...meta } = att;
        let storagePath: string | undefined;

        if (dataUrl.startsWith('data:')) {
            const path = await this.uploadAttachment(att);
            storagePath = path ?? undefined;
        }
        await this.adapter.upsertAttachment(meta, storagePath);
    }

    /** Push a single export template to storage + metadata table. */
    async pushExportTemplate(tpl: ExportTemplate): Promise<void> {
        const { dataUrl, ...meta } = tpl;
        let storagePath: string | undefined;

        if (dataUrl.startsWith('data:')) {
            const path = await this.uploadExportTemplate(tpl);
            storagePath = path ?? undefined;
        }
        await this.adapter.upsertExportTemplate(meta, storagePath);
    }

    /** Hydrate attachments: fetch metadata + resolve signed URLs. Returns Attachment[] with dataUrl set. */
    async hydrateAttachments(): Promise<Attachment[]> {
        const rows = await this.adapter.fetchAttachments();
        return Promise.all(
            rows.map(async (row) => {
                const dataUrl = row.storagePath ? await this.resolveAttachmentUrl(row.id, row.storagePath) : '';
                return { ...(row as Omit<Attachment, 'dataUrl'>), dataUrl };
            })
        );
    }

    /** Hydrate export templates: fetch metadata + resolve signed URLs. */
    async hydrateExportTemplates(): Promise<ExportTemplate[]> {
        const rows = await this.adapter.fetchExportTemplates();
        return Promise.all(
            rows.map(async (row) => {
                const dataUrl = row.storagePath ? await this.resolveExportTemplateUrl(row.id, row.storagePath) : '';
                return { ...(row as Omit<ExportTemplate, 'dataUrl'>), dataUrl };
            })
        );
    }
}
