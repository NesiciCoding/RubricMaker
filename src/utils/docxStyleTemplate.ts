/**
 * docxStyleTemplate.ts
 *
 * Extracts heading/body font styling from a user-uploaded blank .docx, for use as an
 * essay/period-report "style template" (as opposed to docxTemplateExport.ts's rubric
 * table-header template). Mammoth strips paragraph/style metadata, so this reads
 * word/styles.xml directly from the docx zip instead.
 */

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export interface StyleTemplateResult {
    headingFont?: string;
    /** Half-points, matching the `docx` library's TextRun.size unit directly (no conversion needed) */
    headingSize?: number;
    /** Hex, no leading '#', matching the `docx` library's TextRun.color format */
    headingColor?: string;
    bodyFont?: string;
}

function findStyleById(styles: Element[], styleId: string): Element | undefined {
    return styles.find((s) => s.getAttributeNS(W_NS, 'styleId') === styleId);
}

function readAttrNS(el: Element | undefined, tag: string, attr: string): string | undefined {
    const node = el?.getElementsByTagNameNS(W_NS, tag)[0];
    return node?.getAttributeNS(W_NS, attr) ?? undefined;
}

export async function parseStyleTemplate(file: File): Promise<StyleTemplateResult> {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const stylesEntry = zip.file('word/styles.xml');
    if (!stylesEntry) return {};

    const xml = await stylesEntry.async('text');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return {};

    const styles = [...doc.documentElement.getElementsByTagNameNS(W_NS, 'style')];
    const headingRPr = findStyleById(styles, 'Heading1')?.getElementsByTagNameNS(W_NS, 'rPr')[0];
    const normalRPr = findStyleById(styles, 'Normal')?.getElementsByTagNameNS(W_NS, 'rPr')[0];
    const docDefaultRPr = doc.documentElement
        .getElementsByTagNameNS(W_NS, 'docDefaults')[0]
        ?.getElementsByTagNameNS(W_NS, 'rPrDefault')[0]
        ?.getElementsByTagNameNS(W_NS, 'rPr')[0];

    const readFont = (rPr: Element | undefined) => readAttrNS(rPr, 'rFonts', 'ascii');
    const readSize = (rPr: Element | undefined) => {
        const val = readAttrNS(rPr, 'sz', 'val');
        return val ? Number(val) : undefined;
    };
    const readColor = (rPr: Element | undefined) => {
        const val = readAttrNS(rPr, 'color', 'val');
        return val && val.toLowerCase() !== 'auto' ? val : undefined;
    };

    return {
        headingFont: readFont(headingRPr) ?? readFont(docDefaultRPr),
        headingSize: readSize(headingRPr) ?? readSize(docDefaultRPr),
        headingColor: readColor(headingRPr) ?? readColor(docDefaultRPr),
        bodyFont: readFont(normalRPr) ?? readFont(docDefaultRPr),
    };
}
