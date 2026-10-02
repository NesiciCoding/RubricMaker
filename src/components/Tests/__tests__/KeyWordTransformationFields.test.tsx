import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TestQuestion } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    }),
}));

import KeyWordTransformationFields from '../KeyWordTransformationFields';

const base = { id: 'q1', prompt: '', type: 'key-word-transformation', points: 2 } as TestQuestion;

const setup = (question: Partial<TestQuestion> = {}) => {
    const update = vi.fn();
    render(
        <KeyWordTransformationFields question={{ ...base, ...question }} update={update} partialCreditToggle={null} />
    );
    return update;
};

describe('KeyWordTransformationFields', () => {
    it('builds an accepted answer from part chips, joined with //', () => {
        const update = setup();
        const input = screen.getByLabelText(/tests.kwt_part_label/);
        fireEvent.change(input, { target: { value: 'not having studied' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        fireEvent.change(input, { target: { value: 'any harder' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(update).toHaveBeenLastCalledWith({
            expectedAnswers: ['not having studied // any harder'],
            expectedAnswer: undefined,
        });
    });

    it('shows existing answers as cards and adds and removes alternatives', () => {
        const update = setup({ expectedAnswers: ['a // b', 'c // d'] });
        expect(screen.getAllByText(/tests.kwt_answer_card/)).toHaveLength(2);
        fireEvent.click(screen.getByRole('button', { name: /tests.kwt_remove_answer.*"number":1/ }));
        expect(update).toHaveBeenLastCalledWith({ expectedAnswers: ['c // d'], expectedAnswer: undefined });
        fireEvent.click(screen.getByRole('button', { name: /tests.kwt_add_answer/ }));
        expect(screen.getAllByText(/tests.kwt_answer_card/)).toHaveLength(2);
    });

    it('renders the gapped sentence preview with the key word', () => {
        setup({ keyWord: 'studied', gappedSentence: 'Mary regrets ___ harder.' });
        const preview = screen.getByLabelText('tests.kwt_preview_label');
        expect(preview).toHaveTextContent('STUDIED');
        expect(preview).toHaveTextContent('Mary regrets');
    });
});
