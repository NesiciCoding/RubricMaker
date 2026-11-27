import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AttachmentSync } from '../AttachmentSync';
import type { SupabaseAdapter } from '../SupabaseAdapter';
import type { Attachment } from '../../../types';

beforeEach(() => {
    sessionStorage.clear();
});

function makeRows(count: number, prefix = 'a') {
    return Array.from({ length: count }, (_, i) => ({
        id: `${prefix}${i}`,
        name: `file${i}`,
        mimeType: 'text/plain',
        size: 1,
        addedAt: '2026-01-01T00:00:00.000Z',
        storagePath: `path/${i}`,
    }));
}

describe('AttachmentSync.hydrateAttachments', () => {
    it('resolves every row and preserves order', async () => {
        const rows = makeRows(20);
        const adapter = {
            fetchAttachments: vi.fn().mockResolvedValue(rows),
            getAttachmentSignedUrl: vi.fn(async (path: string) => `signed:${path}`),
        } as unknown as SupabaseAdapter;

        const sync = new AttachmentSync(adapter);
        const result = await sync.hydrateAttachments();

        expect(result).toHaveLength(20);
        expect(result.map((r) => r.dataUrl)).toEqual(rows.map((r) => `signed:${r.storagePath}`));
    });

    it('keeps a saved corrected copy and its timestamp unchanged', async () => {
        const row = {
            ...makeRows(1)[0],
            correctedHtml: '<p>Corrected essay</p>',
            correctedAt: '2026-02-01T09:00:00.000Z',
        };
        const adapter = {
            fetchAttachments: vi.fn().mockResolvedValue([row]),
            getAttachmentSignedUrl: vi.fn(async (path: string) => `signed:${path}`),
        } as unknown as SupabaseAdapter;

        const [attachment] = await new AttachmentSync(adapter).hydrateAttachments();

        expect(attachment.dataUrl).toBe('signed:path/0');
        expect(attachment.correctedHtml).toBe('<p>Corrected essay</p>');
        expect(attachment.correctedAt).toBe('2026-02-01T09:00:00.000Z');
    });

    it('never exceeds the concurrency cap while resolving signed URLs', async () => {
        const rows = makeRows(20);
        let inFlight = 0;
        let maxInFlight = 0;
        const adapter = {
            fetchAttachments: vi.fn().mockResolvedValue(rows),
            getAttachmentSignedUrl: vi.fn(async (path: string) => {
                inFlight++;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await new Promise((r) => setTimeout(r, 1));
                inFlight--;
                return `signed:${path}`;
            }),
        } as unknown as SupabaseAdapter;

        const sync = new AttachmentSync(adapter);
        await sync.hydrateAttachments();

        expect(maxInFlight).toBeLessThanOrEqual(8);
        expect(maxInFlight).toBeGreaterThan(1); // still concurrent, not serialized
    });
});

describe('AttachmentSync.updateAttachmentMeta', () => {
    it('updates the stored document without re-uploading the original file', async () => {
        const updateAttachmentMeta = vi.fn().mockResolvedValue({ success: true });
        const uploadAttachmentFile = vi.fn();
        const adapter = { updateAttachmentMeta, uploadAttachmentFile } as unknown as SupabaseAdapter;
        const attachment: Attachment = {
            id: 'a1',
            name: 'Essay.html',
            mimeType: 'text/html',
            dataUrl: 'data:text/html;base64,PGgxPk9yaWdpbmFsPC9oMT4=',
            size: 20,
            studentId: 's1',
            addedAt: '2026-01-01T00:00:00.000Z',
            correctedHtml: '<p>Corrected</p>',
            correctedAt: '2026-01-02T00:00:00.000Z',
        };

        const result = await new AttachmentSync(adapter).updateAttachmentMeta(attachment);

        expect(result).toEqual({ success: true });
        expect(uploadAttachmentFile).not.toHaveBeenCalled();
        expect(updateAttachmentMeta).toHaveBeenCalledWith(expect.not.objectContaining({ dataUrl: expect.anything() }));
        expect(updateAttachmentMeta).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'a1', correctedHtml: '<p>Corrected</p>' })
        );
    });
});
