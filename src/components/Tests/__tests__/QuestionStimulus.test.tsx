import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import QuestionStimulus from '../QuestionStimulus';
import type { TestQuestion } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

function makeQuestion(overrides: Partial<TestQuestion> = {}): TestQuestion {
    return {
        id: 'q1',
        type: 'short-answer',
        prompt: '<p>Prompt</p>',
        points: 1,
        ...overrides,
    };
}

describe('QuestionStimulus', () => {
    it('renders nothing when the question has no media or hint', () => {
        const { container } = render(<QuestionStimulus question={makeQuestion()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the image and the listening stimulus', () => {
        const { container } = render(
            <QuestionStimulus
                question={makeQuestion({
                    imageUrl: 'https://example.com/a.png',
                    audioUrl: 'https://example.com/a.mp3',
                })}
            />
        );
        expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.png');
        expect(container.querySelector('audio')?.getAttribute('src')).toBe('https://example.com/a.mp3');
    });

    it('plays a dictation recording through the dictation player', () => {
        const { container } = render(
            <QuestionStimulus
                question={makeQuestion({ type: 'dictation', audioUrl: 'https://example.com/dict.mp3' })}
            />
        );
        const audio = container.querySelector('audio');
        expect(audio?.getAttribute('src')).toBe('https://example.com/dict.mp3');
        expect(audio?.getAttribute('aria-label')).toBe('tests.taking.dictation_play');
    });

    it('opens the hint on the toggle and closes it again', () => {
        render(<QuestionStimulus question={makeQuestion({ hint: 'Think about irregular verbs.' })} />);
        expect(screen.queryByText('Think about irregular verbs.')).not.toBeInTheDocument();

        const button = screen.getByRole('button', { name: /tests.taking.hint_show/ });
        expect(button).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(button);
        expect(screen.getByText('Think about irregular verbs.')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /tests.taking.hint_hide/ }));
        expect(screen.queryByText('Think about irregular verbs.')).not.toBeInTheDocument();
    });

    it('starts with the hint closed when the question changes', () => {
        const { rerender } = render(<QuestionStimulus question={makeQuestion({ hint: 'First hint' })} />);
        fireEvent.click(screen.getByRole('button', { name: /tests.taking.hint_show/ }));
        expect(screen.getByText('First hint')).toBeInTheDocument();

        rerender(<QuestionStimulus question={makeQuestion({ id: 'q2', hint: 'Second hint' })} />);
        expect(screen.queryByText('Second hint')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /tests.taking.hint_show/ })).toBeInTheDocument();
    });
});
