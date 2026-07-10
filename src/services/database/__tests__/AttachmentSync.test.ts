import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AttachmentSync } from '../AttachmentSync';
import type { SupabaseAdapter } from '../SupabaseAdapter';

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
