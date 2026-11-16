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
