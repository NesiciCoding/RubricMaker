import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_FORMAT } from '../../../types';
import type { CommentBankItem, RubricCriterion, RubricLevel, ScoreEntry } from '../../../types';
import CriterionDetailPanel from '../CriterionDetailPanel';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('../CommentComposer', () => ({
    default: ({ value, onChange }: { value: string; onChange: (html: string) => void }) => (
        <textarea aria-label="comment-composer" value={value} onChange={(e) => onChange(e.target.value)} />
    ),
}));

const fmt = DEFAULT_FORMAT;

function makeLevel(
    id: string,
    minPoints: number,
    maxPoints: number,
    description: string,
    subItems: RubricLevel['subItems']
): RubricLevel {
    return { id, label: `Level ${id}`, minPoints, maxPoints, description, subItems };
}

function makeCriterion(id: string, levels: RubricLevel[]): RubricCriterion {
    return { id, title: `Criterion ${id}`, description: '', weight: 100, levels };
}

function makeEntry(partial: Partial<ScoreEntry>): ScoreEntry {
    return {
        criterionId: 'c1',
        levelId: null,
        checkedSubItems: [],
        comment: '',
        ...partial,
    };
}

function renderPanel(criterion: RubricCriterion, entry: ScoreEntry, updateEntry: (patch: Partial<ScoreEntry>) => void) {
    const setSubItemScore = vi.fn();
    const view = render(
        <CriterionDetailPanel
            criterion={criterion}
            criterionLetter="A"
            entry={entry}
            levels={criterion.levels}
            fmt={fmt}
            updateEntry={updateEntry}
            setSubItemScore={setSubItemScore}
            commentBank={[] as CommentBankItem[]}
            editorRef={null}
            onInsertChip={vi.fn()}
            onBrowseAll={vi.fn()}
            audioRecording={false}
            onStartAudio={vi.fn()}
            onStopAudio={vi.fn()}
            onRemoveAudio={vi.fn()}
        />
    );
    const rerender = (nextEntry: ScoreEntry) =>
        view.rerender(
            <CriterionDetailPanel
                criterion={criterion}
                criterionLetter="A"
                entry={nextEntry}
                levels={criterion.levels}
                fmt={fmt}
                updateEntry={updateEntry}
                setSubItemScore={setSubItemScore}
                commentBank={[] as CommentBankItem[]}
                editorRef={null}
                onInsertChip={vi.fn()}
                onBrowseAll={vi.fn()}
                audioRecording={false}
                onStartAudio={vi.fn()}
                onStopAudio={vi.fn()}
                onRemoveAudio={vi.fn()}
            />
        );
    return { rerender, setSubItemScore };
}

const bareSubItem = { id: 'si-bare', label: 'Bare' };
const singleSubItem = { id: 'si-single', label: 'Clarity', minPoints: 2, maxPoints: 2 };
const rangeSubItem = { id: 'si-range', label: 'Depth', minPoints: 1, maxPoints: 4 };
const legacySubItem = { id: 'si-legacy', label: 'Legacy', points: 5 };

beforeEach(() => {
    vi.clearAllMocks();
});

