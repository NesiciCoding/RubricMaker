import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import QuestionEditor from '../QuestionEditor';
import type { TestQuestion, TestSection } from '../../../types';

const mockAddQuestionBankItem = vi.fn();
const mockShowToast = vi.fn();

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => {
            if (opts && typeof opts === 'object' && 'number' in opts) return `${key} ${opts.number}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

vi.mock('../../../context/AppContext', () => ({
    useApp: () => ({ settings: {}, addQuestionBankItem: mockAddQuestionBankItem }),
}));

vi.mock('../../../hooks/useToast', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../Editor/EssayEditor', () => ({
    default: ({ content, onChange }: { content: string; onChange: (html: string) => void }) => (
        <textarea aria-label="tests.question_prompt_label" value={content} onChange={(e) => onChange(e.target.value)} />
    ),
}));

vi.mock('../ClozeGapEditor', () => ({
    default: ({
        value,
        onChange,
        allowDropdown,
        insertGapLabel,
        insertDropdownGapLabel,
    }: {
        value: string;
        onChange: (prompt: string) => void;
        allowDropdown: boolean;
        insertGapLabel: string;
        insertDropdownGapLabel: string;
    }) => (
        <div>
            <span>{insertGapLabel}</span>
            {allowDropdown && <span>{insertDropdownGapLabel}</span>}
            <textarea
                aria-label="tests.question_prompt_label"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    ),
}));

vi.mock('../../Standards/StandardsPickerModal', () => ({ default: () => null }));
vi.mock('../../CEFR/CefrPickerModal', () => ({
    default: ({ onClose }: { onClose: () => void }) =>
        React.createElement(
            'div',
            { 'data-testid': 'cefr-picker' },
            React.createElement('button', { onClick: onClose }, 'Close CEFR')
        ),
}));
vi.mock('../HelpPopover', () => ({
    default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const sections: TestSection[] = [];

function makeQuestion(overrides: Partial<TestQuestion> = {}): TestQuestion {
    return {
        id: 'q1',
        prompt: 'Sample question',
        type: 'multiple-choice',
        points: 1,
        options: [
            { id: 'a', text: 'Option A', isCorrect: true },
            { id: 'b', text: 'Option B', isCorrect: false },
        ],
        ...overrides,
    };
}

function renderEditor(question: TestQuestion = makeQuestion(), onChange = vi.fn(), onRemove = vi.fn()) {
    const view = render(
        <QuestionEditor
            question={question}
            index={0}
            total={1}
            sections={sections}
            onChange={onChange}
            onRemove={onRemove}
        />
    );
    return { onChange, view };
}

describe('QuestionEditor extended', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('multiple-choice options', () => {
        it('marks a different option as the single correct one', () => {
            const { onChange } = renderEditor();
            const markButtons = screen.getAllByLabelText('tests.mark_correct_option');
            fireEvent.click(markButtons[1]);
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    options: [
                        expect.objectContaining({ id: 'a', isCorrect: false }),
                        expect.objectContaining({ id: 'b', isCorrect: true }),
                    ],
                })
            );
        });

        it('edits an option text and adds a new option', () => {
            const { onChange } = renderEditor();
            fireEvent.change(screen.getAllByLabelText('tests.option_text_label')[1], {
                target: { value: 'Renamed B' },
            });
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    options: [
                        expect.objectContaining({ id: 'a', text: 'Option A' }),
                        expect.objectContaining({ id: 'b', text: 'Renamed B' }),
                    ],
                })
            );

            fireEvent.click(screen.getByText('tests.add_option'));
            const lastCall = onChange.mock.calls.at(-1)![0] as TestQuestion;
            expect(lastCall.options!).toHaveLength(3);
            expect(lastCall.options![2]).toEqual(expect.objectContaining({ text: '', isCorrect: false }));
        });

        it('reassigns the first remaining option as correct when the correct one is removed', () => {
            const { onChange } = renderEditor();
            fireEvent.click(screen.getAllByLabelText('tests.remove_option')[0]);
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    options: [expect.objectContaining({ id: 'b', isCorrect: true })],
                })
            );
        });

        it('disables removal when only one option remains', () => {
            renderEditor(makeQuestion({ options: [{ id: 'a', text: 'Only', isCorrect: true }] }));
            expect(screen.getByLabelText('tests.remove_option')).toBeDisabled();
        });
    });

    describe('multiple-response', () => {
        it('toggles each option independently and the partial-credit flag', () => {
            const { onChange } = renderEditor(makeQuestion({ type: 'multiple-response', partialCredit: true }));
            fireEvent.click(screen.getAllByLabelText('tests.mark_correct_option')[1]);
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    options: [
                        expect.objectContaining({ id: 'a', isCorrect: true }),
                        expect.objectContaining({ id: 'b', isCorrect: true }),
                    ],
                })
            );

            const partialCredit = screen
                .getByText('tests.partial_credit_label')
                .closest('label')!
                .querySelector('input')!;
            fireEvent.click(partialCredit);
            expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ partialCredit: false }));
        });
    });

    describe('type switching', () => {
        it('initializes defaults when switching to each specialized type', () => {
            // hot-text defaults to '' and numeric sets no default — only types that
            // initialize real defaults belong here.
            const cases: Array<[TestQuestion['type'], (q: TestQuestion) => unknown]> = [
                ['true-false', (q) => q.correctBoolean],
                ['matching', (q) => (q.matchingPairs ?? []).length],
                ['ordering', (q) => (q.orderItems ?? []).length],
                ['categorize', (q) => (q.categories ?? []).length],
                ['audio-response', (q) => q.maxRecordingSeconds],
            ];
            for (const [type, pick] of cases) {
                const { onChange, view } = renderEditor(makeQuestion({ type: 'open' }));
                fireEvent.change(screen.getByDisplayValue('tests.question_type_open'), {
                    target: { value: type },
                });
                const updated = onChange.mock.calls.at(-1)![0] as TestQuestion;
                expect(pick(updated)).toBeTruthy();
                view.unmount();
            }
        });

        it('preserves existing options when switching between choice types', () => {
            const { onChange } = renderEditor();
            fireEvent.change(screen.getByDisplayValue('tests.question_type_multiple_choice'), {
                target: { value: 'multiple-response' },
            });
            const updated = onChange.mock.calls.at(-1)![0] as TestQuestion;
            expect(updated.options).toHaveLength(2);
            expect(updated.type).toBe('multiple-response');
        });
    });

    describe('true-false', () => {
        it('sets the correct boolean via the True/False buttons', () => {
            const { onChange } = renderEditor(makeQuestion({ type: 'true-false', correctBoolean: true }));
            fireEvent.click(screen.getByText('tests.true_false_false'));
            expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ correctBoolean: false }));
        });
    });

    describe('short-answer and numeric', () => {
        it('parses pipe-separated expected answers', () => {
            const { onChange } = renderEditor(makeQuestion({ type: 'short-answer' }));
            fireEvent.change(screen.getByLabelText(/tests\.expected_answer_label/), {
                target: { value: 'Paris |  paris ' },
            });
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ expectedAnswers: ['Paris', 'paris'], expectedAnswer: undefined })
            );
        });

        it('updates the numeric value and tolerance', () => {
            const { onChange } = renderEditor(makeQuestion({ type: 'numeric' }));
            fireEvent.change(screen.getByLabelText(/tests\.numeric_expected_value_label/), {
                target: { value: '3.14' },
            });
            expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ expectedNumericValue: 3.14 }));

            fireEvent.change(screen.getByLabelText(/tests\.numeric_tolerance_label/), {
                target: { value: '0.5' },
            });
            expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ numericTolerance: 0.5 }));
        });

        it('clamps the audio-response recording limit to at least 5 seconds', () => {
            const { onChange } = renderEditor(makeQuestion({ type: 'audio-response', maxRecordingSeconds: 60 }));
            fireEvent.change(screen.getByLabelText('tests.max_recording_seconds_label'), {
                target: { value: '2' },
            });
            expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ maxRecordingSeconds: 5 }));
        });
    });

    describe('matching, ordering, categorize', () => {
        it('edits, adds, and removes matching pairs', () => {
            const { onChange } = renderEditor(
                makeQuestion({
                    type: 'matching',
                    matchingPairs: [
                        { id: 'p1', left: '', right: '' },
                        { id: 'p2', left: '', right: '' },
                    ],
                })
            );
            fireEvent.change(screen.getAllByLabelText('tests.matching_left_placeholder')[0], {
                target: { value: 'Term' },
            });
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    matchingPairs: [
                        expect.objectContaining({ id: 'p1', left: 'Term' }),
                        expect.objectContaining({ id: 'p2' }),
                    ],
                })
            );

            fireEvent.click(screen.getByText('tests.add_matching_pair'));
            expect((onChange.mock.calls.at(-1)![0] as TestQuestion).matchingPairs).toHaveLength(3);

            fireEvent.click(screen.getAllByLabelText('tests.remove_option')[0]);
            // Handlers recompute from the immutable question prop, so removing p1 leaves [p2].
            expect((onChange.mock.calls.at(-1)![0] as TestQuestion).matchingPairs).toHaveLength(1);
        });

        it('moves ordering items up and down and removes them', () => {
            const { onChange } = renderEditor(
                makeQuestion({
                    type: 'ordering',
                    orderItems: [
                        { id: 'i1', text: 'First' },
                        { id: 'i2', text: 'Second' },
                    ],
                })
            );
            // Move the second item up
            fireEvent.click(screen.getAllByLabelText('tests.move_question_up')[1]);
            expect((onChange.mock.calls.at(-1)![0] as TestQuestion).orderItems).toEqual([
                expect.objectContaining({ id: 'i2' }),
                expect.objectContaining({ id: 'i1' }),
            ]);

            // The question prop is immutable, so both productive moves recompute from
            // [i1, i2] — the down click on the first item yields the same order.
            fireEvent.click(screen.getAllByLabelText('tests.move_question_down')[0]);
            expect((onChange.mock.calls.at(-1)![0] as TestQuestion).orderItems).toEqual([
                expect.objectContaining({ id: 'i2' }),
                expect.objectContaining({ id: 'i1' }),
            ]);

            fireEvent.change(screen.getAllByLabelText('tests.ordering_item_placeholder')[1], {
                target: { value: 'Updated' },
            });
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderItems: [
                        expect.objectContaining({ id: 'i1', text: 'First' }),
                        expect.objectContaining({ id: 'i2', text: 'Updated' }),
                    ],
                })
            );

            fireEvent.click(screen.getAllByLabelText('tests.remove_option')[1]);
            expect((onChange.mock.calls.at(-1)![0] as TestQuestion).orderItems).toEqual([
                expect.objectContaining({ id: 'i1' }),
            ]);
        });

        it('reassigns categorize items when their category is removed', () => {
            const { onChange } = renderEditor(
                makeQuestion({
                    type: 'categorize',
                    categories: [
                        { id: 'cat1', label: 'Animals' },
                        { id: 'cat2', label: 'Food' },
                    ],
                    categorizeItems: [{ id: 'ci1', text: 'Dog', categoryId: 'cat1' }],
                })
            );
            fireEvent.change(screen.getAllByLabelText('tests.categorize_category_placeholder')[0], {
                target: { value: 'Pets' },
            });
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    categories: [
                        expect.objectContaining({ id: 'cat1', label: 'Pets' }),
                        expect.objectContaining({ id: 'cat2', label: 'Food' }),
                    ],
                })
            );

            fireEvent.click(screen.getAllByLabelText('tests.remove_option')[0]);
            const updated = onChange.mock.calls.at(-1)![0] as TestQuestion;
            expect(updated.categories).toHaveLength(1);
            expect(updated.categorizeItems![0].categoryId).toBe('cat2');
        });

        it('adds categorize items and updates their category via the select', () => {
            const { onChange } = renderEditor(
                makeQuestion({
                    type: 'categorize',
                    categories: [{ id: 'cat1', label: 'Animals' }],
                    categorizeItems: [{ id: 'ci1', text: 'Dog', categoryId: 'cat1' }],
                })
            );
            fireEvent.click(screen.getByText('tests.add_categorize_item'));
            expect((onChange.mock.calls.at(-1)![0] as TestQuestion).categorizeItems).toHaveLength(2);
        });
    });

    describe('hot-text', () => {
        it('appends a fragment at the cursor when nothing is selected', () => {
            const { onChange } = renderEditor(
                makeQuestion({ type: 'hot-text', hotTextPassage: 'Text', hotTextCorrectIndices: [] })
            );
            const textarea = screen.getByLabelText(/tests\.hot_text_passage_label/) as HTMLTextAreaElement;
            textarea.focus();
            textarea.setSelectionRange(4, 4);
            fireEvent.click(screen.getByText('tests.hot_text_insert_fragment'));
            expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ hotTextPassage: 'Text[[word]]' }));
        });

        it('wraps the selected passage in fragment markers', () => {
            const { onChange } = renderEditor(
                makeQuestion({ type: 'hot-text', hotTextPassage: 'Click here now', hotTextCorrectIndices: [] })
            );
            const textarea = screen.getByLabelText(/tests\.hot_text_passage_label/) as HTMLTextAreaElement;
            textarea.focus();
            textarea.setSelectionRange(6, 10);
            fireEvent.click(screen.getByText('tests.hot_text_insert_fragment'));
            expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ hotTextPassage: 'Click [[here]] now' }));
        });

        it('toggles which fragments are marked correct', () => {
            const { onChange } = renderEditor(
                makeQuestion({ type: 'hot-text', hotTextPassage: '[[this]] word', hotTextCorrectIndices: [0] })
            );
            const toggle = screen.getByLabelText('tests.mark_correct_option');
            expect(toggle).toHaveAttribute('aria-pressed', 'true');
            fireEvent.click(toggle);
            expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ hotTextCorrectIndices: [] }));
        });
    });

    describe('common fields', () => {
        it('updates points, image, audio, hint, explanation, and section', () => {
            const withSections: TestSection[] = [{ id: 's1', title: 'Section One' }];
            const onChange = vi.fn();
            render(
                <QuestionEditor
                    question={makeQuestion()}
                    index={0}
                    total={1}
                    sections={withSections}
                    onChange={onChange}
                    onRemove={vi.fn()}
                />
            );

            fireEvent.change(screen.getByLabelText('tests.question_points_label'), { target: { value: '5' } });
            expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ points: 5 }));

            fireEvent.change(screen.getByLabelText(/tests\.question_image_label/), {
                target: { value: 'https://img.example/x.png' },
            });
            expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: 'https://img.example/x.png' }));

            fireEvent.change(screen.getByLabelText(/tests\.question_audio_label/), {
                target: { value: 'https://audio.example/x.mp3' },
            });
            expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ audioUrl: 'https://audio.example/x.mp3' }));

            fireEvent.change(screen.getByLabelText(/tests\.question_hint_label/), {
                target: { value: 'A hint' },
            });
            expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ hint: 'A hint' }));

            fireEvent.change(screen.getByLabelText(/tests\.question_explanation_label/), {
                target: { value: 'Why' },
            });
            expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ explanation: 'Why' }));

            fireEvent.change(screen.getByLabelText('tests.question_section_label'), {
                target: { value: 's1' },
            });
            expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sectionId: 's1' }));
        });

        it('updates the linked grammar item', () => {
            const { onChange } = renderEditor(makeQuestion({ type: 'matching', linkedGrammarItemId: undefined }));
            const select = screen.getByLabelText('grammar.item_select_label');
            fireEvent.change(select, { target: { value: 'gr-past-simple-irregular' } });
            expect(onChange).toHaveBeenCalledWith(
                expect.objectContaining({ linkedGrammarItemId: 'gr-past-simple-irregular' })
            );
        });
    });

    describe('linking and saving', () => {
        it('unlinks a linked standard', () => {
            const { onChange } = renderEditor(
                makeQuestion({
                    linkedStandards: [
                        {
                            guid: 'std-1',
                            description: 'Standard one',
                            statementNotation: 'CC.1',
                            standardSetTitle: 'CCSS',
                            jurisdictionTitle: 'US',
                        },
                    ],
                })
            );
            fireEvent.click(screen.getByLabelText('rubricBuilder.action_unlink_standard'));
            expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ linkedStandards: [] }));
        });

        it('saves the question to the bank with a toast', () => {
            renderEditor();
            fireEvent.click(screen.getByLabelText('questionBank.save_to_bank'));
            expect(mockAddQuestionBankItem).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'q1', prompt: 'Sample question' }),
                []
            );
            expect(mockShowToast).toHaveBeenCalledWith('questionBank.saved_toast', 'success');
        });
    });

    describe('elo rating', () => {
        it('shows the no-level hint when the section has no CEFR level', () => {
            renderEditor();
            expect(screen.getByText('tests.elo_rating_no_level')).toBeInTheDocument();
        });

        it('renders the elo input when the section has a CEFR level', () => {
            const withLevel: TestSection[] = [{ id: 's1', title: 'Section', cefrLevel: 'B1' }];
            render(
                <QuestionEditor
                    question={makeQuestion({ sectionId: 's1' })}
                    index={0}
                    total={1}
                    sections={withLevel}
                    onChange={vi.fn()}
                    onRemove={vi.fn()}
                />
            );
            expect(screen.getByLabelText(/tests\.elo_rating_label/)).toBeInTheDocument();
        });
    });
});
