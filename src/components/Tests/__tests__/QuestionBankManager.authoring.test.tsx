import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import QuestionBankManager from '../QuestionBankManager';
import { findDuplicatePromptItem } from '../../../utils/questionBankItems';
import { exportQuestionBankJson } from '../../../utils/questionBankImport';
import type { QuestionBankItem } from '../../../types';

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

vi.mock('../../../utils/questionBankImport', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../utils/questionBankImport')>();
    return { ...actual, exportQuestionBankJson: vi.fn(() => '{"items":[]}') };
});

vi.mock('../../Editor/EssayEditor', () => ({
    default: ({ content, onChange }: { content: string; onChange: (html: string) => void }) => (
        <textarea aria-label="essay-editor" value={content} onChange={(e) => onChange(e.target.value)} />
    ),
}));
vi.mock('../../Standards/StandardsPickerModal', () => ({ default: () => null }));
vi.mock('../../CEFR/CefrPickerModal', () => ({ default: () => null }));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

function item(id: string, prompt: string, createdAt: string): QuestionBankItem {
    return {
        id,
        question: { id: `src-${id}`, prompt, type: 'short-answer', points: 1 },
        tags: [],
        createdAt,
        updatedAt: createdAt,
    };
}

let questionBank: QuestionBankItem[];
const addQuestionBankItems = vi.fn();
const updateQuestionBankItem = vi.fn();

const makeAppContextMock = () => ({
    questionBank,
    addQuestionBankItems,
    updateQuestionBankItem,
    deleteQuestionBankItem: vi.fn(),
    deleteQuestionBankItems: vi.fn(),
    bulkUpdateQuestionBankItems: vi.fn(),
});

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

beforeEach(() => {
    questionBank = [
        item('zebra', 'Zebra question', '2026-01-02T00:00:00.000Z'),
        item('apple', 'Apple question', '2026-01-01T00:00:00.000Z'),
    ];
    addQuestionBankItems.mockClear();
    updateQuestionBankItem.mockClear();
    vi.mocked(exportQuestionBankJson).mockClear();
});

describe('QuestionBankManager authoring', () => {
    it('creates a blank question through the item editor and adds it to the bank', () => {
        render(<QuestionBankManager />);

        fireEvent.click(screen.getByRole('button', { name: /questionBank\.new_button/ }));
        expect(screen.getByRole('heading', { name: 'questionBank.create_question_title' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

        expect(addQuestionBankItems).toHaveBeenCalledTimes(1);
        const [items] = addQuestionBankItems.mock.calls[0];
        expect(items).toHaveLength(1);
        expect(items[0]).not.toHaveProperty('id');
        expect(items[0].question.prompt).toBe('');
        expect(updateQuestionBankItem).not.toHaveBeenCalled();
    });

    it('sorts by prompt when A–Z is chosen', () => {
        const { container } = render(<QuestionBankManager />);

        expect(container.textContent?.indexOf('Zebra question')).toBeLessThan(
            container.textContent?.indexOf('Apple question') ?? -1
        );

        fireEvent.change(screen.getByLabelText('questionBank.sort_label'), { target: { value: 'prompt' } });

        expect(container.textContent?.indexOf('Apple question')).toBeLessThan(
            container.textContent?.indexOf('Zebra question') ?? -1
        );
    });

    it('exports only the filtered items', () => {
        render(<QuestionBankManager />);

        fireEvent.change(screen.getByPlaceholderText('questionBank.search_placeholder'), {
            target: { value: 'Zebra' },
        });
        fireEvent.click(screen.getByRole('button', { name: /questionBank\.export_button/ }));

        expect(exportQuestionBankJson).toHaveBeenCalledTimes(1);
        const [exported] = vi.mocked(exportQuestionBankJson).mock.calls[0];
        expect(exported.map((i) => i.id)).toEqual(['zebra']);
    });

    it('finds an existing item that repeats a prompt, ignoring the edited item itself', () => {
        const candidate = item('new', 'zebra QUESTION', '2026-02-01T00:00:00.000Z');

        expect(findDuplicatePromptItem(questionBank, candidate)?.id).toBe('zebra');
        expect(findDuplicatePromptItem(questionBank, candidate, 'zebra')).toBeUndefined();
        expect(findDuplicatePromptItem(questionBank, item('blank', '', '2026-02-01T00:00:00.000Z'))).toBeUndefined();
    });
});
