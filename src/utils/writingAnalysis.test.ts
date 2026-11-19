import { describe, it, expect } from 'vitest';
import { analyzeDraft, draftChanges, EMPTY_DRAFT_STATS } from './writingAnalysis';

describe('analyzeDraft', () => {
    it('measures a short draft', () => {
        const stats = analyzeDraft(
            'The school is near the park. Students however walk to school every day, and the school is busy.'
        );
        expect(stats.words).toBe(18);
        expect(stats.sentences).toBe(2);
        expect(stats.paragraphs).toBe(1);
        expect(stats.avgSentenceWords).toBe(9);
        expect(stats.longestSentenceWords).toBe(12);
        expect(stats.linkingWords).toEqual(['however']);
    });

    it('counts paragraphs from blank lines', () => {
        const stats = analyzeDraft('One idea here.\n\nA second paragraph follows.');
        expect(stats.paragraphs).toBe(2);
        expect(stats.sentences).toBe(2);
    });

    it('surfaces words repeated four or more times', () => {
        const stats = analyzeDraft('students students students students learn together.');
        expect(stats.repeatedWords[0]).toEqual({ word: 'students', count: 4 });
    });

    it('returns empty stats for blank text', () => {
        expect(analyzeDraft('   ')).toEqual(EMPTY_DRAFT_STATS);
    });
});

describe('draftChanges', () => {
    it('marks the tail added since the previous snapshot', () => {
        expect(draftChanges('The autumn leaves', 'The autumn leaves fell gently.')).toEqual({
            kept: 'The autumn leaves',
            added: 'fell gently.',
        });
    });

    it('leaves the closing punctuation with the kept text, not the highlight', () => {
        expect(draftChanges('The autumn leaves', 'The autumn leaves. They fell gently.')).toEqual({
            kept: 'The autumn leaves.',
            added: 'They fell gently.',
        });
    });

    it('treats the whole draft as new when nothing was shared', () => {
        expect(draftChanges('One idea', 'A different opening')).toEqual({ kept: '', added: 'A different opening' });
    });

    it('keeps everything when the student deleted text', () => {
        expect(draftChanges('The autumn leaves fell gently', 'The autumn leaves')).toEqual({
            kept: 'The autumn leaves',
            added: '',
        });
    });

    it('handles an empty previous snapshot', () => {
        expect(draftChanges('', 'First words')).toEqual({ kept: '', added: 'First words' });
    });
});
