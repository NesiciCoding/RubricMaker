import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TestChecksPanel, { type TestCheckRow } from '../TestChecksPanel';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) =>
            opts && Object.keys(opts).length > 0 ? `${key} ${JSON.stringify(opts)}` : key,
        i18n: { language: 'en' },
    }),
}));

// A test-level hint names no question, so it must not render a jump link.
function setNoQualityJump(quality: HTMLElement, key: string): boolean {
    const row = Array.from(quality.querySelectorAll('li')).find((li) => li.textContent?.includes(key));
    return Boolean(row) && row!.querySelector('button') === null;
}

const rows: TestCheckRow[] = [
    { questionId: 'q1', number: 1, label: 'First prompt', issues: ['empty_prompt', 'no_correct_option'] },
    { questionId: 'q3', number: 3, label: 'Third prompt', issues: ['no_model_answer'] },
];

function renderPanel(overrides: Partial<React.ComponentProps<typeof TestChecksPanel>> = {}) {
    const onJump = vi.fn();
    const onBack = vi.fn();
    const onSave = vi.fn();
    const onAssign = vi.fn();
    render(
        <TestChecksPanel
            rows={rows}
            noQuestions={false}
            questionCount={3}
            totalPoints={7}
            verified={[{ id: 'points', labelKey: 'tests.checks_ok_points', values: { points: 7 } }]}
            onJump={onJump}
            onBack={onBack}
            onSave={onSave}
            onAssign={onAssign}
            {...overrides}
        />
    );
    return { onJump, onBack, onSave, onAssign };
}

