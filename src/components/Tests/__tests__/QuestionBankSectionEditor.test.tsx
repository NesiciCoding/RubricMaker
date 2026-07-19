import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import QuestionBankSectionEditor from '../QuestionBankSectionEditor';
import type { QuestionBankItem } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    }),
}));

vi.mock('../../../context/AppContext', () => ({
    useApp: () => ({ settings: {}, addQuestionBankItem: vi.fn() }),
}));

vi.mock('../../Editor/EssayEditor', () => ({
    default: ({
        content,
        onChange,
        placeholder,
    }: {
        content: string;
        onChange: (html: string) => void;
        placeholder?: string;
    }) => (
        <textarea
            aria-label={placeholder || 'tests.question_prompt_label'}
            value={content}
            onChange={(e) => onChange(e.target.value)}
        />
    ),
}));

vi.mock('../../Standards/StandardsPickerModal', () => ({ default: () => null }));
vi.mock('../../CEFR/CefrPickerModal', () => ({ default: () => null }));

type BankSection = NonNullable<QuestionBankItem['section']>;

function makeSection(): BankSection {
    return {
        title: 'Reading passage',
        content: '<p>Once upon a time</p>',
        questions: [
            { id: 'sq1', prompt: 'Question one', type: 'short-answer', points: 1 },
            { id: 'sq2', prompt: 'Question two', type: 'short-answer', points: 1 },
        ],
    };
}

describe('QuestionBankSectionEditor', () => {
    it('edits the title', () => {
        const onChange = vi.fn();
        render(<QuestionBankSectionEditor section={makeSection()} onChange={onChange} />);
        fireEvent.change(screen.getByLabelText('tests.section_name_label'), { target: { value: 'New title' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ title: 'New title' }));
    });

    it('edits passage content', () => {
        const onChange = vi.fn();
        render(<QuestionBankSectionEditor section={makeSection()} onChange={onChange} />);
        fireEvent.change(screen.getByLabelText('tests.section_passage_placeholder'), {
            target: { value: '<p>New passage</p>' },
        });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ content: '<p>New passage</p>' }));
    });

    it('sets an audio URL and shows a preview', () => {
        const onChange = vi.fn();
        const { rerender } = render(<QuestionBankSectionEditor section={makeSection()} onChange={onChange} />);
        const audioInput = document.getElementById('bank-section-audio') as HTMLInputElement;
        fireEvent.change(audioInput, { target: { value: 'https://example.com/audio.mp3' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ audioUrl: 'https://example.com/audio.mp3' }));

        rerender(
            <QuestionBankSectionEditor
                section={{ ...makeSection(), audioUrl: 'https://example.com/audio.mp3' }}
                onChange={onChange}
            />
        );
        expect(screen.getByLabelText('tests.question_audio_preview_alt')).toBeInTheDocument();
    });

    it('adds a new question', () => {
        const onChange = vi.fn();
        render(<QuestionBankSectionEditor section={makeSection()} onChange={onChange} />);
        fireEvent.click(screen.getByText('tests.add_question'));
        const updated = onChange.mock.calls[0][0] as BankSection;
        expect(updated.questions).toHaveLength(3);
    });

    it('removes a question via the nested QuestionEditor remove button', () => {
        const onChange = vi.fn();
        render(<QuestionBankSectionEditor section={makeSection()} onChange={onChange} />);
        fireEvent.click(screen.getAllByLabelText('tests.remove_question')[0]);
        const updated = onChange.mock.calls[0][0] as BankSection;
        expect(updated.questions).toHaveLength(1);
        expect(updated.questions[0].id).toBe('sq2');
    });

    it('reorders questions with move up/down', () => {
        const onChange = vi.fn();
        render(<QuestionBankSectionEditor section={makeSection()} onChange={onChange} />);
        fireEvent.click(screen.getAllByLabelText('questionBank.move_question_down')[0]);
        const updated = onChange.mock.calls[0][0] as BankSection;
        expect(updated.questions.map((q) => q.id)).toEqual(['sq2', 'sq1']);
    });

    it('disables move-up on the first question and move-down on the last', () => {
        render(<QuestionBankSectionEditor section={makeSection()} onChange={vi.fn()} />);
        const upButtons = screen.getAllByLabelText('questionBank.move_question_up');
        const downButtons = screen.getAllByLabelText('questionBank.move_question_down');
        expect(upButtons[0]).toBeDisabled();
        expect(downButtons[downButtons.length - 1]).toBeDisabled();
    });
});
