import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TestQuestion } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    }),
}));

import StudentAnswerSurface from '../StudentAnswerSurface';
import MatchingAnswer from '../MatchingAnswer';
import ClozeAnswer from '../ClozeAnswer';

const q = (partial: Partial<TestQuestion>): TestQuestion =>
    ({ id: 'q1', prompt: 'p', type: 'true-false', points: 1, ...partial }) as TestQuestion;

describe('true-false labels', () => {
    it('shows custom labels and falls back to True / False', () => {
        const { rerender } = render(
            <StudentAnswerSurface question={q({ trueLabel: 'Yes', falseLabel: 'No' })} value="" onChange={vi.fn()} />
        );
        expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
        rerender(<StudentAnswerSurface question={q({ trueLabel: '  ' })} value="" onChange={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'tests.true_false_true' })).toBeInTheDocument();
    });
});

describe('numeric unit', () => {
    it('shows the unit and ties it to the input', () => {
        render(
            <StudentAnswerSurface question={q({ type: 'numeric', numericUnit: 'cm' })} value="" onChange={vi.fn()} />
        );
        expect(screen.getByRole('spinbutton')).toHaveAccessibleDescription('cm');
    });
});

describe('multiple choice shuffling', () => {
    const options = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, text: `opt-${id}`, isCorrect: id === 'a' }));
    const texts = () => screen.getAllByRole('radio').map((r) => r.getAttribute('value'));

    it('keeps authored order by default and pins the last option when shuffling', () => {
        const { unmount } = render(
            <StudentAnswerSurface
                question={q({ type: 'multiple-choice', options })}
                value=""
                onChange={vi.fn()}
                code="c"
            />
        );
        expect(texts()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
        unmount();
        render(
            <StudentAnswerSurface
                question={q({ type: 'multiple-choice', options, shuffleOptions: true, pinLastOption: true })}
                value=""
                onChange={vi.fn()}
                code="c"
            />
        );
        expect(texts()[5]).toBe('f');
    });
});

describe('matching distractors', () => {
    it('offers distractors as choices that cannot be a correct pairing', () => {
        const onChange = vi.fn();
        render(
            <MatchingAnswer
                question={q({
                    type: 'matching',
                    matchingPairs: [{ id: 'p1', left: 'cat', right: 'chat' }],
                    matchingDistractors: ['chien'],
                })}
                value=""
                onChange={onChange}
                code="c"
            />
        );
        const select = screen.getByRole('combobox');
        expect(screen.getByRole('option', { name: 'chien' })).toBeInTheDocument();
        fireEvent.change(select, { target: { value: 'distractor-0' } });
        expect(JSON.parse(onChange.mock.calls[0][0])).toEqual({ p1: 'distractor-0' });
    });
});

describe('typed cloze gaps', () => {
    it('names each gap, switches off mobile autocorrect and keeps paragraph breaks', () => {
        render(
            <ClozeAnswer
                question={q({ type: 'cloze', prompt: 'First {{one}}.\nSecond {{two}}.' })}
                value=""
                onChange={vi.fn()}
                code="c"
            />
        );
        const first = screen.getByLabelText('tests.taking.cloze_bank_gap_label {"number":1}');
        expect(first).toHaveAttribute('autocapitalize', 'off');
        expect(first).toHaveAttribute('spellcheck', 'false');
        expect(first.closest('p')).toHaveStyle({ whiteSpace: 'pre-wrap' });
    });
});

describe('true-false labels in the printed booklet', () => {
    it('prints the custom wording next to A and B', async () => {
        const { buildExamBookletHtml } = await import('../../../utils/testExamExportHtml');
        const { DEFAULT_EXAM_EXPORT_OPTIONS } = await import('../../../utils/testExamContent');
        const html = buildExamBookletHtml(
            {
                id: 't',
                name: 'T',
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2026-01-01',
                questions: [q({ trueLabel: 'Yes', falseLabel: 'No <b>' })],
            },
            DEFAULT_EXAM_EXPORT_OPTIONS
        );
        expect(html).toContain('&nbsp;&nbsp;Yes</div>');
        expect(html).toContain('No &lt;b&gt;');
    });
});
