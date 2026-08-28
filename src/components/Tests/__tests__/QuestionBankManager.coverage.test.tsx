import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveAs } from 'file-saver';
import QuestionBankManager from '../QuestionBankManager';
import type { QuestionBankItem, TestQuestion } from '../../../types';

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

function makeQuestionBank(): QuestionBankItem[] {
    const richQuestion: TestQuestion = {
        id: 'rich1',
        prompt: 'Rich searchable question',
        type: 'matching',
        points: 3,
        matchingPairs: [{ id: 'mp1', left: 'Left side', right: 'Right side' }],
        orderItems: [{ id: 'oi1', text: 'first step' }],
        categorizeItems: [{ id: 'ci1', text: 'bucket item', categoryId: 'c1' }],
        categories: [{ id: 'c1', label: 'Group one' }],
        options: [{ id: 'op1', text: 'Option text', isCorrect: true }],
        linkedCefrDescriptors: [
            {
                descriptorId: 'd1',
                level: 'A1',
                skill: 'writing',
                descriptionEn: 'Can describe things',
                descriptionNl: 'Kan dingen beschrijven',
            },
        ],
        linkedGrammarItemId: 'gr-present-simple-affirmative',
    };
    return [
        {
            id: 'q1',
            question: richQuestion,
            tags: ['rich'],
            cefrLevel: 'A1',
            createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
            id: 'q2',
            question: { id: 'src2', prompt: 'Plain question', type: 'short-answer', points: 1 },
            tags: [],
            createdAt: '2026-01-02T00:00:00.000Z',
        },
    ];
}

let questionBank: QuestionBankItem[];
const addQuestionBankItems = vi.fn();
const updateQuestionBankItem = vi.fn();
const deleteQuestionBankItem = vi.fn();
const deleteQuestionBankItems = vi.fn();
const bulkUpdateQuestionBankItems = vi.fn();

