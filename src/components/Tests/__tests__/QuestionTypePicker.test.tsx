import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import QuestionTypePicker from '../QuestionTypePicker';
import { QUESTION_TYPES } from '../../../data/questionTypes';
import type { TestQuestionType } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => {
            if (opts && typeof opts === 'object' && 'type' in opts) return `${key} ${String(opts.type)}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

const renderPicker = (selected: TestQuestionType = 'multiple-choice') => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<QuestionTypePicker selected={selected} onSelect={onSelect} onClose={onClose} />);
    return { onSelect, onClose };
};

const cards = () => document.querySelectorAll('[data-question-type]');
const helpButton = (type: TestQuestionType) =>
    screen.getByRole('button', { name: `tests.type_picker_help_aria tests.question_type_${type.replace(/-/g, '_')}` });

describe('QuestionTypePicker', () => {
    it('shows a card for every question type, grouped by task family', () => {
        renderPicker();
        expect(cards()).toHaveLength(QUESTION_TYPES.length);
        expect(screen.getByRole('heading', { name: 'tests.type_picker_group_pick' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'tests.type_picker_group_efl' })).toBeInTheDocument();
    });

    it('names each type and its one-line description', () => {
        renderPicker('audio-response');
        expect(screen.getByText('tests.question_type_multiple_choice')).toBeInTheDocument();
        expect(screen.getByText('tests.question_type_multiple_choice_desc')).toBeInTheDocument();
    });

    it('selects a type when its card is clicked', () => {
        const { onSelect } = renderPicker();
        fireEvent.click(document.querySelector('[data-question-type="true-false"]') as HTMLElement);
        expect(onSelect).toHaveBeenCalledWith('true-false');
    });

    it('calls onClose from the close button', () => {
        const { onClose } = renderPicker();
        fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('narrows the grid to one family with the filter chips', () => {
        renderPicker();
        fireEvent.click(screen.getByRole('button', { name: 'tests.type_picker_group_efl' }));
        expect(cards()).toHaveLength(3);
        fireEvent.click(screen.getByRole('button', { name: 'tests.type_picker_all' }));
        expect(cards()).toHaveLength(QUESTION_TYPES.length);
    });

    it('opens the guide from the question mark and can pick from there', () => {
        const { onSelect } = renderPicker();
        fireEvent.click(helpButton('multiple-choice'));
        expect(screen.getByText('tests.help.multiple_choice_teacher_body')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'tests.type_picker_use' }));
        expect(onSelect).toHaveBeenCalledWith('multiple-choice');
    });

    it('returns to the grid from the guide', () => {
        renderPicker();
        fireEvent.click(helpButton('multiple-choice'));
        expect(cards()).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: 'tests.type_picker_back' }));
        expect(cards()).toHaveLength(QUESTION_TYPES.length);
    });
});
