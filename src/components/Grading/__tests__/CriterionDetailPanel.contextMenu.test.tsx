import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_FORMAT } from '../../../types';
import type { CommentBankItem, RubricCriterion, RubricLevel, ScoreEntry } from '../../../types';
import CriterionDetailPanel from '../CriterionDetailPanel';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
        i18n: { language: 'en' },
    }),
}));

vi.mock('../CommentComposer', () => ({
    default: () => <textarea aria-label="comment-composer" readOnly />,
}));

const mockShowToast = vi.fn();
vi.mock('../../../hooks/useToast', () => ({ useToast: () => ({ showToast: mockShowToast }) }));

const levels: RubricLevel[] = [
    { id: 'lv1', label: 'Level lv1', minPoints: 3, maxPoints: 5, description: 'Solid', subItems: [] },
    { id: 'lv2', label: 'Level lv2', minPoints: 0, maxPoints: 2, description: 'Not yet', subItems: [] },
];
const criterion: RubricCriterion = {
    id: 'c1',
    title: 'Criterion c1',
    description: '',
    weight: 100,
    levels,
};

function baseEntry(patch: Partial<ScoreEntry> = {}): ScoreEntry {
    return { criterionId: 'c1', levelId: 'lv1', checkedSubItems: [], comment: '', ...patch };
}

function renderPanel({
    entry = baseEntry(),
    previousFeedback,
    insertPrevious,
}: {
    entry?: ScoreEntry;
    previousFeedback?: { name: string; text: string };
    insertPrevious?: (text: string) => void;
} = {}) {
    const updateEntry = vi.fn();
    const onBrowseAll = vi.fn();
    render(
        <CriterionDetailPanel
            criterion={criterion}
            criterionLetter="A"
            entry={entry}
            levels={levels}
            fmt={DEFAULT_FORMAT}
            updateEntry={updateEntry}
            setSubItemScore={vi.fn()}
            commentBank={[] as CommentBankItem[]}
            editorRef={null}
            onInsertChip={vi.fn()}
            onBrowseAll={onBrowseAll}
            audioRecording={false}
            onStartAudio={vi.fn()}
            onStopAudio={vi.fn()}
            onRemoveAudio={vi.fn()}
            previousFeedback={previousFeedback}
            onInsertPreviousFeedback={insertPrevious}
        />
    );
    return { updateEntry, onBrowseAll };
}

describe('CriterionDetailPanel context menu', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
        });
    });

    it('lists the levels as a checked choice on right-click', () => {
        const { onBrowseAll } = renderPanel();
        fireEvent.contextMenu(screen.getByText('Criterion c1'));

        expect(screen.getByRole('menu', { name: 'gradeStudent.menu_label' })).toBeInTheDocument();
        const radios = screen.getAllByRole('menuitemradio');
        expect(radios).toHaveLength(2);
        expect(radios[0]).toHaveAttribute('aria-checked', 'true');
        expect(radios[1]).toHaveAttribute('aria-checked', 'false');

        fireEvent.click(screen.getByRole('menuitem', { name: 'gradeStudent.comment_open_bank' }));
        expect(onBrowseAll).toHaveBeenCalledTimes(1);
    });

    it('sets the chosen level and clears an override', () => {
        const { updateEntry } = renderPanel();
        fireEvent.contextMenu(screen.getByText('Criterion c1'));
        fireEvent.click(screen.getByRole('menuitemradio', { name: /Level lv2/ }));

        expect(updateEntry).toHaveBeenCalledWith({ levelId: 'lv2', overridePoints: undefined });
    });

    it('copies the feedback as plain text', async () => {
        renderPanel({ entry: baseEntry({ comment: '<p>Strong <strong>opening</strong></p>' }) });
        fireEvent.contextMenu(screen.getByText('Criterion c1'));
        fireEvent.click(screen.getByRole('menuitem', { name: 'gradeStudent.menu_copy_feedback' }));

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Strong opening');
        await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('gradeStudent.menu_feedback_copied', 'success'));
    });

    it('disables copying when the criterion has no feedback yet', () => {
        renderPanel();
        fireEvent.contextMenu(screen.getByText('Criterion c1'));
        expect(screen.getByRole('menuitem', { name: 'gradeStudent.menu_copy_feedback' })).toBeDisabled();
    });

    it('inserts the previous student feedback at the caret', () => {
        const insertPrevious = vi.fn();
        renderPanel({ previousFeedback: { name: 'Bram', text: 'Nice work' }, insertPrevious });
        fireEvent.contextMenu(screen.getByText('Criterion c1'));
        fireEvent.click(screen.getByRole('menuitem', { name: /Bram/ }));

        expect(insertPrevious).toHaveBeenCalledWith('Nice work');
    });

    it('omits the previous student item when there is nothing to reuse', () => {
        renderPanel();
        fireEvent.contextMenu(screen.getByText('Criterion c1'));
        expect(
            screen.queryByRole('menuitem', { name: /gradeStudent.menu_use_previous_feedback/ })
        ).not.toBeInTheDocument();
    });

    it('leaves the native menu alone over the points slider', () => {
        renderPanel();
        // fireEvent returns false when a handler called preventDefault().
        const notPrevented = fireEvent.contextMenu(screen.getByRole('slider'));
        expect(notPrevented).toBe(true);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
});