const makeAppContextMock = () => ({
    questionBank,
    addQuestionBankItems,
    updateQuestionBankItem,
    deleteQuestionBankItem,
    deleteQuestionBankItems,
    bulkUpdateQuestionBankItems,
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

vi.mock('../QuestionBankImportModal', () => ({
    default: ({ onImport, onClose }: { onImport: (items: QuestionBankItem[]) => void; onClose: () => void }) => (
        <>
            <button
                type="button"
                onClick={() => {
                    onImport([
                        {
                            id: 'imp1',
                            question: { id: 'impq1', prompt: 'Imported question', type: 'short-answer', points: 1 },
                            tags: [],
                            createdAt: '2026-01-05T00:00:00.000Z',
                        },
                    ]);
                    onClose();
                }}
            >
                mock-import-confirm
            </button>
            <button type="button" onClick={onClose}>
                mock-import-close
            </button>
        </>
    ),
}));

beforeEach(() => {
    questionBank = makeQuestionBank();
    addQuestionBankItems.mockClear();
    updateQuestionBankItem.mockClear();
    deleteQuestionBankItem.mockClear();
    deleteQuestionBankItems.mockClear();
    bulkUpdateQuestionBankItems.mockClear();
    vi.mocked(saveAs).mockClear();
});

describe('QuestionBankManager coverage', () => {
    it('builds the search index from matching pairs, order items, categorize items, categories, CEFR descriptors and grammar items', () => {
        render(<QuestionBankManager />);
        // The rich item exists; search across every one of its searchable fields.
        for (const term of [
            'Left side',
            'Right side',
            'first step',
            'bucket item',
            'Group one',
            'Can describe',
            'Kan dingen beschrijven',
            'Bevestigend',
            'Option text',
        ]) {
            fireEvent.change(screen.getByPlaceholderText('questionBank.search_placeholder'), {
                target: { value: term },
            });
            expect(screen.getByText('Rich searchable question')).toBeInTheDocument();
            expect(screen.queryByText('Plain question')).toBeNull();
        }
    });

    it('toggles a CEFR chip back off', () => {
        render(<QuestionBankManager />);
        const chip = screen.getByRole('button', { name: 'A1' });
        fireEvent.click(chip);
        expect(screen.getByText('Rich searchable question')).toBeInTheDocument();
        expect(screen.queryByText('Plain question')).toBeNull();
        fireEvent.click(chip);
        expect(screen.getByText('Plain question')).toBeInTheDocument();
    });

    it('filters to items without a CEFR level via the None chip', () => {
        render(<QuestionBankManager />);
        const noneChip = screen.getByRole('button', { name: 'tests.section_cefr_level_none' });
        fireEvent.click(noneChip);
        expect(screen.getByText('Plain question')).toBeInTheDocument();
        expect(screen.queryByText('Rich searchable question')).toBeNull();
        fireEvent.click(noneChip);
        expect(screen.getByText('Rich searchable question')).toBeInTheDocument();
    });

    it('unchecks an item to clear it from the selection', () => {
        render(<QuestionBankManager />);
        const checkboxes = screen.getAllByLabelText('questionBank.select_item_label');
        fireEvent.click(checkboxes[0]);
        expect(screen.getByText('questionBank.bulk_bar_selected_count:{"count":1}')).toBeInTheDocument();
        fireEvent.click(checkboxes[0]);
        expect(screen.queryByText(/bulk_bar_selected_count/)).toBeNull();
    });

    it('select-all toggles off when everything is already selected', () => {
        render(<QuestionBankManager />);
        const selectAll = screen.getByLabelText('questionBank.select_all_hint:{"count":2}');
        fireEvent.click(selectAll);
        expect(screen.getByText('questionBank.bulk_bar_selected_count:{"count":2}')).toBeInTheDocument();
        fireEvent.click(selectAll);
        expect(screen.queryByText(/bulk_bar_selected_count/)).toBeNull();
    });

    it('deselects everything via the bulk-bar close button', () => {
        render(<QuestionBankManager />);
        fireEvent.click(screen.getAllByLabelText('questionBank.select_item_label')[0]);
        expect(screen.getByText('questionBank.bulk_bar_selected_count:{"count":1}')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('common.cancel'));
        expect(screen.queryByText(/bulk_bar_selected_count/)).toBeNull();
    });

    it('keeps the item when the delete confirmation is cancelled', async () => {
        render(<QuestionBankManager />);
        await act(async () => {
            fireEvent.click(screen.getAllByLabelText('common.delete')[0]);
        });
        await act(async () => {
            fireEvent.click(screen.getByText('common.cancel'));
        });
        expect(deleteQuestionBankItem).not.toHaveBeenCalled();
    });

    it('keeps the selection when the bulk delete confirmation is cancelled', async () => {
        render(<QuestionBankManager />);
        fireEvent.click(screen.getAllByLabelText('questionBank.select_item_label')[0]);
        await act(async () => {
            fireEvent.click(screen.getByText('questionBank.bulk_delete_button'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('common.cancel'));
        });
        expect(deleteQuestionBankItems).not.toHaveBeenCalled();
        expect(screen.getByText('questionBank.bulk_bar_selected_count:{"count":1}')).toBeInTheDocument();
    });

    it('ignores empty bulk tag input for both add and remove', () => {
        render(<QuestionBankManager />);
        fireEvent.click(screen.getAllByLabelText('questionBank.select_item_label')[0]);
        fireEvent.click(screen.getByText('questionBank.bulk_add_tags_label'));
        fireEvent.click(screen.getByText('questionBank.bulk_remove_tags_label'));
        expect(bulkUpdateQuestionBankItems).not.toHaveBeenCalled();
    });

    it('exports the bank as JSON via saveAs', () => {
        render(<QuestionBankManager />);
        fireEvent.click(screen.getByText('questionBank.export_button'));
        expect(saveAs).toHaveBeenCalledTimes(1);
        const [blob, filename] = vi.mocked(saveAs).mock.calls[0];
        expect(filename).toBe('question-bank-export.json');
        expect(blob).toBeInstanceOf(Blob);
    });

    it('imports items through the import modal callback and closes it', () => {
        render(<QuestionBankManager />);
        fireEvent.click(screen.getByText('questionBank.import_button'));
        fireEvent.click(screen.getByText('mock-import-confirm'));
        expect(addQuestionBankItems).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ id: 'imp1' })])
        );
        expect(screen.queryByText('mock-import-close')).toBeNull();
    });

    it('closes the import modal without importing', () => {
        render(<QuestionBankManager />);
        fireEvent.click(screen.getByText('questionBank.import_button'));
        fireEvent.click(screen.getByText('mock-import-close'));
        expect(addQuestionBankItems).not.toHaveBeenCalled();
        expect(screen.queryByText('mock-import-confirm')).toBeNull();
    });

    it('selects a pick target with the Enter and Space keys', () => {
        const onSelect = vi.fn();
        render(<QuestionBankManager onSelect={onSelect} />);
        const card = screen.getByText('Plain question').closest('div[role="button"]') as HTMLElement;
        fireEvent.keyDown(card, { key: 'Enter' });
        expect(onSelect).toHaveBeenCalledWith(questionBank[1]);
        fireEvent.keyDown(card, { key: ' ' });
        expect(onSelect).toHaveBeenCalledTimes(2);
    });

    it('indexes bare items, sections without content, and unknown grammar ids; handles manager keys and bulk CEFR clear', () => {
        questionBank = [
            ...makeQuestionBank(),
            // no question and no section → questionsOf [] + prompt/type/points fallbacks
            { id: 'bare', tags: [], cefrLevel: 'B2', createdAt: '2026-03-01T00:00:00.000Z' },
            // section without content → `content ?? ''` fallback
            {
                id: 'sec',
                kind: 'section',
                section: { title: 'No content passage', questions: [] },
                tags: [],
                createdAt: '2026-03-02T00:00:00.000Z',
            },
            // unknown grammar item id → grammarItem lookup misses
            {
                id: 'badg',
                question: { id: 'bg', prompt: 'Bad grammar', type: 'open', points: 1, linkedGrammarItemId: 'gr-nope' },
                tags: [],
                createdAt: '2026-03-03T00:00:00.000Z',
            },
            // linked standards: one with a notation, one without (statementNotation ?? '')
            {
                id: 'stand',
                question: {
                    id: 'stq',
                    prompt: 'Standard question',
                    type: 'open',
                    points: 1,
                    linkedStandards: [
                        { guid: 'g1', statementNotation: 'W.1', description: 'Writes clearly' },
                        { guid: 'g2', description: 'No notation' },
                    ],
                },
                tags: [],
                createdAt: '2026-03-04T00:00:00.000Z',
            },
        ] as QuestionBankItem[];
        render(<QuestionBankManager />);
        // bare item renders the untitled-prompt fallback (and fallback type/points)
        expect(screen.getAllByText('questionBank.untitled_prompt').length).toBeGreaterThan(0);

        // manager-mode keyDown on an item row does nothing (no onSelect)
        const row = screen.getByText('questionBank.untitled_prompt').closest('div') as HTMLElement;
        fireEvent.keyDown(row, { key: 'Enter' });
        fireEvent.keyDown(row, { key: ' ' });

        // bulk-apply CEFR with the "none" value → cefrLevel null
        fireEvent.click(screen.getAllByLabelText('questionBank.select_item_label')[0]);
        const cefrSelect = screen.getByLabelText('questionBank.bulk_set_cefr_label');
        fireEvent.change(cefrSelect, { target: { value: '' } });
        fireEvent.click(screen.getByText('questionBank.bulk_cefr_apply_button'));
        expect(bulkUpdateQuestionBankItems).toHaveBeenCalledWith(expect.any(Array), { cefrLevel: null });
    });

    it('toggles the tag filter chip and highlights it', () => {
        render(<QuestionBankManager />);
        const tagChip = screen.getByRole('button', { name: 'rich' });
        fireEvent.click(tagChip);
        expect(screen.getByText('Rich searchable question')).toBeInTheDocument();
        expect(screen.queryByText('Plain question')).toBeNull();
        expect(tagChip).toHaveClass('btn-primary');
        fireEvent.click(tagChip);
        expect(screen.getByText('Plain question')).toBeInTheDocument();
        expect(tagChip).toHaveClass('btn-secondary');
    });

    it('filters by kind and by question type', () => {
        questionBank = [
            ...makeQuestionBank(),
            {
                id: 'sec2',
                kind: 'section',
                section: {
                    title: 'Reading passage',
                    questions: [{ id: 'sq1', prompt: 'Section question', type: 'open', points: 2 }],
                },
                tags: [],
                createdAt: '2026-04-01T00:00:00.000Z',
            },
        ];
        render(<QuestionBankManager />);
        const kind = screen.getByLabelText('questionBank.filter_kind_label');
        const type = screen.getByLabelText('questionBank.filter_type_label');
        fireEvent.change(kind, { target: { value: 'question' } });
        expect(screen.getByText('Plain question')).toBeInTheDocument();
        expect(screen.queryByText(/section_bundle_title/)).toBeNull();
        fireEvent.change(kind, { target: { value: 'section' } });
        expect(screen.getByText(/section_bundle_title/)).toBeInTheDocument();
        expect(screen.queryByText('Plain question')).toBeNull();
        // a matching type against the section-only bank filters everything out
        fireEvent.change(type, { target: { value: 'matching' } });
        expect(screen.getByText('questionBank.empty_state')).toBeInTheDocument();
        fireEvent.change(type, { target: { value: '' } });
        fireEvent.change(kind, { target: { value: 'all' } });

        fireEvent.change(type, { target: { value: 'matching' } });
        expect(screen.getByText('Rich searchable question')).toBeInTheDocument();
        expect(screen.queryByText('Plain question')).toBeNull();
        fireEvent.change(type, { target: { value: 'short-answer' } });
        expect(screen.getByText('Plain question')).toBeInTheDocument();
        expect(screen.queryByText('Rich searchable question')).toBeNull();
    });

    it('deletes an item after confirmation', async () => {
        render(<QuestionBankManager />);
        await act(async () => {
            fireEvent.click(screen.getAllByLabelText('common.delete')[0]);
        });
        await act(async () => {
            fireEvent.click(screen.getByText('common.delete'));
        });
        expect(deleteQuestionBankItem).toHaveBeenCalledWith('q2');
    });

    it('bulk-deletes after confirmation and clears the selection', async () => {
        render(<QuestionBankManager />);
        fireEvent.click(screen.getAllByLabelText('questionBank.select_item_label')[0]);
        await act(async () => {
            fireEvent.click(screen.getByText('questionBank.bulk_delete_button'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('common.delete'));
        });
        expect(deleteQuestionBankItems).toHaveBeenCalledWith(['q2']);
        expect(screen.queryByText(/bulk_bar_selected_count/)).toBeNull();
    });

    it('bulk-adds and bulk-removes a tag', () => {
        render(<QuestionBankManager />);
        fireEvent.click(screen.getAllByLabelText('questionBank.select_item_label')[0]);
        const input = screen.getByPlaceholderText('questionBank.bulk_tag_input_placeholder');
        fireEvent.change(input, { target: { value: 'newtag' } });
        fireEvent.click(screen.getByText('questionBank.bulk_add_tags_label'));
        expect(bulkUpdateQuestionBankItems).toHaveBeenCalledWith(['q2'], { addTags: ['newtag'] });
        fireEvent.change(input, { target: { value: 'newtag' } });
        fireEvent.click(screen.getByText('questionBank.bulk_remove_tags_label'));
        expect(bulkUpdateQuestionBankItems).toHaveBeenCalledWith(['q2'], { removeTags: ['newtag'] });
    });

    it('edits an item via the editor modal and saves', async () => {
        render(<QuestionBankManager />);
        await act(async () => {
            fireEvent.click(screen.getAllByLabelText('questionBank.edit_button')[0]);
        });
        await act(async () => {
            fireEvent.click(screen.getByText('common.save'));
        });
        expect(updateQuestionBankItem).toHaveBeenCalled();
        expect(screen.queryByText('common.save')).toBeNull();

        // closing via the cancel button hits the modal's onClose arm
        fireEvent.click(screen.getAllByLabelText('questionBank.edit_button')[0]);
        fireEvent.click(screen.getByText('common.cancel'));
        expect(screen.queryByText('common.save')).toBeNull();
    });

    it('picks an item by clicking the card in pick mode', () => {
        const onSelect = vi.fn();
        render(<QuestionBankManager onSelect={onSelect} />);
        fireEvent.click(screen.getByText('Plain question').closest('div[role="button"]') as HTMLElement);
        expect(onSelect).toHaveBeenCalledWith(questionBank[1]);
    });

    it('pages back to the previous page', () => {
        questionBank = Array.from({ length: 30 }, (_, i) => ({
            id: `p${i}`,
            question: { id: `sp${i}`, prompt: `Paginated question ${i}`, type: 'short-answer' as const, points: 1 },
            tags: [],
            createdAt: `2026-02-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
        }));
        render(<QuestionBankManager />);
        fireEvent.click(screen.getByLabelText('questionBank.pagination_next'));
        expect(screen.getByText('questionBank.pagination_page_label:{"current":2,"total":2}')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('questionBank.pagination_prev'));
        expect(screen.getByText('questionBank.pagination_page_label:{"current":1,"total":2}')).toBeInTheDocument();
    });
});
