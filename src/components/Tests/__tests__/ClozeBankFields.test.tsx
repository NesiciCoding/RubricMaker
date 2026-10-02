import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TestQuestion } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    }),
}));

import ClozeBankFields from '../ClozeBankFields';

const base = { id: 'q1', prompt: 'I {{go}} to {{school}}.', type: 'cloze-bank', points: 2 } as TestQuestion;

describe('ClozeBankFields', () => {
    it('adds and removes distractor chips', () => {
        const update = vi.fn();
        render(<ClozeBankFields question={{ ...base, bankDistractors: ['went'] }} update={update} />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'gone' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(update).toHaveBeenLastCalledWith({ bankDistractors: ['went', 'gone'] });
        fireEvent.click(screen.getByRole('button', { name: /tests.chip_remove.*went/ }));
        expect(update).toHaveBeenLastCalledWith({ bankDistractors: [] });
    });

    it('previews gap answers and distractors together', () => {
        render(<ClozeBankFields question={{ ...base, bankDistractors: ['went'] }} update={vi.fn()} />);
        const preview = screen.getByLabelText('tests.bank_preview_label', { selector: 'div' });
        expect(preview).toHaveTextContent('goschoolwent');
    });

    it('keeps one-per-line editing behind the text toggle', () => {
        const update = vi.fn();
        render(<ClozeBankFields question={{ ...base, bankDistractors: ['went'] }} update={update} />);
        fireEvent.click(screen.getByRole('button', { name: 'tests.edit_as_text' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'went\ngone' } });
        expect(update).toHaveBeenLastCalledWith({ bankDistractors: ['went', 'gone'] });
    });
});
