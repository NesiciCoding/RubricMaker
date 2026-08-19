import { describe, it, expect, vi, afterEach } from 'vitest';
import { fileToDataUrl } from './fileToDataUrl';

describe('fileToDataUrl', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('resolves with the data URL when the read succeeds', async () => {
        const result = await fileToDataUrl(new Blob(['hello']));
        expect(result).toMatch(/^data:/);
    });

    it('rejects with the reader error when the read fails', async () => {
        class FailingReader {
            result: string | null = null;
            error = new DOMException('read failed', 'NotReadableError');
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            readAsDataURL(_file: Blob): void {
                queueMicrotask(() => this.onerror?.());
            }
        }
        vi.stubGlobal('FileReader', FailingReader);
        await expect(fileToDataUrl(new Blob(['x']))).rejects.toBeInstanceOf(DOMException);
    });
});
