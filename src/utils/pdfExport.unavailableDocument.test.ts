import { afterEach, describe, expect, it, vi } from 'vitest';
import { printForExport, printHtml } from './pdfExport';

/**
 * The frame exists but the browser gives it no document: `print()` is never called, so there is no
 * print job and no dialog to cancel. Before this was distinguished from "the browser cannot watch the
 * dialog", printForExport resolved and the export UI announced a sheet that never reached a printer.
 */
function createFramesWithoutDocument(): void {
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
        const element = create(tag);
        if (tag === 'iframe') Object.defineProperty(element, 'contentWindow', { value: null });
        return element;
    }) as typeof document.createElement);
}

describe('printForExport when the print document is unavailable', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('rejects instead of reporting an export that never printed', async () => {
        createFramesWithoutDocument();

        await expect(printForExport('<p>x</p>', 'portrait', undefined)).rejects.toThrow('print document unavailable');
    });

    it('leaves no print frame behind for the next export to inherit', async () => {
        createFramesWithoutDocument();

        await expect(printForExport('<p>x</p>', 'portrait', undefined)).rejects.toThrow();

        expect(document.querySelector('iframe')).toBeNull();
    });

    it('still reports a frame that did receive a document as available', async () => {
        const outcome = await printHtml('<p>x</p>');

        expect(outcome.documentAvailable).toBe(true);
    });
});
