import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import QuestionEditor from '../QuestionEditor';
import type { TestQuestion, TestSection, LinkedStandard, LinkedCefrDescriptor } from '../../../types';

const { mockSettings, mockAddQuestionBankItem, mockShowToast } = vi.hoisted(() => ({
    mockSettings: {} as Record<string, unknown>,
    mockAddQuestionBankItem: vi.fn(),
    mockShowToast: vi.fn(),
}));

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
    useApp: () => ({ settings: mockSettings, addQuestionBankItem: mockAddQuestionBankItem }),
    useRoster: () => ({}),
    useStudents: () => ({}),
    useClasses: () => ({}),
    useGrading: () => ({}),
    useAuthoring: () => ({ addQuestionBankItem: mockAddQuestionBankItem }),
    useAssessment: () => ({}),
    useEssays: () => ({}),
    useFlashcards: () => ({}),
    useSettings: () => ({ settings: mockSettings }),
    usePlatform: () => ({}),
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

vi.mock('../../Standards/StandardsPickerModal', () => ({
    default: ({ onSelect, onClose }: { onSelect: (std: LinkedStandard) => void; onClose: () => void }) => (
        <div data-testid="std-picker">
            <button
                onClick={() =>
                    onSelect({
                        guid: 'std-9',
                        description: 'New standard',
                        statementNotation: 'CC.9',
                        standardSetTitle: 'CCSS',
                        jurisdictionTitle: 'US',
                    })
                }
            >
                Pick std
            </button>
            <button onClick={onClose}>Close std</button>
        </div>
    ),
}));

vi.mock('../../CEFR/CefrPickerModal', () => ({
    default: ({
        onAdd,
        onRemove,
        onClose,
        onAddFramework,
        onRemoveFramework,
    }: {
        onAdd: (d: LinkedCefrDescriptor) => void;
        onRemove: (descriptorId: string) => void;
        onClose: () => void;
        onAddFramework: (d: LinkedCefrDescriptor) => void;
        onRemoveFramework: (descriptorId: string) => void;
    }) => (
        <div data-testid="cefr-picker">
            <button
                onClick={() =>
                    onAdd({
                        descriptorId: 'd9',
                        level: 'A2',
                        skill: 'reading',
                        descriptionEn: 'Can do things',
                        descriptionNl: '',
                    })
                }
            >
                Add CEFR
            </button>
            <button
                onClick={() =>
                    onAddFramework({
                        descriptorId: 'fd1',
                        level: 'B1',
                        skill: 'writing',
                        descriptionEn: 'Framework item',
                        descriptionNl: '',
                    })
                }
            >
                Add framework
            </button>
            <button onClick={() => onRemoveFramework('fd1')}>Remove framework</button>
            <button onClick={() => onRemove('d9')}>Remove CEFR</button>
            <button onClick={onClose}>Close CEFR</button>
        </div>
    ),
}));

