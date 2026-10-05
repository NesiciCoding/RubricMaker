import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FORMAT } from '../types';
import type { Rubric, Student, StudentRubric } from '../types';
import { buildRubricHTML, printHtml, styleTemplateCss } from './pdfExport';

const PAYLOAD = '<img src=x onerror="window.__pwned=1">';

function fixtures() {
    const level = { id: 'l1', label: 'Good', minPoints: 3, maxPoints: 3, description: 'Solid', subItems: [] };
    const rubric = {
        id: 'r1',
        name: `Essay ${PAYLOAD}`,
        subject: `English ${PAYLOAD}`,
        description: '',
        criteria: [{ id: 'c1', title: 'Writing', description: '', weight: 100, levels: [level] }],
        gradeScaleId: 'letter-10',
        format: DEFAULT_FORMAT,
        attachmentIds: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        totalMaxPoints: 3,
        scoringMode: 'weighted-percentage',
    } as unknown as Rubric;
    const student = { id: 's1', name: `Alice ${PAYLOAD}`, classId: 'k1', email: `a${PAYLOAD}@example.com` } as Student;
    const sr = {
        id: 'sr1',
        rubricId: 'r1',
        studentId: 's1',
        entries: [{ criterionId: 'c1', levelId: 'l1', comment: '', checkedSubItems: [] }],
        overallComment: '',
        isPeerReview: false,
        gradedAt: '2026-01-02T00:00:00.000Z',
        globalModifier: { type: 'points', value: 1, reason: PAYLOAD },
    } as unknown as StudentRubric;
    return { rubric, student, sr };
}

describe('print export escaping', () => {
    it('renders names, subject, email and modifier reason as text, not markup', () => {
        const { rubric, student, sr } = fixtures();
        const html = buildRubricHTML(sr, rubric, student, null);
        expect(html).not.toContain('<img src=x');
        expect(html).not.toMatch(/<[^>]*onerror=/);
        expect(html).toContain('Alice &lt;img');
    });

    it('keeps an unescaped-field payload out of a style template stylesheet', () => {
        const css = styleTemplateCss({ bodyFont: "x'}</style><img src=x onerror=1>", headingFont: 'Arial' });
        expect(css).not.toContain('<');
        expect(css).not.toContain('}</style');
    });
});

describe('printHtml sanitisation', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('drops script, inline handlers and javascript: links from whatever HTML a caller passes in', () => {
        void printHtml(
            `<p>ok</p><script>window.__pwned=1</script>${PAYLOAD}<a href="javascript:window.__pwned=1">x</a><style>.print-page{color:red}</style>`
        );
        const body = document.querySelector('iframe')!.contentDocument!.body;
        expect(body.innerHTML).toContain('<p>ok</p>');
        expect(body.querySelector('script')).toBeNull();
        expect(body.innerHTML).not.toContain('onerror');
        expect(body.innerHTML).not.toContain('javascript:');
        expect(body.querySelector('style')).not.toBeNull();
    });

    it('keeps the markup the answer sheets and reports rely on: data-URL images, styled boxes, tables and style blocks', () => {
        const qr = 'data:image/png;base64,iVBORw0KGgo=';
        void printHtml(
            `<style>.print-page{page-break-after:always}</style><table style="width:100%"><thead><tr><td style="height:10mm;position:relative"><div style="position:absolute;left:5mm;top:3mm;width:4mm;height:4mm;background:#000"></div><img src="${qr}" style="position:absolute;left:1mm"></td></tr></thead><tbody><tr><td><div class="print-page">A</div></td></tr></tbody></table>`
        );
        const body = document.querySelector('iframe')!.contentDocument!.body;
        expect(body.querySelector('img')?.getAttribute('src')).toBe(qr);
        expect(body.querySelector('div[style*="position:absolute"]')).not.toBeNull();
        expect(body.querySelector('style')?.textContent).toContain('page-break-after');
        expect(body.querySelector('.print-page')?.textContent).toBe('A');
    });
});
