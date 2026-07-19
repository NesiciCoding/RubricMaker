import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import QuestionBankManager from '../QuestionBankManager';
import type { QuestionBankItem } from '../../../types';

function makeQuestionBank(): QuestionBankItem[] {
    return [
        {
            id: 'q1',
            question: { id: 'src1', prompt: 'What is 2 + 2?', type: 'short-answer', points: 1 },
            tags: ['math', 'easy'],
            createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
            id: 'q2',
            question: {
                id: 'src2',
                prompt: 'Name a primary color.',
                type: 'multiple-choice',
                points: 2,
                options: [
                    { id: 'o1', text: 'Crimson', isCorrect: true },
                    { id: 'o2', text: 'Blue', isCorrect: false },
                ],
            },
            tags: ['art'],
            cefrLevel: 'A2',
            createdAt: '2026-01-02T00:00:00.000Z',
        },
        {
            id: 'q3',
            kind: 'section',
            section: {
                title: 'Reading passage',
                content: '<p>The quick brown fox jumps</p>',
                questions: [{ id: 'sq1', prompt: 'What animal?', type: 'short-answer', points: 1 }],
            },
            tags: ['reading'],
            cefrLevel: 'B1',
            createdAt: '2026-01-03T00:00:00.000Z',
        },
        {
            id: 'q4',
            question: {
                id: 'src4',
                prompt: 'Standards-linked question',
                type: 'open',
                points: 1,
                linkedStandards: [
                    {
                        guid: 'g1',
                        statementNotation: 'CCSS.ELA.1',
                        description: 'Cite textual evidence',
                        standardSetTitle: 'x',
                        jurisdictionTitle: 'y',
                    },
                ],
            },
            tags: [],
            createdAt: '2026-01-04T00:00:00.000Z',
        },
    ];
}

let questionBank: QuestionBankItem[];
const addQuestionBankItems = vi.fn();
const updateQuestionBankItem = vi.fn();
const deleteQuestionBankItem = vi.fn();
const deleteQuestionBankItems = vi.fn();
const bulkUpdateQuestionBankItems = vi.fn();

vi.mock('../../../context/AppContext', () => ({
    useApp: () => ({
        questionBank,
        addQuestionBankItems,
        updateQuestionBankItem,
        deleteQuestionBankItem,
        deleteQuestionBankItems,
        bulkUpdateQuestionBankItems,
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    }),
}));

vi.mock('../../Editor/EssayEditor', () => ({
    default: ({ content, onChange }: { content: string; onChange: (html: string) => void }) => (
        <textarea aria-label="essay-editor" value={content} onChange={(e) => onChange(e.target.value)} />
    ),
}));

vi.mock('../../Standards/StandardsPickerModal', () => ({ default: () => null }));
vi.mock('../../CEFR/CefrPickerModal', () => ({ default: () => null }));

beforeEach(() => {
    questionBank = makeQuestionBank();
    addQuestionBankItems.mockClear();
    updateQuestionBankItem.mockClear();
    deleteQuestionBankItem.mockClear();
    deleteQuestionBankItems.mockClear();
    bulkUpdateQuestionBankItems.mockClear();
});