vi.mock('../HelpPopover', () => ({
    default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const noSections: TestSection[] = [];

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

function renderEditor(
    question: TestQuestion = makeQuestion(),
    onChange = vi.fn(),
    opts: { sections?: TestSection[] } = {}
) {
    render(
        <QuestionEditor
            question={question}
            index={0}
            total={1}
            sections={opts.sections ?? noSections}
            onChange={onChange}
            onRemove={vi.fn()}
        />
    );
    return onChange;
}

describe('QuestionEditor coverage', () => {
    beforeEach(() => {
        delete mockSettings.standardsApiKey;
        mockAddQuestionBankItem.mockClear();
        mockShowToast.mockClear();
    });

    it('falls through to the plain update for unhandled types when switching', () => {
        const onChange = renderEditor();
        fireEvent.change(screen.getByDisplayValue('tests.question_type_multiple_choice'), {
            target: { value: 'short-answer' },
        });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'short-answer' }));
    });

    it('initializes default options when switching into a choice type from a bare type', () => {
        const onChange = renderEditor(makeQuestion({ type: 'open', options: undefined }));
        fireEvent.change(screen.getByDisplayValue('tests.question_type_open'), {
            target: { value: 'multiple-choice' },
        });
        const updated = onChange.mock.calls.at(-1)![0] as TestQuestion;
        expect(updated.options).toHaveLength(2);
        expect(updated.options![0]).toMatchObject({ isCorrect: true });
    });

    it('preserves existing collections when re-selecting the same specialized type', () => {
        const cases: Array<[TestQuestion, (q: TestQuestion) => unknown, string]> = [
            [
                makeQuestion({
                    type: 'matching',
                    matchingPairs: [
                        { id: 'p1', left: 'L', right: 'R' },
                        { id: 'p2', left: 'L2', right: 'R2' },
                    ],
                }),
                (q) => q.matchingPairs?.length,
                'tests.question_type_matching',
            ],
            [
                makeQuestion({
                    type: 'ordering',
                    orderItems: [
                        { id: 'i1', text: 'One' },
                        { id: 'i2', text: 'Two' },
                    ],
                }),
                (q) => q.orderItems?.length,
                'tests.question_type_ordering',
            ],
            [
                makeQuestion({
                    type: 'categorize',
                    categories: [
                        { id: 'c1', label: 'Cat A' },
                        { id: 'c2', label: 'Cat B' },
                    ],
                    categorizeItems: [{ id: 'ci1', text: 'Item', categoryId: 'c1' }],
                }),
                (q) => (q.categories?.length ?? 0) + (q.categorizeItems?.length ?? 0),
                'tests.question_type_categorize',
            ],
        ];
        for (const [question, pick, selectLabel] of cases) {
            const onChange = renderEditor(question);
            fireEvent.change(screen.getByDisplayValue(selectLabel), { target: { value: question.type } });
            const updated = onChange.mock.calls.at(-1)![0] as TestQuestion;
            expect(pick(updated)).toBeGreaterThan(0);
        }
    });

    it('defaults the audio-response recording cap and clamps the input', () => {
        const onChange = renderEditor(makeQuestion({ type: 'audio-response' }));
        const input = screen.getByLabelText(/tests\.max_recording_seconds_label/);
        expect(input).toHaveValue(60);
        fireEvent.change(input, { target: { value: '120' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ maxRecordingSeconds: 120 }));
        fireEvent.change(input, { target: { value: '' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ maxRecordingSeconds: 5 }));
    });

    it('renders hot-text without fields, edits the passage, and inserts a fragment', () => {
        const onChange = renderEditor(makeQuestion({ type: 'hot-text' }));
        expect(screen.getByText('tests.hot_text_no_fragments')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText(/tests\.hot_text_passage_label/), {
            target: { value: 'A [[word]] here' },
        });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ hotTextPassage: 'A [[word]] here' }));
        fireEvent.click(screen.getByText('tests.hot_text_insert_fragment'));
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ hotTextPassage: '[[word]]' }));
    });

    it('toggles a hot-text fragment when no correct indices are stored yet', () => {
        const onChange = renderEditor(makeQuestion({ type: 'hot-text', hotTextPassage: '[[first]] word' }));
        fireEvent.click(screen.getAllByLabelText('tests.mark_correct_option')[0]);
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ hotTextCorrectIndices: [0] }));
    });

    it('toggles an unmarked hot-text fragment and renders correct colors', () => {
        const onChange = renderEditor(
            makeQuestion({
                type: 'hot-text',
                hotTextPassage: '[[first]] [[second]]',
                hotTextCorrectIndices: [0],
            })
        );
        const toggles = screen.getAllByLabelText('tests.mark_correct_option');
        expect(toggles).toHaveLength(2);
        expect(toggles[0]).toHaveAttribute('aria-pressed', 'true');
        expect(toggles[1]).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(toggles[1]);
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ hotTextCorrectIndices: [0, 1] }));
    });

    it('renders a dash for empty hot-text fragments', () => {
        renderEditor(makeQuestion({ type: 'hot-text', hotTextPassage: '[[]] word', hotTextCorrectIndices: [] }));
        expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });

    it('adds and removes ordering items', () => {
        const onChange = renderEditor(
            makeQuestion({
                type: 'ordering',
                orderItems: [
                    { id: 'i1', text: 'One' },
                    { id: 'i2', text: 'Two' },
                ],
            })
        );
        fireEvent.click(screen.getByText('tests.add_ordering_item'));
        expect((onChange.mock.calls.at(-1)![0] as TestQuestion).orderItems).toHaveLength(3);
        fireEvent.click(screen.getAllByLabelText('tests.remove_option')[1]);
        expect((onChange.mock.calls.at(-1)![0] as TestQuestion).orderItems).toHaveLength(1);
    });

    it('adds ordering items when none exist yet', () => {
        const onChange = renderEditor(makeQuestion({ type: 'ordering' }));
        fireEvent.click(screen.getByText('tests.add_ordering_item'));
        expect((onChange.mock.calls.at(-1)![0] as TestQuestion).orderItems).toHaveLength(1);
    });

    it('adds categories and reassigns items when a category is removed', () => {
        const onChange = renderEditor(
            makeQuestion({
                type: 'categorize',
                categories: [
                    { id: 'c1', label: 'Animals' },
                    { id: 'c2', label: 'Food' },
                ],
                categorizeItems: [
                    { id: 'ci1', text: 'Dog', categoryId: 'c1' },
                    { id: 'ci2', text: 'Bread', categoryId: 'c2' },
                ],
            })
        );
        fireEvent.click(screen.getByText('tests.add_category'));
        expect((onChange.mock.calls.at(-1)![0] as TestQuestion).categories).toHaveLength(3);
        fireEvent.click(screen.getAllByLabelText('tests.remove_option')[0]);
        const updated = onChange.mock.calls.at(-1)![0] as TestQuestion;
        expect(updated.categories).toHaveLength(1);
        expect(updated.categorizeItems![0].categoryId).toBe('c2');
        expect(updated.categorizeItems![1].categoryId).toBe('c2');
    });

    it('adds categorize items with an empty category list and falls back to empty category id', () => {
        const onChange = renderEditor(makeQuestion({ type: 'categorize', categories: [], categorizeItems: undefined }));
        fireEvent.click(screen.getByText('tests.add_categorize_item'));
        const updated = onChange.mock.calls.at(-1)![0] as TestQuestion;
        expect(updated.categorizeItems).toHaveLength(1);
        expect(updated.categorizeItems![0].categoryId).toBe('');
    });

    it('edits and removes categorize items and disables removal for a single item', () => {
        const onChange = renderEditor(
            makeQuestion({
                type: 'categorize',
                categories: [
                    { id: 'c1', label: 'Animals' },
                    { id: 'c2', label: 'Food' },
                ],
                categorizeItems: [
                    { id: 'ci1', text: 'Dog', categoryId: 'c1' },
                    { id: 'ci2', text: 'Bread', categoryId: 'c2' },
                ],
            })
        );
        fireEvent.change(screen.getAllByLabelText('tests.categorize_item_placeholder')[0], {
            target: { value: 'Cat' },
        });
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                categorizeItems: [
                    expect.objectContaining({ id: 'ci1', text: 'Cat' }),
                    expect.objectContaining({ id: 'ci2' }),
                ],
            })
        );
        fireEvent.change(screen.getAllByLabelText('tests.categorize_item_category_label')[1], {
            target: { value: 'c1' },
        });
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                categorizeItems: [
                    expect.objectContaining({ id: 'ci1' }),
                    expect.objectContaining({ id: 'ci2', categoryId: 'c1' }),
                ],
            })
        );
        fireEvent.click(screen.getAllByLabelText('tests.remove_option')[2]);
        expect((onChange.mock.calls.at(-1)![0] as TestQuestion).categorizeItems).toHaveLength(1);
    });

    it('disables categorize-item removal when only one item exists', () => {
        renderEditor(
            makeQuestion({
                type: 'categorize',
                categories: [{ id: 'c1', label: 'Animals' }],
                categorizeItems: [{ id: 'ci1', text: 'Dog', categoryId: 'c1' }],
            })
        );
        const removeBtns = screen.getAllByLabelText('tests.remove_option');
        expect(removeBtns[0]).toBeDisabled();
        expect(removeBtns[1]).toBeDisabled();
    });

    it('renders a dash for empty category labels', () => {
        renderEditor(
            makeQuestion({
                type: 'categorize',
                categories: [{ id: 'c1', label: '' }],
                categorizeItems: [{ id: 'ci1', text: 'Dog', categoryId: 'c1' }],
            })
        );
        expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });

    it('renders categorize without collections and adds categories from scratch', () => {
        const onChange = renderEditor(makeQuestion({ type: 'categorize' }));
        expect(screen.getByText('tests.categorize_categories_label')).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.add_category'));
        expect((onChange.mock.calls.at(-1)![0] as TestQuestion).categories).toHaveLength(1);
    });

    it('renders the item category select when no categories exist yet', () => {
        renderEditor(
            makeQuestion({
                type: 'categorize',
                categorizeItems: [{ id: 'ci1', text: 'Dog', categoryId: 'ghost' }],
            })
        );
        expect(screen.getByLabelText('tests.categorize_item_category_label')).toBeInTheDocument();
    });

    it('toggles partial credit for matching questions', () => {
        const onChange = renderEditor(
            makeQuestion({
                type: 'matching',
                matchingPairs: [
                    { id: 'p1', left: '', right: '' },
                    { id: 'p2', left: '', right: '' },
                ],
            })
        );
        fireEvent.click(screen.getByText('tests.partial_credit_label'));
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ partialCredit: false }));
    });

    it('toggles partial credit for cloze questions', () => {
        const onChange = renderEditor(makeQuestion({ type: 'cloze', prompt: 'x {{a}}' }));
        fireEvent.click(screen.getByText('tests.partial_credit_label'));
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ partialCredit: false }));
    });

    it('links a standard through the picker and closes it', () => {
        mockSettings.standardsApiKey = 'api-key';
        const onChange = renderEditor();
        fireEvent.click(screen.getByText('tests.link_standard'));
        expect(screen.getByTestId('std-picker')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Pick std'));
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ linkedStandards: [expect.objectContaining({ guid: 'std-9' })] })
        );
        expect(screen.queryByTestId('std-picker')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('tests.link_standard'));
        fireEvent.click(screen.getByText('Close std'));
        expect(screen.queryByTestId('std-picker')).not.toBeInTheDocument();
    });

    it('closes the no-api-key dialog via the overlay and the header close button', () => {
        renderEditor();
        fireEvent.click(screen.getByText('tests.link_standard'));
        expect(screen.getByText('tests.standards_api_key_required')).toBeInTheDocument();
        fireEvent.click(document.querySelector('.modal-overlay') as HTMLElement);
        expect(screen.queryByText('tests.standards_api_key_required')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('tests.link_standard'));
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByText('tests.standards_api_key_required')).not.toBeInTheDocument();
    });

    it('adds a CEFR descriptor through the picker and exercises the framework no-op callbacks', () => {
        const onChange = renderEditor();
        fireEvent.click(screen.getByText('tests.link_cefr'));
        expect(screen.getByTestId('cefr-picker')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Add CEFR'));
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ linkedCefrDescriptors: [expect.objectContaining({ descriptorId: 'd9' })] })
        );
        // The editor wires the framework callbacks as no-ops (linkedFrameworkDescriptors is always [])
        fireEvent.click(screen.getByText('Add framework'));
        fireEvent.click(screen.getByText('Remove framework'));
    });

    it('updates the prompt through the rich editor for non-cloze types', () => {
        const onChange = renderEditor();
        fireEvent.change(screen.getByDisplayValue('Sample question'), { target: { value: 'New prompt' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'New prompt' }));
    });

    it('handles question image error and load events', () => {
        renderEditor(makeQuestion({ imageUrl: 'https://img.example/x.png' }));
        const img = screen.getByAltText('tests.question_image_preview_alt');
        fireEvent.error(img);
        expect(img.style.display).toBe('none');
        fireEvent.load(img);
        expect(img.style.display).toBe('');
    });

    it('expands, fills, and collapses option image fields', () => {
        const onChange = renderEditor();
        fireEvent.click(screen.getAllByLabelText('tests.option_image_label')[0]);
        const urlInputs = document.querySelectorAll('input[type="url"]');
        expect(urlInputs.length).toBe(3); // question image + question audio + expanded option image
        fireEvent.change(urlInputs[2], { target: { value: 'https://img.example/opt.png' } });
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                options: [
                    expect.objectContaining({ id: 'a', imageUrl: 'https://img.example/opt.png' }),
                    expect.objectContaining({ id: 'b' }),
                ],
            })
        );
        fireEvent.click(screen.getAllByLabelText('tests.option_image_label')[0]);
        expect(document.querySelectorAll('input[type="url"]').length).toBe(2);
    });

    it('clears an option image url back to undefined', () => {
        const onChange = renderEditor(
            makeQuestion({
                options: [
                    { id: 'a', text: 'A', isCorrect: true, imageUrl: 'https://img.example/opt.png' },
                    { id: 'b', text: 'B', isCorrect: false },
                ],
            })
        );
        const urlInputs = document.querySelectorAll('input[type="url"]');
        fireEvent.change(urlInputs[2], { target: { value: '' } });
        const cleared = onChange.mock.calls.at(-1)![0] as TestQuestion;
        expect(cleared.options![0].imageUrl).toBeUndefined();
    });

    it('renders the option image preview and handles its error/load events', () => {
        renderEditor(
            makeQuestion({
                options: [
                    { id: 'a', text: 'A', isCorrect: true, imageUrl: 'https://img.example/opt.png' },
                    { id: 'b', text: 'B', isCorrect: false },
                ],
            })
        );
        const preview = screen.getByAltText('tests.question_image_preview_alt');
        fireEvent.error(preview);
        expect(preview.style.display).toBe('none');
        fireEvent.load(preview);
        expect(preview.style.display).toBe('');
    });

    it('clears common fields back to undefined and coerces empty points to zero', () => {
        const withSections: TestSection[] = [{ id: 's1', title: 'Section One' }];
        const onChange = renderEditor(
            makeQuestion({
                imageUrl: 'https://img.example/x.png',
                audioUrl: 'https://audio.example/x.mp3',
                hint: 'A hint',
                explanation: 'Why',
                sectionId: 's1',
            }),
            vi.fn(),
            { sections: withSections }
        );
        fireEvent.change(screen.getByLabelText(/tests\.question_image_label/), { target: { value: '' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: undefined }));
        fireEvent.change(screen.getByLabelText(/tests\.question_audio_label/), { target: { value: '' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ audioUrl: undefined }));
        fireEvent.change(screen.getByLabelText(/tests\.question_hint_label/), { target: { value: '' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ hint: undefined }));
        fireEvent.change(screen.getByLabelText(/tests\.question_explanation_label/), { target: { value: '' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ explanation: undefined }));
        fireEvent.change(screen.getByLabelText('tests.question_section_label'), { target: { value: '' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sectionId: undefined }));
        fireEvent.change(screen.getByLabelText('tests.question_points_label'), { target: { value: '' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ points: 0 }));
    });

    it('renders the question image and audio previews', () => {
        renderEditor(makeQuestion({ imageUrl: 'https://img.example/x.png', audioUrl: 'https://audio.example/x.mp3' }));
        expect(screen.getByAltText('tests.question_image_preview_alt')).toBeInTheDocument();
        expect(screen.getByLabelText('tests.question_audio_preview_alt')).toBeInTheDocument();
    });

    it('renders the cloze gap preview with alternatives', () => {
        renderEditor(makeQuestion({ type: 'cloze', prompt: 'X {{a|b}}' }));
        expect(screen.getByText(/cloze_gap_preview/)).toBeInTheDocument();
    });

    it('sets the true-false boolean to true and renders both styles', () => {
        const onChange = renderEditor(makeQuestion({ type: 'true-false', correctBoolean: false }));
        fireEvent.click(screen.getByText('tests.true_false_true'));
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ correctBoolean: true }));
    });

    it('edits the matching right column', () => {
        const onChange = renderEditor(
            makeQuestion({
                type: 'matching',
                matchingPairs: [
                    { id: 'p1', left: 'L1', right: 'R1' },
                    { id: 'p2', left: 'L2', right: 'R2' },
                ],
            })
        );
        fireEvent.change(screen.getAllByLabelText('tests.matching_right_placeholder')[1], {
            target: { value: 'Updated' },
        });
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                matchingPairs: [
                    expect.objectContaining({ id: 'p1' }),
                    expect.objectContaining({ id: 'p2', right: 'Updated' }),
                ],
            })
        );
    });

    it('disables matching-pair removal when only one pair exists', () => {
        renderEditor(
            makeQuestion({
                type: 'matching',
                matchingPairs: [{ id: 'p1', left: 'L', right: 'R' }],
            })
        );
        expect(screen.getByLabelText('tests.remove_option')).toBeDisabled();
    });

    it('renders ordering and matching with missing collections without crashing', () => {
        renderEditor(makeQuestion({ type: 'ordering' }));
        expect(screen.getByText('tests.ordering_items_label')).toBeInTheDocument();
        renderEditor(makeQuestion({ type: 'matching' }));
        expect(screen.getByText('tests.matching_pairs_label')).toBeInTheDocument();
    });

    it('adds matching pairs when none exist yet', () => {
        const onChange = renderEditor(makeQuestion({ type: 'matching' }));
        fireEvent.click(screen.getByText('tests.add_matching_pair'));
        expect((onChange.mock.calls.at(-1)![0] as TestQuestion).matchingPairs).toHaveLength(1);
    });

    it('renders multiple-response without options and falls back to the partial-credit default', () => {
        const onChange = renderEditor(makeQuestion({ type: 'multiple-response', options: undefined }));
        fireEvent.click(screen.getByText('tests.add_option'));
        const updated = onChange.mock.calls.at(-1)![0] as TestQuestion;
        expect(updated.options).toHaveLength(1);
        expect(updated.options![0]).toMatchObject({ isCorrect: false });
    });

    it('disables option removal when only one option remains', () => {
        renderEditor(
            makeQuestion({
                options: [{ id: 'a', text: 'Only', isCorrect: true }],
            })
        );
        expect(screen.getByLabelText('tests.remove_option')).toBeDisabled();
    });

    it('clears the short-answer expected answers back to undefined', () => {
        const onChange = renderEditor(makeQuestion({ type: 'short-answer', expectedAnswers: ['Paris', 'Roma'] }));
        expect(screen.getByDisplayValue('Paris | Roma')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText(/tests\.expected_answer_label/), { target: { value: '' } });
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ expectedAnswers: undefined, expectedAnswer: undefined })
        );
    });

    it('clears numeric value and tolerance back to undefined', () => {
        const onChange = renderEditor(makeQuestion({ type: 'numeric', expectedNumericValue: 42, numericTolerance: 1 }));
        fireEvent.change(screen.getByLabelText('tests.numeric_expected_value_label'), { target: { value: '' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ expectedNumericValue: undefined }));
        fireEvent.change(screen.getByLabelText(/tests\.numeric_tolerance_label/), { target: { value: '' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ numericTolerance: undefined }));
    });

    it('updates and clears the elo rating input', () => {
        const withLevel: TestSection[] = [{ id: 's1', title: 'Section', cefrLevel: 'B1' }];
        const onChange = renderEditor(makeQuestion({ sectionId: 's1', eloRating: 900 }), vi.fn(), {
            sections: withLevel,
        });
        fireEvent.change(screen.getByLabelText(/tests\.elo_rating_label/), { target: { value: '950' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ eloRating: 950 }));
        fireEvent.change(screen.getByLabelText(/tests\.elo_rating_label/), { target: { value: '' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ eloRating: undefined }));
    });

    it('falls back to the guid when a standard has no statement notation', () => {
        renderEditor(
            makeQuestion({
                linkedStandards: [
                    {
                        guid: 'std-raw',
                        description: 'Raw standard',
                        standardSetTitle: 'CCSS',
                        jurisdictionTitle: 'US',
                    },
                ],
            })
        );
        expect(screen.getByText('std-raw')).toBeInTheDocument();
    });

    it('removes a non-correct option without reassigning correctness', () => {
        const onChange = renderEditor();
        fireEvent.click(screen.getAllByLabelText('tests.remove_option')[1]);
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                options: [expect.objectContaining({ id: 'a', isCorrect: true })],
            })
        );
    });
});
