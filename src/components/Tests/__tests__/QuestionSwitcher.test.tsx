import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import QuestionSwitcher from '../QuestionSwitcher';
import type { TestQuestion, TestSection } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) =>
            opts && Object.keys(opts).length > 0 ? `${key} ${JSON.stringify(opts)}` : key,
        i18n: { language: 'en' },
    }),
}));

const question = (id: string, prompt: string, sectionId?: string): TestQuestion => ({
    id,
    prompt: `<p>${prompt}</p>`,
    type: 'short-answer',
    points: 2,
    sectionId,
});

const questions = [
    question('q1', 'First question'),
    question('q2', 'Second question', 'sec-1'),
    question('q3', 'Third question', 'sec-1'),
];
const sections: TestSection[] = [{ id: 'sec-1', title: 'Part B' }];

function renderSwitcher(overrides: Partial<React.ComponentProps<typeof QuestionSwitcher>> = {}) {
    const onSelectQuestion = vi.fn();
    const onSelectSection = vi.fn();
    const onAdd = vi.fn();
    render(
        <QuestionSwitcher
            questions={questions}
            sections={sections}
            activeQuestionId="q1"
            activeSectionId={null}
            onSelectQuestion={onSelectQuestion}
            onSelectSection={onSelectSection}
            onAdd={onAdd}
            {...overrides}
        />
    );
    return { onSelectQuestion, onSelectSection, onAdd };
}

describe('QuestionSwitcher', () => {
    it('lists every question in display order, grouped by section', () => {
        renderSwitcher();
        const select = screen.getByTestId('switcher-select') as HTMLSelectElement;
        expect(select.value).toBe('q1');

        const options = [...select.querySelectorAll('option')].map((option) => option.textContent);
        expect(options).toEqual(['1. First question', '2. Second question', '3. Third question']);

        const groups = [...select.querySelectorAll('optgroup')].map((group) => group.getAttribute('label'));
        expect(groups).toEqual(['tests.no_section', 'Part B']);
    });

    it('switches questions from the select and from the prev/next buttons', () => {
        const { onSelectQuestion } = renderSwitcher();

        fireEvent.change(screen.getByTestId('switcher-select'), { target: { value: 'q3' } });
        expect(onSelectQuestion).toHaveBeenCalledWith('q3');

        fireEvent.click(screen.getByTestId('switcher-next'));
        expect(onSelectQuestion).toHaveBeenCalledWith('q2');
    });

    it('disables the buttons at the ends of the list', () => {
        const { onSelectQuestion } = renderSwitcher();

        expect(screen.getByTestId('switcher-prev')).toBeDisabled();
        expect(screen.getByTestId('switcher-next')).not.toBeDisabled();

        fireEvent.click(screen.getByTestId('switcher-prev'));
        expect(onSelectQuestion).not.toHaveBeenCalled();
    });

    it('opens a section workspace and adds a question', () => {
        const { onSelectSection, onAdd } = renderSwitcher();

        const chip = screen.getByTestId('switcher-section-sec-1');
        expect(chip).toHaveAttribute('aria-pressed', 'false');
        expect(chip).toHaveAttribute('title', 'Part B');
        fireEvent.click(chip);
        expect(onSelectSection).toHaveBeenCalledWith('sec-1');

        fireEvent.click(screen.getByRole('button', { name: /tests\.add_question/ }));
        expect(onAdd).toHaveBeenCalled();
    });

    it('falls back to the type name for an untitled question', () => {
        renderSwitcher({ questions: [question('blank', '')] });
        const select = screen.getByTestId('switcher-select') as HTMLSelectElement;
        expect(select.querySelector('option')?.textContent).toBe('1. tests.question_type_short_answer');
    });
});

describe('QuestionSwitcher placeholder', () => {
    it('shows what is open instead of a question, and keeps prev/next on the remembered one', () => {
        renderSwitcher({ activeQuestionId: 'q2', activeSectionId: 'sec-1', placeholderLabel: 'Section workspace' });
        const select = screen.getByTestId('switcher-select') as HTMLSelectElement;
        expect(select.value).toBe('');
        expect(select.options[0].textContent).toBe('Section workspace');
        expect(select.options[0].disabled).toBe(true);
        // The arrows still walk from the remembered question, so leaving the workspace is one click.
        expect(screen.getByTestId('switcher-next')).toBeEnabled();
        fireEvent.click(screen.getByTestId('switcher-next'));
        expect(screen.getByTestId('switcher-select')).toHaveValue('');
    });

    it('keeps the question selected when nothing else is open', () => {
        renderSwitcher({ activeQuestionId: 'q2' });
        expect(screen.getByTestId('switcher-select')).toHaveValue('q2');
    });
});
