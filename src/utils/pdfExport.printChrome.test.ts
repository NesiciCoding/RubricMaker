import { describe, it, expect } from 'vitest';
import { withoutBrowserPrintChrome } from './pdfExport';

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
});
