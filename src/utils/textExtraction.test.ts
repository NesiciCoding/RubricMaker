import { describe, it, expect, vi } from 'vitest';
import { convertDocxToHtml } from './textExtraction';

vi.mock('mammoth', () => ({
    convertToHtml: vi.fn().mockResolvedValue({ value: '<p>Hello <script>alert(1)</script>World</p>' }),
}));

describe('convertDocxToHtml', () => {
    it('converts a docx dataUrl to Mammoth HTML, sanitized via DOMPurify', async () => {
        const dataUrl = 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,aGVsbG8=';
        const html = await convertDocxToHtml(dataUrl);
        expect(html).toContain('Hello');
        expect(html).toContain('World');
        expect(html).not.toContain('<script>');
    });
});
