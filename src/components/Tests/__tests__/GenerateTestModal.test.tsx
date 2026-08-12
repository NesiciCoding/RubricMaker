import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GenerateTestModal from '../GenerateTestModal';
import type { QuestionBankItem } from '../../../types';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
}));

vi.mock('../../../context/AppContext', () => ({
    useApp: () => ({ questionBank: mockQuestionBank }),
}));

const mockQuestionBank: QuestionBankItem[] = [
    {
        id: 'b1',
        cefrLevel: 'B1',
        tags: ['vocabulary'],
        createdAt: '2024-01-01T00:00:00Z',
        question: {
            id: 'q1',
            prompt: 'Choose the right word',
            type: 'multiple-choice',
            points: 1,
            options: [
                { id: 'o1', text: 'A', isCorrect: true },
                { id: 'o2', text: 'B', isCorrect: false },
            ],
        },
    },
    {
        id: 'b2',
        kind: 'section',
        cefrLevel: 'A2',
        tags: ['reading'],
        createdAt: '2024-01-01T00:00:00Z',
        section: {
            title: 'Passage 1',
            content: '<p>Stimulus text</p>',
            questions: [{ id: 'q2', prompt: 'What is the main idea?', type: 'open', points: 2 }],
        },
    },
];

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

describe('GenerateTestModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the form controls and one default criterion row', () => {
        render(<GenerateTestModal onClose={vi.fn()} />);
        expect(screen.getByText('generateTest.title')).toBeInTheDocument();
        expect(screen.getByLabelText('tests.name_label')).toBeInTheDocument();
        expect(screen.getByLabelText('tests.mode_label')).toBeInTheDocument();
        expect(screen.getByLabelText('generateTest.criterion_kind_label')).toBeInTheDocument();
        expect(screen.getByLabelText('generateTest.criterion_count_label')).toHaveValue(5);
    });

    it('keeps generate disabled until a name is entered', () => {
        render(<GenerateTestModal onClose={vi.fn()} />);
        const generate = screen.getByRole('button', { name: 'generateTest.generate_button' });
        expect(generate).toBeDisabled();

        fireEvent.change(screen.getByLabelText('tests.name_label'), { target: { value: 'Midterm' } });
        expect(generate).toBeEnabled();
    });

    it('adds and removes criterion rows', () => {
        render(<GenerateTestModal onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'generateTest.add_criterion' }));
        expect(screen.getAllByLabelText('generateTest.criterion_count_label')).toHaveLength(2);

        fireEvent.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);
        expect(screen.getAllByLabelText('generateTest.criterion_count_label')).toHaveLength(1);
    });

    it('generates a test from the bank and navigates with the cloned questions', () => {
        render(<GenerateTestModal onClose={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('tests.name_label'), { target: { value: 'Midterm' } });
        fireEvent.change(screen.getByLabelText('generateTest.criterion_count_label'), { target: { value: '1' } });
        fireEvent.click(screen.getByRole('button', { name: 'generateTest.generate_button' }));

        expect(mockNavigate).toHaveBeenCalledWith('/tests/new', {
            state: {
                generated: expect.objectContaining({
                    name: 'Midterm',
                    mode: 'assessment',
                    questions: [expect.objectContaining({ prompt: 'Choose the right word' })],
                }),
                generatedShortfalls: [],
            },
        });
    });

    it('groups questions into per-level sections when organizeByLevel is on', () => {
        render(<GenerateTestModal onClose={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('tests.name_label'), { target: { value: 'Leveled' } });
        fireEvent.change(screen.getByLabelText('generateTest.criterion_count_label'), { target: { value: '1' } });
        fireEvent.click(screen.getByRole('checkbox', { name: 'generateTest.organize_by_level_label' }));
        fireEvent.click(screen.getByRole('button', { name: 'generateTest.generate_button' }));

        const state = mockNavigate.mock.calls[0][1].state;
        expect(state.generated.sections).toEqual([expect.objectContaining({ title: 'B1', cefrLevel: 'B1' })]);
        expect(state.generated.questions[0].sectionId).toBe(state.generated.sections[0].id);
    });

    it('bundles section-kind bank items into their own section', () => {
        render(<GenerateTestModal onClose={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('tests.name_label'), { target: { value: 'With passage' } });
        fireEvent.change(screen.getByLabelText('generateTest.criterion_kind_label'), { target: { value: 'section' } });
        fireEvent.change(screen.getByLabelText('generateTest.criterion_count_label'), { target: { value: '1' } });
        fireEvent.click(screen.getByRole('button', { name: 'generateTest.generate_button' }));

        const state = mockNavigate.mock.calls[0][1].state;
        expect(state.generated.sections).toEqual([
            expect.objectContaining({ title: 'Passage 1', content: '<p>Stimulus text</p>' }),
        ]);
        expect(state.generated.questions).toEqual([
            expect.objectContaining({ prompt: 'What is the main idea?', sectionId: state.generated.sections[0].id }),
        ]);
    });

    it('reports shortfalls when the bank cannot satisfy a row', () => {
        render(<GenerateTestModal onClose={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('tests.name_label'), { target: { value: 'Too few' } });
        // Default row asks for 5 questions but the bank only has one
        fireEvent.click(screen.getByRole('button', { name: 'generateTest.generate_button' }));

        const state = mockNavigate.mock.calls[0][1].state;
        expect(state.generatedShortfalls).toHaveLength(1);
        expect(state.generatedShortfalls[0]).toContain('generateTest.shortfall_row');
        expect(state.generated.questions).toHaveLength(1);
    });

    it('closes via the header and cancel buttons', () => {
        const onClose = vi.fn();
        render(<GenerateTestModal onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
        fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });
});
