import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import QuestionEditor from '../QuestionEditor';
import type { TestQuestion, TestSection } from '../../../types';

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
    useApp: () => ({ settings: {} }),
}));

vi.mock('../../Standards/StandardsPickerModal', () => ({ default: () => null }));
vi.mock('../../CEFR/CefrPickerModal', () => ({
    default: ({ onClose }: { onClose: () => void }) =>
        React.createElement('div', { 'data-testid': 'cefr-picker' },
            React.createElement('button', { onClick: onClose }, 'Close CEFR')
        ),
}));
vi.mock('../HelpPopover', () => ({ default: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));

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

describe('QuestionEditor', () => {
    it('renders prompt textarea and type selector', () => {
        render(
            <QuestionEditor
                question={makeQuestion()}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        expect(screen.getByDisplayValue('Sample question')).toBeInTheDocument();
        // select displays the translated key for the selected option
        expect(screen.getByDisplayValue('tests.question_type_multiple_choice')).toBeInTheDocument();
    });

    it('calls onRemove when remove button clicked', () => {
        const onRemove = vi.fn();
        render(
            <QuestionEditor
                question={makeQuestion()}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={onRemove}
            />
        );
        fireEvent.click(screen.getByLabelText('tests.remove_question'));
        expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it('calls onChange when prompt text is updated', () => {
        const onChange = vi.fn();
        render(
            <QuestionEditor
                question={makeQuestion()}
                index={0}
                total={1}
                sections={sections}
                onChange={onChange}
                onRemove={vi.fn()}
            />
        );
        fireEvent.change(screen.getByDisplayValue('Sample question'), { target: { value: 'New prompt' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'New prompt' }));
    });

    it('renders multiple-choice options and add-option button', () => {
        render(
            <QuestionEditor
                question={makeQuestion()}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        expect(screen.getByDisplayValue('Option A')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Option B')).toBeInTheDocument();
        expect(screen.getByText('tests.add_option')).toBeInTheDocument();
    });

    it('renders true-false correct-answer buttons', () => {
        render(
            <QuestionEditor
                question={makeQuestion({ type: 'true-false', correctBoolean: true })}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        expect(screen.getByText('tests.true_false_correct_label')).toBeInTheDocument();
    });

    it('renders short-answer expected-answer field', () => {
        render(
            <QuestionEditor
                question={makeQuestion({ type: 'short-answer', expectedAnswer: 'Paris' })}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        expect(screen.getByDisplayValue('Paris')).toBeInTheDocument();
    });

    it('renders matching pairs', () => {
        render(
            <QuestionEditor
                question={makeQuestion({
                    type: 'matching',
                    matchingPairs: [
                        { id: 'p1', left: 'Left 1', right: 'Right 1' },
                        { id: 'p2', left: 'Left 2', right: 'Right 2' },
                    ],
                })}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        expect(screen.getByDisplayValue('Left 1')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Right 1')).toBeInTheDocument();
    });

    it('renders ordering items', () => {
        render(
            <QuestionEditor
                question={makeQuestion({
                    type: 'ordering',
                    orderItems: [
                        { id: 'i1', text: 'Step one' },
                        { id: 'i2', text: 'Step two' },
                    ],
                })}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        expect(screen.getByDisplayValue('Step one')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Step two')).toBeInTheDocument();
    });

    it('renders categorize items', () => {
        const categories = [{ id: 'cat1', label: 'Animals' }];
        render(
            <QuestionEditor
                question={makeQuestion({
                    type: 'categorize',
                    categories,
                    categorizeItems: [{ id: 'ci1', text: 'Dog', categoryId: 'cat1' }],
                })}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        expect(screen.getAllByDisplayValue('Animals').length).toBeGreaterThan(0);
        expect(screen.getByDisplayValue('Dog')).toBeInTheDocument();
    });

    it('renders cloze prompt field', () => {
        render(
            <QuestionEditor
                question={makeQuestion({ type: 'cloze', prompt: 'Fill in {{blank}}' })}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        expect(screen.getByDisplayValue('Fill in {{blank}}')).toBeInTheDocument();
    });

    it('renders open question type without options', () => {
        render(
            <QuestionEditor
                question={makeQuestion({ type: 'open' })}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        // Open type has no option-specific elements
        expect(screen.queryByText('tests.add_option')).not.toBeInTheDocument();
    });

    it('renders section selector when sections are provided', () => {
        const withSections: TestSection[] = [{ id: 's1', title: 'Section One' }];
        render(
            <QuestionEditor
                question={makeQuestion()}
                index={0}
                total={1}
                sections={withSections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        expect(screen.getByText('Section One')).toBeInTheDocument();
    });

    it('changes question type via type selector', () => {
        const onChange = vi.fn();
        render(
            <QuestionEditor
                question={makeQuestion()}
                index={0}
                total={1}
                sections={sections}
                onChange={onChange}
                onRemove={vi.fn()}
            />
        );
        fireEvent.change(screen.getByDisplayValue('tests.question_type_multiple_choice'), { target: { value: 'true-false' } });
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'true-false' }));
    });

    it('opens CEFR picker modal when link-cefr button clicked', () => {
        render(
            <QuestionEditor
                question={makeQuestion()}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        fireEvent.click(screen.getByText('tests.link_cefr'));
        expect(screen.getByTestId('cefr-picker')).toBeInTheDocument();
    });

    it('closes CEFR picker when onClose is called', () => {
        render(
            <QuestionEditor
                question={makeQuestion()}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        fireEvent.click(screen.getByText('tests.link_cefr'));
        fireEvent.click(screen.getByText('Close CEFR'));
        expect(screen.queryByTestId('cefr-picker')).not.toBeInTheDocument();
    });

    it('removes a linked CEFR descriptor when remove button clicked', () => {
        const onChange = vi.fn();
        render(
            <QuestionEditor
                question={makeQuestion({
                    linkedCefrDescriptors: [
                        { descriptorId: 'd1', level: 'B1', skill: 'reading', descriptionEn: 'Can read texts', descriptionNl: '' },
                    ],
                })}
                index={0}
                total={1}
                sections={sections}
                onChange={onChange}
                onRemove={vi.fn()}
            />
        );
        fireEvent.click(screen.getByLabelText('rubricBuilder.action_remove_descriptor'));
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ linkedCefrDescriptors: [] }));
    });

    it('closes the no-api-key standards dialog', () => {
        render(
            <QuestionEditor
                question={makeQuestion()}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        fireEvent.click(screen.getByText('tests.link_standard'));
        // Dialog is shown
        expect(screen.getByText('tests.standards_api_key_required')).toBeInTheDocument();
        // Close via the close button
        fireEvent.click(screen.getByText('rubricBuilder.action_close'));
        expect(screen.queryByText('tests.standards_api_key_required')).not.toBeInTheDocument();
    });

    it('renders multiple-response with partial credit checkbox', () => {
        render(
            <QuestionEditor
                question={makeQuestion({ type: 'multiple-response', partialCredit: true })}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        expect(screen.getByText('tests.partial_credit_label')).toBeInTheDocument();
    });

    it('renders hot-text question with passage field', () => {
        render(
            <QuestionEditor
                question={makeQuestion({ type: 'hot-text', hotTextPassage: '', hotTextCorrectIndices: [] })}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        expect(screen.getByText('tests.hot_text_passage_label')).toBeInTheDocument();
        expect(screen.getByText('tests.hot_text_insert_fragment')).toBeInTheDocument();
        // no fragments yet
        expect(screen.getByText('tests.hot_text_no_fragments')).toBeInTheDocument();
    });

    it('renders hot-text fragments with mark-correct buttons', () => {
        render(
            <QuestionEditor
                question={makeQuestion({
                    type: 'hot-text',
                    hotTextPassage: 'Click [[this]] word',
                    hotTextCorrectIndices: [0],
                })}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        expect(screen.getByText('this')).toBeInTheDocument();
        expect(screen.getByText('tests.hot_text_fragments_help')).toBeInTheDocument();
    });

    it('renders cloze-dropdown with insert-dropdown-gap button', () => {
        render(
            <QuestionEditor
                question={makeQuestion({ type: 'cloze-dropdown', prompt: '' })}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        expect(screen.getByText('tests.cloze_insert_dropdown_gap')).toBeInTheDocument();
    });

    it('renders cloze with parsed gaps preview', () => {
        render(
            <QuestionEditor
                question={makeQuestion({ type: 'cloze', prompt: 'The {{sun}} is {{hot}}' })}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        // gap preview should list alternatives
        expect(screen.getByText(/cloze_gap_preview/)).toBeInTheDocument();
    });

    it('renders link-standard and link-cefr buttons', () => {
        render(
            <QuestionEditor
                question={makeQuestion()}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        expect(screen.getByText('tests.link_standard')).toBeInTheDocument();
        expect(screen.getByText('tests.link_cefr')).toBeInTheDocument();
    });

    it('shows no-api-key notice when standards button clicked without api key', () => {
        render(
            <QuestionEditor
                question={makeQuestion()}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        fireEvent.click(screen.getByText('tests.link_standard'));
        expect(screen.getByText('tests.standards_api_key_required')).toBeInTheDocument();
    });

    it('renders linked standard badge', () => {
        render(
            <QuestionEditor
                question={makeQuestion({
                    linkedStandards: [{ guid: 'std-1', description: 'Standard one', statementNotation: 'CC.1', standardSetTitle: 'CCSS', jurisdictionTitle: 'US' }],
                })}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        expect(screen.getByText('CC.1')).toBeInTheDocument();
        expect(screen.getByText('Standard one')).toBeInTheDocument();
    });

    it('renders linked CEFR descriptor badge', () => {
        render(
            <QuestionEditor
                question={makeQuestion({
                    linkedCefrDescriptors: [
                        { descriptorId: 'd1', level: 'B1', skill: 'reading', descriptionEn: 'Can read texts', descriptionNl: '' },
                    ],
                })}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        expect(screen.getByText('B1')).toBeInTheDocument();
        expect(screen.getByText('Can read texts')).toBeInTheDocument();
    });
});
