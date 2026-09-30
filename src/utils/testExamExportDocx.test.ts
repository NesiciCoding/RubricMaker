import { describe, it, expect } from 'vitest';
import { htmlToParagraphs } from './testExamExportDocx';

const runProps = (p: unknown) => JSON.stringify(p);

describe('htmlToParagraphs', () => {
    it('splits block elements into paragraphs and keeps nested block order', async () => {
        expect(await htmlToParagraphs('<p>First</p><p>Second</p>')).toHaveLength(2);
        const json = runProps(await htmlToParagraphs('<blockquote>Before<p>Inside</p>After</blockquote>'));
        expect(json.indexOf('Before')).toBeLessThan(json.indexOf('Inside'));
        expect(json.indexOf('Inside')).toBeLessThan(json.indexOf('After'));
    });

    it('handles plain text and skips empty blocks', async () => {
        expect(await htmlToParagraphs('Just plain text')).toHaveLength(1);
        expect(await htmlToParagraphs('<p>   </p><p>Real</p>')).toHaveLength(1);
    });

    it('carries the editor font size (14px = 21 half-points) and bold into the runs', async () => {
        const json = runProps(
            await htmlToParagraphs('<p><strong><span style="font-size: 14px">Hi</span></strong></p>')
        );
        expect(json).toContain('"w:sz"');
        expect(json).toContain('21');
        expect(json).toContain('w:b');
    });
});
