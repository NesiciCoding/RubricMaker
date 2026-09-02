import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import QuestionBankItemEditorModal from '../QuestionBankItemEditorModal';
import type { QuestionBankItem } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

const makeAppContextMock = () => ({ settings: {}, addQuestionBankItem: vi.fn() });
vi.mock('../../../context/AppContext', () => ({
    useRoster: () => makeAppContextMock(),
    useStudents: () => makeAppContextMock(),
    useClasses: () => makeAppContextMock(),
    useGrading: () => makeAppContextMock(),
    useAuthoring: () => makeAppContextMock(),
    useAssessment: () => makeAppContextMock(),
    useEssays: () => makeAppContextMock(),
    useFlashcards: () => makeAppContextMock(),
    useSettings: () => makeAppContextMock(),
    usePlatform: () => makeAppContextMock(),
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

    it('saves the CEFR skill on a section-kind item', () => {
        const onSave = vi.fn();
        render(<QuestionBankItemEditorModal item={sectionItem} onSave={onSave} onClose={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('questionBank.cefr_skill_label'), { target: { value: 'reading' } });
        fireEvent.click(screen.getByText('common.save'));
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'q2', cefrSkill: 'reading' }));
    });

    it('offers grammar as a skill option and saves it on a question-kind item', () => {
        const onSave = vi.fn();
        render(<QuestionBankItemEditorModal item={questionItem} onSave={onSave} onClose={vi.fn()} />);
        const skillSelect = screen.getByLabelText('questionBank.cefr_skill_label');
        expect(within(skillSelect).getByRole('option', { name: 'Grammar' })).toBeInTheDocument();
        fireEvent.change(skillSelect, { target: { value: 'grammar' } });
        fireEvent.click(screen.getByText('common.save'));
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'q1', cefrSkill: 'grammar' }));
    });

    it('clears the CEFR skill when the any-skill option is selected', () => {
        const onSave = vi.fn();
        render(
            <QuestionBankItemEditorModal
                item={{ ...questionItem, cefrSkill: 'writing' }}
                onSave={onSave}
                onClose={vi.fn()}
            />
        );
        fireEvent.change(screen.getByLabelText('questionBank.cefr_skill_label'), { target: { value: '' } });
        fireEvent.click(screen.getByText('common.save'));
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'q1', cefrSkill: undefined }));
    });

    it('propagates section edits through onChange and saves them', () => {
        const onSave = vi.fn();
        render(<QuestionBankItemEditorModal item={sectionItem} onSave={onSave} onClose={vi.fn()} />);
        fireEvent.change(screen.getByDisplayValue('Reading passage'), { target: { value: 'Updated passage' } });
        fireEvent.click(screen.getByText('common.save'));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: 'section',
                section: expect.objectContaining({ title: 'Updated passage' }),
            })
        );
    });

    it('propagates question edits through onChange and saves them', () => {
        const onSave = vi.fn();
        render(<QuestionBankItemEditorModal item={questionItem} onSave={onSave} onClose={vi.fn()} />);
        fireEvent.change(screen.getByDisplayValue('What is 2 + 2?'), { target: { value: 'What is 3 + 3?' } });
        fireEvent.click(screen.getByText('common.save'));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({ question: expect.objectContaining({ prompt: 'What is 3 + 3?' }) })
        );
    });

    it('clears the CEFR level when the none option is selected', () => {
        const onSave = vi.fn();
        render(<QuestionBankItemEditorModal item={questionItem} onSave={onSave} onClose={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('questionBank.cefr_level_label'), { target: { value: '' } });
        fireEvent.click(screen.getByText('common.save'));
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ cefrLevel: undefined }));
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
