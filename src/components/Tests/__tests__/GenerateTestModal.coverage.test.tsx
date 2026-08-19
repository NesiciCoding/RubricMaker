import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GenerateTestModal from '../GenerateTestModal';
import type { QuestionBankItem } from '../../../types';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
}));

let mockQuestionBank: QuestionBankItem[];

const makeAppValue = () => ({ questionBank: mockQuestionBank });

vi.mock('../../../context/AppContext', () => ({
    useApp: () => makeAppValue(),
    useRoster: () => makeAppValue(),
    useAuthoring: () => makeAppValue(),
    useAssessment: () => makeAppValue(),
    useEssays: () => makeAppValue(),
    useFlashcards: () => makeAppValue(),
    useSettings: () => makeAppValue(),
    usePlatform: () => makeAppValue(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const b1: QuestionBankItem = {
    id: 'b1',
    cefrLevel: 'B1',
    tags: ['vocabulary'],
    createdAt: '2024-01-01T00:00:00Z',
    question: { id: 'q1', prompt: 'Word choice', type: 'multiple-choice', points: 1 },
};
const b2: QuestionBankItem = {
    id: 'b2',
    cefrLevel: 'A2',
    tags: ['reading'],
    createdAt: '2024-01-02T00:00:00Z',
    question: { id: 'q2', prompt: 'Comprehension', type: 'open', points: 2 },
};
const b3: QuestionBankItem = {
    id: 'b3',
    cefrLevel: 'B1',
    tags: ['vocabulary'],
    createdAt: '2024-01-03T00:00:00Z',
    question: { id: 'q3', prompt: 'Another word', type: 'short-answer', points: 1 },
};

beforeEach(() => {
    mockQuestionBank = [b1, b2, b3];
    mockNavigate.mockClear();
});

function setup() {
    render(<GenerateTestModal onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('tests.name_label'), { target: { value: 'Test' } });
}

function state() {
    return mockNavigate.mock.calls[0][1].state;
}

describe('GenerateTestModal coverage', () => {
    it('skips already-used items across rows and preserves the other row', () => {
        setup();
        // two rows, each asking for more than the pool
        fireEvent.click(screen.getByRole('button', { name: 'generateTest.add_criterion' }));
        const counts = screen.getAllByLabelText('generateTest.criterion_count_label');
        fireEvent.change(counts[0], { target: { value: '2' } });
        fireEvent.change(counts[1], { target: { value: '2' } });
        // changing row 1's kind exercises the updateRow false arm for row 2
        fireEvent.change(screen.getAllByLabelText('generateTest.criterion_kind_label')[0], {
            target: { value: 'section' },
        });
        fireEvent.change(screen.getAllByLabelText('generateTest.criterion_kind_label')[0], {
            target: { value: 'question' },
        });

        fireEvent.click(screen.getByRole('button', { name: 'generateTest.generate_button' }));
        const s = state();
        // row 1 picks all three; row 2's pool is empty after the used-skip
        expect(s.generated.questions).toHaveLength(3);
        expect(s.generatedShortfalls).toHaveLength(1);
        expect(s.generatedShortfalls[0]).toContain('generateTest.shortfall_row');
    });

    it('filters by CEFR level, tag, and mode', () => {
        setup();
        fireEvent.change(screen.getByLabelText('questionBank.cefr_level_label'), {
            target: { value: 'B1' },
        });
        fireEvent.change(screen.getByLabelText('generateTest.criterion_tag_label'), {
            target: { value: 'VOCABULARY' }, // case-insensitive tag match
        });
        fireEvent.change(screen.getByLabelText('tests.mode_label'), { target: { value: 'practice' } });

        fireEvent.click(screen.getByRole('button', { name: 'generateTest.generate_button' }));
        const s = state();
        expect(s.generated.questions).toHaveLength(2); // b1 + b3 match B1 + vocabulary
        expect(s.generated.mode).toBe('practice');
    });

    it('reuses the level section when multiple items share a level', () => {
        setup();
        // restrict the pool to the two B1 items so the pick is deterministic
        fireEvent.change(screen.getByLabelText('questionBank.cefr_level_label'), {
            target: { value: 'B1' },
        });
        fireEvent.change(screen.getByLabelText('generateTest.criterion_count_label'), { target: { value: '2' } });
        fireEvent.click(screen.getByRole('checkbox', { name: 'generateTest.organize_by_level_label' }));
        fireEvent.click(screen.getByRole('button', { name: 'generateTest.generate_button' }));

        const s = state();
        // b1 + b3 are both B1 → one shared level section
        expect(s.generated.sections).toHaveLength(1);
        expect(s.generated.sections[0].title).toBe('B1');
        expect(s.generated.questions).toHaveLength(2);
    });

    it('filters out the whole pool when no item matches the tag', () => {
        setup();
        fireEvent.change(screen.getByLabelText('generateTest.criterion_tag_label'), {
            target: { value: 'zebra' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'generateTest.generate_button' }));
        const s = state();
        expect(s.generated.questions).toHaveLength(0);
        expect(s.generatedShortfalls).toHaveLength(1);
    });

    it('clamps the count input to 1 for invalid values', () => {
        setup();
        const count = screen.getByLabelText('generateTest.criterion_count_label');
        fireEvent.change(count, { target: { value: '0' } });
        expect(count).toHaveValue(1);
        fireEvent.click(screen.getByRole('button', { name: 'generateTest.generate_button' }));
        expect(state().generated.questions.length).toBeGreaterThan(0);
    });
});