describe('CriterionDetailPanel coverage', () => {
    it('renders the base-points editor for a plain level and drives slider, stepper, override and comment', () => {
        const levelA = makeLevel('lvA', 6, 10, 'Full command', []);
        const criterion = makeCriterion('c1', [levelA]);
        const updateEntry = vi.fn();
        const { rerender, setSubItemScore } = renderPanel(
            criterion,
            makeEntry({ levelId: 'lvA', selectedPoints: 8, comment: 'nice' }),
            updateEntry
        );

        expect(screen.getByText('Criterion c1')).toBeInTheDocument();
        expect(screen.getByText('Level lvA')).toBeInTheDocument();
        expect(screen.getByText(/Full command/)).toBeInTheDocument();
        // No sub-item chips on a plain level.
        expect(screen.queryByText(/Clarity/)).toBeNull();

        // Base-points range slider (the TouchStepper group shares the same label).
        const slider = screen.getAllByLabelText('gradeStudent.label_points')[0] as HTMLInputElement;
        fireEvent.change(slider, { target: { value: '9' } });
        expect(updateEntry).toHaveBeenCalledWith({ selectedPoints: 9 });

        // Base-points TouchStepper increase.
        fireEvent.click(screen.getByLabelText('gradeStudent.stepper_increase'));
        expect(updateEntry).toHaveBeenCalledWith({ selectedPoints: 8.5 });

        // Override on.
        fireEvent.click(screen.getByRole('checkbox'));
        expect(updateEntry).toHaveBeenCalledWith({ overridePoints: 8 });

        // With override set, the override stepper renders; step it up.
        rerender(makeEntry({ levelId: 'lvA', selectedPoints: 8, overridePoints: 8 }));
        const overrideGroup = screen.getByRole('group', { name: 'gradeStudent.override_label' });
        fireEvent.click(within(overrideGroup).getByLabelText('gradeStudent.stepper_increase'));
        expect(updateEntry).toHaveBeenCalledWith({ overridePoints: 8.5 });

        // Override off.
        fireEvent.click(screen.getByRole('checkbox'));
        expect(updateEntry).toHaveBeenCalledWith({ overridePoints: undefined });

        // Comment composer.
        fireEvent.change(screen.getByLabelText('comment-composer'), { target: { value: 'revised' } });
        expect(updateEntry).toHaveBeenCalledWith({ comment: 'revised' });

        expect(setSubItemScore).not.toHaveBeenCalled();
    });

    it('accepts a typed override mark and clamps it to the criterion maximum', () => {
        const levelA = makeLevel('lvA', 6, 10, 'Full command', []);
        const criterion = makeCriterion('c1', [levelA]);
        const updateEntry = vi.fn();
        renderPanel(criterion, makeEntry({ levelId: 'lvA', selectedPoints: 8, overridePoints: 8 }), updateEntry);

        const input = screen.getByRole('spinbutton', {
            name: 'gradeStudent.override_label',
        }) as HTMLInputElement;

        // An exact mark in one go, instead of tapping a 0.5 stepper up to 100 times.
        fireEvent.change(input, { target: { value: '9.5' } });
        expect(updateEntry).toHaveBeenCalledWith({ overridePoints: 9.5 });

        fireEvent.change(input, { target: { value: '12' } });
        expect(updateEntry).toHaveBeenCalledWith({ overridePoints: 10 });

        fireEvent.change(input, { target: { value: '-3' } });
        expect(updateEntry).toHaveBeenCalledWith({ overridePoints: 0 });

        // Clearing the field is ignored, so it can be retyped without jumping to 0.
        updateEntry.mockClear();
        fireEvent.change(input, { target: { value: '' } });
        expect(updateEntry).not.toHaveBeenCalled();
    });

    it('renders sub-item chips alongside base points and toggles single chips', () => {
        const levelE = makeLevel('lvE', 6, 10, '', [bareSubItem, singleSubItem, rangeSubItem, legacySubItem]);
        const criterion = makeCriterion('c2', [levelE]);
        const updateEntry = vi.fn();
        const { rerender, setSubItemScore } = renderPanel(
            criterion,
            makeEntry({ levelId: 'lvE', subItemScores: { 'si-single': 1 }, checkedSubItems: ['si-legacy'] }),
            updateEntry
        );

        // hasAnySubItems → base-points label variant.
        expect(screen.getAllByLabelText('gradeStudent.label_base_points').length).toBeGreaterThan(0);

        // Single chip: score 1 < max 2 → not selected; click scores max.
        const singleChip = screen.getByRole('button', { name: /Clarity/ });
        expect(singleChip).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(singleChip);
        expect(setSubItemScore).toHaveBeenCalledWith('si-single', 2);

        // Selected state renders aria-pressed true.
        rerender(makeEntry({ levelId: 'lvE', subItemScores: { 'si-single': 2 } }));
        const selectedChip = screen.getByRole('button', { name: /Clarity/ });
        expect(selectedChip).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(selectedChip);
        expect(setSubItemScore).toHaveBeenCalledWith('si-single', 2);

        // Legacy chip (points-only sub item): currentScore falls back to legacy max when checked.
        expect(screen.getByRole('button', { name: /Legacy/ })).toBeInTheDocument();
        // Bare chip (no maxPoints, no points): falls back to 1.
        expect(screen.getByRole('button', { name: /Bare/ })).toBeInTheDocument();
    });

    it('expands a range sub-item, drives its scorer, and collapses it', () => {
        const levelE = makeLevel('lvE', 6, 10, '', [singleSubItem, rangeSubItem, legacySubItem]);
        const criterion = makeCriterion('c2', [levelE]);
        const { rerender, setSubItemScore } = renderPanel(
            criterion,
            makeEntry({ levelId: 'lvE', checkedSubItems: undefined }),
            vi.fn()
        );

        const rangeChip = screen.getByRole('button', { name: /Depth/ });
        expect(rangeChip).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(rangeChip);
        expect(rangeChip).toHaveAttribute('aria-expanded', 'true');

        const rangeSlider = screen.getAllByLabelText('Depth')[0] as HTMLInputElement;
        expect(rangeSlider).toHaveAttribute('min', '1');
        fireEvent.change(rangeSlider, { target: { value: '3' } });
        expect(setSubItemScore).toHaveBeenCalledWith('si-range', 3);

        // Stepper inside the expanded scorer.
        rerender(makeEntry({ levelId: 'lvE', subItemScores: { 'si-range': 3 } }));
        const scorerGroup = screen.getAllByLabelText('Depth')[1] as HTMLElement;
        fireEvent.click(within(scorerGroup).getByLabelText('gradeStudent.stepper_increase'));
        expect(setSubItemScore).toHaveBeenCalledWith('si-range', 3.5);

        // Collapse.
        fireEvent.click(screen.getByRole('button', { name: /Depth/ }));
        const collapsedChip = screen.getByRole('button', { name: /Depth/ });
        expect(collapsedChip).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByLabelText('Depth')).toBeNull();
    });

    it('hides the base-points editor when the selected level is a sub-item-only single point', () => {
        const levelD = makeLevel('lvD', 4, 4, 'No base points', [singleSubItem, rangeSubItem]);
        const criterion = makeCriterion('c3', [levelD]);
        renderPanel(criterion, makeEntry({ levelId: 'lvD' }), vi.fn());
        expect(screen.queryByLabelText('gradeStudent.label_base_points')).toBeNull();
        expect(screen.queryByLabelText('gradeStudent.label_points')).toBeNull();
        expect(screen.getByRole('button', { name: /Clarity/ })).toBeInTheDocument();
    });

    it('shows base points for a single-point level with no sub-items', () => {
        const levelC = makeLevel('lvC', 5, 5, 'Single point', []);
        const criterion = makeCriterion('c4', [levelC]);
        const updateEntry = vi.fn();
        renderPanel(criterion, makeEntry({ levelId: 'lvC' }), updateEntry);

        const slider = screen.getAllByLabelText('gradeStudent.label_points')[0] as HTMLInputElement;
        expect(slider).toHaveAttribute('min', '5');
        expect(slider).toHaveAttribute('max', '5');
        expect(slider).toHaveAttribute('value', '5');

        // Override without selectedPoints → falls back to the level's minPoints.
        fireEvent.click(screen.getByRole('checkbox'));
        expect(updateEntry).toHaveBeenCalledWith({ overridePoints: 5 });
    });

    it('renders the pick-level placeholder and defaults the override to zero without a level', () => {
        const levelA = makeLevel('lvA', 6, 10, 'Full command', []);
        const criterion = makeCriterion('c5', [levelA]);
        const updateEntry = vi.fn();
        const { rerender } = renderPanel(criterion, makeEntry({}), updateEntry);

        expect(screen.getByText('gradeStudent.grid_pick_level')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('checkbox'));
        expect(updateEntry).toHaveBeenCalledWith({ overridePoints: 0 });

        // Override section renders once overridePoints is set.
        rerender(makeEntry({ overridePoints: 2 }));
        expect(screen.getAllByText((_, el) => (el?.textContent ?? '').includes('/ 10')).length).toBeGreaterThan(0);
    });

    it('treats a criterion with no declared maximum as uncapped for a typed override', () => {
        const levelA = makeLevel('lvA', 0, 0, 'Uncapped', []);
        const criterion = makeCriterion('c9', [levelA]);
        const updateEntry = vi.fn();
        renderPanel(criterion, makeEntry({ levelId: 'lvA', overridePoints: 0 }), updateEntry);

        const input = screen.getByRole('spinbutton', {
            name: 'gradeStudent.override_label',
        }) as HTMLInputElement;
        expect(input).not.toHaveAttribute('max');

        // 7 must survive: a zero maximum is uncapped, not a clamp to zero.
        fireEvent.change(input, { target: { value: '7' } });
        expect(updateEntry).toHaveBeenCalledWith({ overridePoints: 7 });
    });

    it('keeps the typed text while editing and re-normalises the clamped mark on blur', () => {
        const levelA = makeLevel('lvA', 6, 10, 'Full command', []);
        const criterion = makeCriterion('c10', [levelA]);
        const updateEntry = vi.fn();
        const { rerender } = renderPanel(criterion, makeEntry({ levelId: 'lvA', overridePoints: 8 }), updateEntry);

        const input = screen.getByRole('spinbutton', {
            name: 'gradeStudent.override_label',
        }) as HTMLInputElement;

        // The clamped 10 is committed, but the field still shows what was typed so editing continues.
        fireEvent.change(input, { target: { value: '12' } });
        expect(input.value).toBe('12');
        expect(updateEntry).toHaveBeenCalledWith({ overridePoints: 10 });

        // Once the parent echoes the clamped mark and editing ends, the field shows the saved value.
        rerender(makeEntry({ levelId: 'lvA', overridePoints: 10 }));
        fireEvent.blur(input);
        expect(input.value).toBe('10');
    });
});