describe('TestChecksPanel', () => {
    it('lists each blocking question with every issue it has', () => {
        renderPanel();
        expect(screen.getByText('tests.issues_title')).toBeInTheDocument();
        const first = screen.getByTestId('checks-row-q1');
        expect(first).toHaveTextContent('First prompt');
        expect(first).toHaveTextContent('tests.issue_empty_prompt');
        expect(first).toHaveTextContent('tests.issue_no_correct_option');
        expect(screen.getByTestId('checks-row-q3')).toHaveTextContent('tests.issue_no_model_answer');
    });

    it('jumps to the question that was clicked', () => {
        const { onJump } = renderPanel();
        fireEvent.click(screen.getByTestId('checks-jump-q3'));
        expect(onJump).toHaveBeenCalledWith('q3');
    });

    it('says so when nothing blocks assigning', () => {
        renderPanel({ rows: [] });
        expect(screen.getByText('tests.checks_ready')).toBeInTheDocument();
        expect(screen.queryByText('tests.issues_title')).not.toBeInTheDocument();
        expect(screen.queryByTestId('checks-row-q1')).not.toBeInTheDocument();
    });

    it('shows the empty-test blocker', () => {
        renderPanel({ rows: [], noQuestions: true, questionCount: 0, totalPoints: 0 });
        expect(screen.getByText('tests.issue_no_questions')).toBeInTheDocument();
        expect(screen.getByText('tests.issues_title')).toBeInTheDocument();
    });

    it('shows quality hints with a link to the question they name', () => {
        const { onJump } = renderPanel({
            quality: [
                { id: 'time_over', questionIds: [], numbers: [], values: { minutes: 70, duration: 60 } },
                { id: 'duplicate_options', questionIds: ['q3'], numbers: [3], values: { number: 3 } },
            ],
        });
        const quality = screen.getByTestId('checks-quality');
        expect(quality).toHaveTextContent('tests.quality_title');
        expect(quality).toHaveTextContent(/tests\.quality_time_over/);
        expect(quality).toHaveTextContent('70');
        expect(setNoQualityJump(quality, 'tests.quality_time_over')).toBe(true);
        fireEvent.click(screen.getByTestId('quality-jump-q3'));
        expect(onJump).toHaveBeenCalledWith('q3');
    });

    it('applies an inline fix without jumping away', () => {
        const apply = vi.fn();
        const { onJump } = renderPanel({
            rows: [
                {
                    questionId: 'q2',
                    number: 2,
                    label: 'Second prompt',
                    issues: ['no_model_answer'],
                    fixes: [{ control: 'text', labelKey: 'tests.fix_model_answer', value: '', apply }],
                },
            ],
        });
        const input = screen.getByTestId('q2-fix-0-input');
        expect(screen.getByTestId('q2-fix-0-apply')).toBeDisabled();
        fireEvent.change(input, { target: { value: 'Paris' } });
        fireEvent.click(screen.getByTestId('q2-fix-0-apply'));
        expect(apply).toHaveBeenCalledWith('Paris');
        expect(onJump).not.toHaveBeenCalled();
    });

    it('offers the correct-option fix as a pick of the options', () => {
        const apply = vi.fn();
        renderPanel({
            rows: [
                {
                    questionId: 'q1',
                    number: 1,
                    label: 'Prompt',
                    issues: ['no_correct_option'],
                    fixes: [
                        {
                            control: 'select',
                            labelKey: 'tests.fix_correct_option',
                            value: 'a',
                            options: [
                                { value: 'a', label: 'Alpha' },
                                { value: 'b', label: 'Beta' },
                            ],
                            apply,
                        },
                    ],
                },
            ],
        });
        fireEvent.change(screen.getByTestId('q1-fix-0-input'), { target: { value: 'b' } });
        fireEvent.click(screen.getByTestId('q1-fix-0-apply'));
        expect(apply).toHaveBeenCalledWith('b');
    });

    it('gives a quality hint a single action button and no input', () => {
        const apply = vi.fn();
        renderPanel({
            quality: [
                {
                    id: 'time_over',
                    questionIds: [],
                    numbers: [],
                    values: { minutes: 70, duration: 60 },
                    fixes: [{ control: 'action', labelKey: 'tests.fix_change_time_limit', value: '', apply }],
                },
            ],
        });
        expect(screen.queryByTestId('quality-time_over-test-fix-0-input')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('quality-time_over-test-fix-0-apply'));
        expect(apply).toHaveBeenCalledWith('');
    });

    it('offers no inline fixes on a read-only shared test', () => {
        renderPanel({
            readOnly: true,
            rows: [
                {
                    questionId: 'q2',
                    number: 2,
                    label: 'Second prompt',
                    issues: ['no_model_answer'],
                    fixes: [{ control: 'text', labelKey: 'tests.fix_model_answer', value: '', apply: vi.fn() }],
                },
            ],
        });
        expect(screen.queryByTestId('q2-fix-0-input')).not.toBeInTheDocument();
        expect(screen.getByTestId('checks-jump-q2')).toBeInTheDocument();
    });

    it('shows no quality block when there is nothing to improve', () => {
        renderPanel();
        expect(screen.queryByTestId('checks-quality')).not.toBeInTheDocument();
    });

    it('lists what is already fine', () => {
        renderPanel();
        const verified = screen.getByTestId('checks-verified');
        expect(verified).toHaveTextContent('tests.checks_verified_title');
        expect(verified).toHaveTextContent(/tests\.checks_ok_points/);
        expect(verified).toHaveTextContent('7');
    });

    it('saves, assigns and goes back from the footer', () => {
        const { onSave, onAssign, onBack } = renderPanel();
        fireEvent.click(screen.getByTestId('checks-save'));
        expect(onSave).toHaveBeenCalled();
        fireEvent.click(screen.getByTestId('checks-assign'));
        expect(onAssign).toHaveBeenCalled();
        fireEvent.click(screen.getByTestId('checks_back'));
        expect(onBack).toHaveBeenCalled();
    });

    it('offers no save or assign on a read-only shared test', () => {
        renderPanel({ readOnly: true });
        expect(screen.queryByTestId('checks-save')).not.toBeInTheDocument();
        expect(screen.queryByTestId('checks-assign')).not.toBeInTheDocument();
        expect(screen.getByTestId('checks_back')).toBeInTheDocument();
    });
});
