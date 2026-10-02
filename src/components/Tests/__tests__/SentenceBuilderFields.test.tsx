import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TestQuestion } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    }),
}));

import SentenceBuilderFields from '../SentenceBuilderFields';

const base = { id: 'q1', prompt: '', type: 'sentence-builder', points: 1 } as TestQuestion;

describe('SentenceBuilderFields', () => {
    it('lets the teacher type a second sentence on a new line', () => {
        const update = vi.fn();
        render(<SentenceBuilderFields question={{ ...base, sentenceTargets: ['I go home'] }} update={update} />);
        const box = screen.getByRole('textbox') as HTMLTextAreaElement;
        fireEvent.change(box, { target: { value: 'I go home\n' } });
        expect(box.value).toBe('I go home\n');
        fireEvent.change(box, { target: { value: 'I go home\nHome I go' } });
        expect(update).toHaveBeenLastCalledWith({ sentenceTargets: ['I go home', 'Home I go'] });
    });

    it('warns when an alternative uses different words than the first sentence', () => {
        render(
            <SentenceBuilderFields
                question={{ ...base, sentenceTargets: ['I go home', 'Home I go', 'I walk home'] }}
                update={vi.fn()}
            />
        );
        expect(screen.getByRole('alert')).toHaveTextContent('"lines":"3"');
    });
});
