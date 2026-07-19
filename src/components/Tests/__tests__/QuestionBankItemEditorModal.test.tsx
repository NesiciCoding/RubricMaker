import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import QuestionBankItemEditorModal from '../QuestionBankItemEditorModal';
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
    default: ({ content, onChange }: { content: string; onChange: (html: string) => void }) => (
        <textarea aria-label="essay-editor" value={content} onChange={(e) => onChange(e.target.value)} />
    ),
}));

vi.mock('../../Standards/StandardsPickerModal', () => ({ default: () => null }));
vi.mock('../../CEFR/CefrPickerModal', () => ({ default: () => null }));

const questionItem: QuestionBankItem = {
    id: 'q1',
    question: { id: 'src1', prompt: 'What is 2 + 2?', type: 'short-answer', points: 1 },
    tags: ['math'],
    cefrLevel: 'A2',
    createdAt: '2026-01-01T00:00:00.000Z',
};

const sectionItem: QuestionBankItem = {
    id: 'q2',
    kind: 'section',
    section: {
        title: 'Reading passage',
        content: '<p>Once upon a time</p>',
        questions: [{ id: 'sq1', prompt: 'Who is the protagonist?', type: 'short-answer', points: 1 }],
    },
    tags: ['reading'],
    createdAt: '2026-01-02T00:00:00.000Z',
};

describe('QuestionBankItemEditorModal', () => {
    it('renders the question editor for a question-kind item', () => {
        render(<QuestionBankItemEditorModal item={questionItem} onSave={vi.fn()} onClose={vi.fn()} />);
        expect(screen.getByText('questionBank.edit_question_title')).toBeInTheDocument();
        expect(screen.getByDisplayValue('What is 2 + 2?')).toBeInTheDocument();
    });

    it('renders the section editor for a section-kind item', () => {
        render(<QuestionBankItemEditorModal item={sectionItem} onSave={vi.fn()} onClose={vi.fn()} />);
        expect(screen.getByText('questionBank.edit_section_title')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Reading passage')).toBeInTheDocument();
    });

    it('saves edited tags and CEFR level', () => {
        const onSave = vi.fn();
        render(<QuestionBankItemEditorModal item={questionItem} onSave={onSave} onClose={vi.fn()} />);
        fireEvent.change(screen.getByPlaceholderText('questionBank.tags_placeholder'), {
            target: { value: 'math, revised' },
        });
        fireEvent.change(screen.getByLabelText('questionBank.cefr_level_label'), { target: { value: 'B1' } });
        fireEvent.click(screen.getByText('common.save'));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'q1', tags: ['math', 'revised'], cefrLevel: 'B1' })
        );
    });

    it('cancel calls onClose without calling onSave', () => {
        const onSave = vi.fn();
        const onClose = vi.fn();
        render(<QuestionBankItemEditorModal item={questionItem} onSave={onSave} onClose={onClose} />);
        fireEvent.click(screen.getByText('common.cancel'));
        expect(onClose).toHaveBeenCalled();
        expect(onSave).not.toHaveBeenCalled();
    });
});
