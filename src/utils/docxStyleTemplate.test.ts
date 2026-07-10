import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parseStyleTemplate } from './docxStyleTemplate';

async function makeDocxFile(stylesXml: string | null): Promise<File> {
    const zip = new JSZip();
    if (stylesXml !== null) zip.file('word/styles.xml', stylesXml);
    const blob = await zip.generateAsync({ type: 'blob' });
    return new File([blob], 'template.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
}

const FULL_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri"/>
        <w:sz w:val="22"/>
        <w:color w:val="000000"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:rPr>
      <w:rFonts w:ascii="Georgia"/>
      <w:sz w:val="32"/>
      <w:color w:val="1F4E79"/>
    </w:rPr>
  </w:style>
</w:styles>`;

const PARTIAL_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri"/>
        <w:color w:val="000000"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:rPr>
      <w:rFonts w:ascii="Georgia"/>
    </w:rPr>
  </w:style>
</w:styles>`;

const AUTO_COLOR_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:rPr>
      <w:color w:val="auto"/>
    </w:rPr>
  </w:style>
</w:styles>`;

describe('parseStyleTemplate', () => {
    it('extracts heading font/size/color and body font from Heading1/Normal styles', async () => {
        const file = await makeDocxFile(FULL_STYLES_XML);
        const result = await parseStyleTemplate(file);
        expect(result).toEqual({
            headingFont: 'Georgia',
            headingSize: 32,
            headingColor: '1F4E79',
            bodyFont: 'Calibri',
        });
    });

    it('falls back to docDefaults for values not set on the specific style', async () => {
        const file = await makeDocxFile(PARTIAL_STYLES_XML);
        const result = await parseStyleTemplate(file);
        expect(result.headingFont).toBe('Georgia');
        // Heading1 has no explicit size/color -> falls back to docDefaults (no size set, color set)
        expect(result.headingSize).toBeUndefined();
        expect(result.headingColor).toBe('000000');
        expect(result.bodyFont).toBe('Calibri');
    });

    it('treats color "auto" as undetected', async () => {
        const file = await makeDocxFile(AUTO_COLOR_STYLES_XML);
        const result = await parseStyleTemplate(file);
        expect(result.headingColor).toBeUndefined();
    });

    it('returns an empty result when word/styles.xml is missing', async () => {
        const file = await makeDocxFile(null);
        const result = await parseStyleTemplate(file);
        expect(result).toEqual({});
    });
});
