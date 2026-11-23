import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import type { Test, TestQuestion } from '../../../types';
import { DEFAULT_EXAM_EXPORT_OPTIONS } from '../../../utils/testExamContent';
import { buildExamBookletHtml } from '../../../utils/testExamExportHtml';
import StudentQuestionCard, { speakableQuestionText } from '../StudentQuestionCard';

const question: TestQuestion = {
    id: 'q1',
    type: 'cloze',
    points: 2,
    prompt: 'The {{cat}} sat.',
    clozeIntro: '<p>Read the <strong>rules</strong> first.</p>',
};

describe('cloze intro', () => {
    it('is read aloud before the gap text, with gaps still blanked', () => {
        expect(speakableQuestionText(question, 'blank')).toBe('Read the rules first.. The blank sat.');
    });

    it('is not read aloud for a question that is no longer a cloze', () => {
        const retyped: TestQuestion = { ...question, type: 'short-answer', prompt: 'Name it' };
        expect(speakableQuestionText(retyped, 'blank')).toBe('Name it');
    });

    it('is shown to students above the gaps, formatted', () => {
        render(<StudentQuestionCard question={question} index={0} total={1} value="" onChange={vi.fn()} code="c" />);
        expect(screen.getByText('rules').tagName).toBe('STRONG');
    });

    it('is printed in the exam booklet, but not for other question types', () => {
        const test = (q: TestQuestion): Test => ({
            id: 't',
            name: 'T',
            requireSEB: false,
            shuffleQuestions: false,
            createdAt: '2026-01-01',
            questions: [q],
        });
        const html = buildExamBookletHtml(test(question), DEFAULT_EXAM_EXPORT_OPTIONS);
        expect(html).toContain('<strong>rules</strong>');
        const other = buildExamBookletHtml(
            test({ ...question, type: 'short-answer', prompt: 'Name it', clozeIntro: undefined }),
            DEFAULT_EXAM_EXPORT_OPTIONS
        );
        expect(other).not.toContain('rules');
    });
});
