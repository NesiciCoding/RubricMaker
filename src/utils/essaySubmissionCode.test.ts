import { describe, it, expect } from 'vitest';
import { encodeEssaySubmission, decodeEssaySubmission } from './essaySubmissionCode';
import type { EssaySubmission } from '../types';

const makeSubmission = (overrides: Partial<EssaySubmission> = {}): EssaySubmission => ({
    id: 'sub1',
    assignmentRubricId: 'r1',
    assignmentStudentId: 's1',
    teacherKey: 'tk1',
    contentHtml: '<p>My essay text.</p>',
    wordCount: 4,
    submittedAt: '2025-05-12T10:00:00.000Z',
    ...overrides,
});

describe('encodeEssaySubmission', () => {
    it('returns a non-empty string', () => {
        const code = encodeEssaySubmission(makeSubmission());
        expect(typeof code).toBe('string');
        expect(code.length).toBeGreaterThan(0);
    });

    it('returns empty string on circular reference', () => {
        const s = makeSubmission() as any;
        s.circular = s;
        expect(encodeEssaySubmission(s)).toBe('');
    });
});

describe('decodeEssaySubmission', () => {
    it('round-trips a valid submission', () => {
        const original = makeSubmission();
        const decoded = decodeEssaySubmission(encodeEssaySubmission(original));
        expect(decoded).not.toBeNull();
        expect(decoded!.id).toBe('sub1');
        expect(decoded!.assignmentRubricId).toBe('r1');
        expect(decoded!.assignmentStudentId).toBe('s1');
        expect(decoded!.contentHtml).toBe('<p>My essay text.</p>');
        expect(decoded!.wordCount).toBe(4);
    });

    it('handles HTML with special characters', () => {
        const original = makeSubmission({ contentHtml: '<p>Héllo wörld & "quotes"</p>' });
        const decoded = decodeEssaySubmission(encodeEssaySubmission(original));
        expect(decoded!.contentHtml).toBe('<p>Héllo wörld & "quotes"</p>');
    });

    it('returns null for empty string', () => {
        expect(decodeEssaySubmission('')).toBeNull();
    });

    it('returns null for invalid base64', () => {
        expect(decodeEssaySubmission('!!!not-base64!!!')).toBeNull();
    });

    it('returns null when assignmentRubricId is missing', () => {
        const partial = { assignmentStudentId: 's1', contentHtml: '<p>text</p>' };
        const code = btoa(encodeURIComponent(JSON.stringify(partial)));
        expect(decodeEssaySubmission(code)).toBeNull();
    });

    it('returns null when assignmentStudentId is missing', () => {
        const partial = { assignmentRubricId: 'r1', contentHtml: '<p>text</p>' };
        const code = btoa(encodeURIComponent(JSON.stringify(partial)));
        expect(decodeEssaySubmission(code)).toBeNull();
    });

    it('returns null when contentHtml is missing', () => {
        const partial = { assignmentRubricId: 'r1', assignmentStudentId: 's1' };
        const code = btoa(encodeURIComponent(JSON.stringify(partial)));
        expect(decodeEssaySubmission(code)).toBeNull();
    });

    it('trims whitespace from input', () => {
        const original = makeSubmission();
        const padded = '  ' + encodeEssaySubmission(original) + '\n';
        expect(decodeEssaySubmission(padded)).not.toBeNull();
    });

    it('round-trips wordLimitStatus "over"', () => {
        const original = makeSubmission({ wordLimitStatus: 'over' });
        const decoded = decodeEssaySubmission(encodeEssaySubmission(original));
        expect(decoded!.wordLimitStatus).toBe('over');
    });

    it('round-trips wordLimitStatus "under"', () => {
        const original = makeSubmission({ wordLimitStatus: 'under' });
        const decoded = decodeEssaySubmission(encodeEssaySubmission(original));
        expect(decoded!.wordLimitStatus).toBe('under');
    });

    it('round-trips wordLimitStatus "ok"', () => {
        const original = makeSubmission({ wordLimitStatus: 'ok' });
        const decoded = decodeEssaySubmission(encodeEssaySubmission(original));
        expect(decoded!.wordLimitStatus).toBe('ok');
    });

    it('decodes legacy codes without wordLimitStatus as undefined', () => {
        // Simulate a code produced before wordLimitStatus was added
        const legacy = { assignmentRubricId: 'r1', assignmentStudentId: 's1', contentHtml: '<p>old</p>', wordCount: 1 };
        const code = btoa(encodeURIComponent(JSON.stringify(legacy)));
        const decoded = decodeEssaySubmission(code);
        expect(decoded).not.toBeNull();
        expect(decoded!.wordLimitStatus).toBeUndefined();
    });
});
