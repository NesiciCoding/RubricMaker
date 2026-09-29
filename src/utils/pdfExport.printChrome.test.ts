import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { printHtml, withoutBrowserPrintChrome } from './pdfExport';

describe('withoutBrowserPrintChrome', () => {
    it('wraps content in a table whose thead/tfoot spacers rebuild the page margin on every printed page', () => {
        const html = withoutBrowserPrintChrome('<div class="print-page">A</div>');
        expect(html).toMatch(/<thead><tr><td style="height:10mm/);
        expect(html).toMatch(/<tfoot><tr><td style="height:10mm/);
        expect(html).toContain('<div class="print-page">A</div>');
    });

    it("drops the last sheet's forced page break so the footer spacer cannot add a blank page", () => {
        expect(withoutBrowserPrintChrome('')).toContain('.print-page:last-child{page-break-after:auto !important}');
    });

    it('puts header extras inside the repeated thead and only forces a page break when asked', () => {
        const plain = withoutBrowserPrintChrome('X');
        expect(plain).not.toContain('page-break-after:always');

        const html = withoutBrowserPrintChrome('X', { headerExtra: '<i class="marker"></i>', breakAfter: true });
        expect(html).toMatch(/<thead>.*<i class="marker"><\/i>.*<\/thead>/);
        expect(html).toContain('page-break-after:always');
    });
});

describe('printHtml lifecycle', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    function startPrint(options?: Parameters<typeof printHtml>[4]) {
        const done = vi.fn();
        const promise = printHtml('<p>x</p>', undefined, undefined, undefined, options).then(done);
        const win = document.querySelector('iframe')!.contentWindow!;
        const print = vi.fn();
        win.print = print;
        return { done, promise, win, print };
    }

    it('resolves promptly by default but keeps the print frame until the browser reports afterprint', async () => {
        const { done, promise, win, print } = startPrint();

        await vi.advanceTimersByTimeAsync(500 + 100);
        await promise;
        expect(print).toHaveBeenCalledTimes(1);
        expect(done).toHaveBeenCalledTimes(1);
        expect(document.querySelector('iframe')).not.toBeNull();

        win.dispatchEvent(new Event('afterprint'));
        expect(document.querySelector('iframe')).toBeNull();
    });

    it('waits for the dialog to close when asked, so a following document does not open over it', async () => {
        const { done, promise, win } = startPrint({ waitForPrintDialog: true });

        await vi.advanceTimersByTimeAsync(500 + 5000);
        expect(done).not.toHaveBeenCalled();
        expect(document.querySelector('iframe')).not.toBeNull();

        win.dispatchEvent(new Event('afterprint'));
        await promise;
        expect(done).toHaveBeenCalledTimes(1);
        expect(document.querySelector('iframe')).toBeNull();
    });

    it('does not wait in browsers without afterprint support', async () => {
        const { promise, win } = startPrint({ waitForPrintDialog: true });
        // jsdom defines onafterprint on the window; removing it simulates a browser without the event.
        delete (win as unknown as Record<string, unknown>).onafterprint;

        await vi.advanceTimersByTimeAsync(500 + 100);
        await promise;
    });

    it('gives up on a print job that never reports afterprint after the safety timeout', async () => {
        const { promise } = startPrint({ waitForPrintDialog: true });

        await vi.advanceTimersByTimeAsync(5 * 60_000 + 1000);
        await promise;
        expect(document.querySelector('iframe')).toBeNull();
    });
});