describe('QuestionBankManager', () => {
    it('lists all bank items by default', () => {
        render(<QuestionBankManager />);
        expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
        expect(screen.getByText('Name a primary color.')).toBeInTheDocument();
    });

    it('filters by search term across prompt and tags', () => {
        render(<QuestionBankManager />);
        fireEvent.change(screen.getByPlaceholderText('questionBank.search_placeholder'), {
            target: { value: 'primary' },
        });
        expect(screen.queryByText('What is 2 + 2?')).toBeNull();
        expect(screen.getByText('Name a primary color.')).toBeInTheDocument();
    });

    it('search matches option text', () => {
        render(<QuestionBankManager />);
        fireEvent.change(screen.getByPlaceholderText('questionBank.search_placeholder'), {
            target: { value: 'crimson' },
        });
        expect(screen.getByText('Name a primary color.')).toBeInTheDocument();
        expect(screen.queryByText('What is 2 + 2?')).toBeNull();
    });

    it('search matches stripped section passage content', () => {
        render(<QuestionBankManager />);
        fireEvent.change(screen.getByPlaceholderText('questionBank.search_placeholder'), {
            target: { value: 'brown fox' },
        });
        expect(screen.getByText('questionBank.section_bundle_title:{"title":"Reading passage"}')).toBeInTheDocument();
        expect(screen.queryByText('What is 2 + 2?')).toBeNull();
    });

    it('search matches linked standards notation and description', () => {
        render(<QuestionBankManager />);
        fireEvent.change(screen.getByPlaceholderText('questionBank.search_placeholder'), {
            target: { value: 'CCSS.ELA.1' },
        });
        expect(screen.getByText('Standards-linked question')).toBeInTheDocument();
        expect(screen.queryByText('What is 2 + 2?')).toBeNull();
    });

    it('filters by tag chip toggle', () => {
        render(<QuestionBankManager />);
        const mathChip = screen.getByRole('button', { name: 'math' });
        fireEvent.click(mathChip);
        expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
        expect(screen.queryByText('Name a primary color.')).toBeNull();
        fireEvent.click(mathChip);
        expect(screen.getByText('Name a primary color.')).toBeInTheDocument();
    });

    it('filters by CEFR level chip', () => {
        render(<QuestionBankManager />);
        fireEvent.click(screen.getByRole('button', { name: 'B1' }));
        expect(screen.getByText('questionBank.section_bundle_title:{"title":"Reading passage"}')).toBeInTheDocument();
        expect(screen.queryByText('What is 2 + 2?')).toBeNull();
        expect(screen.queryByText('Name a primary color.')).toBeNull();
    });

    it('filters by kind (question vs section)', () => {
        render(<QuestionBankManager />);
        fireEvent.change(screen.getByLabelText('questionBank.filter_kind_label'), { target: { value: 'section' } });
        expect(screen.getByText('questionBank.section_bundle_title:{"title":"Reading passage"}')).toBeInTheDocument();
        expect(screen.queryByText('What is 2 + 2?')).toBeNull();
    });

    it('filters by question type', () => {
        render(<QuestionBankManager />);
        fireEvent.change(screen.getByLabelText('questionBank.filter_type_label'), {
            target: { value: 'multiple-choice' },
        });
        expect(screen.getByText('Name a primary color.')).toBeInTheDocument();
        expect(screen.queryByText('What is 2 + 2?')).toBeNull();
    });

    it('deletes a single item after confirming', async () => {
        render(<QuestionBankManager />);
        await act(async () => {
            fireEvent.click(screen.getAllByLabelText('common.delete')[0]);
        });
        await act(async () => {
            fireEvent.click(screen.getByText('common.delete'));
        });
        expect(deleteQuestionBankItem).toHaveBeenCalledWith('q4');
    });

    it('opens the edit modal and saves tag changes', async () => {
        render(<QuestionBankManager />);
        fireEvent.click(screen.getAllByLabelText('questionBank.edit_button')[0]);
        expect(screen.getByText('questionBank.edit_question_title')).toBeInTheDocument();
        const tagsInput = screen.getByPlaceholderText('questionBank.tags_placeholder');
        fireEvent.change(tagsInput, { target: { value: 'revised' } });
        fireEvent.click(screen.getByText('common.save'));
        expect(updateQuestionBankItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'q4', tags: ['revised'] }));
    });

    it('cancels an edit without saving', () => {
        render(<QuestionBankManager />);
        fireEvent.click(screen.getAllByLabelText('questionBank.edit_button')[0]);
        fireEvent.click(screen.getByText('common.cancel'));
        expect(updateQuestionBankItem).not.toHaveBeenCalled();
        expect(screen.queryByText('questionBank.edit_question_title')).toBeNull();
    });

    it('selects items and bulk-deletes after confirming', async () => {
        render(<QuestionBankManager />);
        const checkboxes = screen.getAllByLabelText('questionBank.select_item_label');
        fireEvent.click(checkboxes[0]);
        fireEvent.click(checkboxes[1]);
        expect(screen.getByText('questionBank.bulk_bar_selected_count:{"count":2}')).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(screen.getByText('questionBank.bulk_delete_button'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('common.delete'));
        });
        expect(deleteQuestionBankItems).toHaveBeenCalled();
        expect(deleteQuestionBankItems.mock.calls[0][0]).toHaveLength(2);
    });

    it('bulk-adds and bulk-removes a tag on selected items', () => {
        render(<QuestionBankManager />);
        const checkboxes = screen.getAllByLabelText('questionBank.select_item_label');
        fireEvent.click(checkboxes[0]);
        const tagInput = screen.getByPlaceholderText('questionBank.bulk_tag_input_placeholder');
        fireEvent.change(tagInput, { target: { value: 'reviewed' } });
        fireEvent.click(screen.getByText('questionBank.bulk_add_tags_label'));
        expect(bulkUpdateQuestionBankItems).toHaveBeenCalledWith(['q4'], { addTags: ['reviewed'] });

        fireEvent.change(tagInput, { target: { value: 'reviewed' } });
        fireEvent.click(screen.getByText('questionBank.bulk_remove_tags_label'));
        expect(bulkUpdateQuestionBankItems).toHaveBeenCalledWith(['q4'], { removeTags: ['reviewed'] });
    });

    it('bulk-applies a CEFR level to selected items', () => {
        render(<QuestionBankManager />);
        const checkboxes = screen.getAllByLabelText('questionBank.select_item_label');
        fireEvent.click(checkboxes[0]);
        fireEvent.change(screen.getByLabelText('questionBank.bulk_set_cefr_label'), { target: { value: 'B2' } });
        fireEvent.click(screen.getByText('questionBank.bulk_cefr_apply_button'));
        expect(bulkUpdateQuestionBankItems).toHaveBeenCalledWith(['q4'], { cefrLevel: 'B2' });
    });

    it('select-all selects every filtered item, not just the visible page', () => {
        render(<QuestionBankManager />);
        fireEvent.click(screen.getByLabelText('questionBank.select_all_hint:{"count":4}'));
        expect(screen.getByText('questionBank.bulk_bar_selected_count:{"count":4}')).toBeInTheDocument();
    });

    it('clears selection when the search term changes', () => {
        render(<QuestionBankManager />);
        const checkboxes = screen.getAllByLabelText('questionBank.select_item_label');
        fireEvent.click(checkboxes[0]);
        expect(screen.getByText('questionBank.bulk_bar_selected_count:{"count":1}')).toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText('questionBank.search_placeholder'), {
            target: { value: 'math' },
        });
        expect(screen.queryByText(/bulk_bar_selected_count/)).toBeNull();
    });

    it('paginates when there are more than 25 matching items', () => {
        questionBank = Array.from({ length: 30 }, (_, i) => ({
            id: `p${i}`,
            question: { id: `sp${i}`, prompt: `Paginated question ${i}`, type: 'short-answer' as const, points: 1 },
            tags: [],
            createdAt: `2026-02-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
        }));
        render(<QuestionBankManager />);
        expect(screen.getAllByLabelText('questionBank.select_item_label')).toHaveLength(25);
        expect(screen.getByText('questionBank.pagination_page_label:{"current":1,"total":2}')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('questionBank.pagination_next'));
        expect(screen.getAllByLabelText('questionBank.select_item_label')).toHaveLength(5);
    });

    it('resets to page 1 when a filter changes', () => {
        questionBank = Array.from({ length: 30 }, (_, i) => ({
            id: `p${i}`,
            question: { id: `sp${i}`, prompt: `Paginated question ${i}`, type: 'short-answer' as const, points: 1 },
            tags: [],
            createdAt: `2026-02-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
        }));
        render(<QuestionBankManager />);
        fireEvent.click(screen.getByLabelText('questionBank.pagination_next'));
        expect(screen.getByText('questionBank.pagination_page_label:{"current":2,"total":2}')).toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText('questionBank.search_placeholder'), {
            target: { value: 'Paginated' },
        });
        expect(screen.getByText('questionBank.pagination_page_label:{"current":1,"total":2}')).toBeInTheDocument();
    });

    it('renders as a pick target and calls onSelect, with no manager-only controls', () => {
        const onSelect = vi.fn();
        render(<QuestionBankManager onSelect={onSelect} />);
        fireEvent.click(screen.getByText('What is 2 + 2?'));
        expect(onSelect).toHaveBeenCalledWith(questionBank[0]);
        expect(screen.queryByLabelText('questionBank.select_item_label')).toBeNull();
        expect(screen.queryByLabelText('questionBank.edit_button')).toBeNull();
        expect(screen.queryByLabelText('common.delete')).toBeNull();
    });

    it('shows the empty state when the bank has no matches', () => {
        render(<QuestionBankManager />);
        fireEvent.change(screen.getByPlaceholderText('questionBank.search_placeholder'), {
            target: { value: 'nothing matches this' },
        });
        expect(screen.getByText('questionBank.empty_state')).toBeInTheDocument();
    });
});
