import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_FORMAT } from '../../../types';
import type { RubricCriterion, RubricFormat, ScoreEntry, StudentRubric } from '../../../types';
import GradingGrid from '../GradingGrid';

const { mockDeleteByPath } = vi.hoisted(() => ({ mockDeleteByPath: vi.fn() }));

vi.mock('../../../services/database', () => ({
    storageSync: {
        feedbackAudioSync: { deleteByPath: mockDeleteByPath },
    },
}));

vi.mock('../../../hooks/useFeedbackAudioSrc', () => ({
    useFeedbackAudioSrc: () => 'data:audio/webm;base64,aaa',
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

const fmt: RubricFormat = { ...DEFAULT_FORMAT };

function makeCriterion(id: string, levels: RubricCriterion['levels']): RubricCriterion {
    return {
        id,
        title: `Criterion ${id}`,
        description: '',
        weight: 10,
        levels,
    };
}

const levelA = {
    id: 'l0a',
    label: 'Fluent',
    minPoints: 90,
    maxPoints: 100,
    description: 'Fluent and accurate',
    cefrLevel: 'B1' as const,
    subItems: [{ id: 'si1', label: 'Depth', minPoints: 1, maxPoints: 4 }],
};
const levelB = {
    id: 'l0b',
    label: 'Basic',
    minPoints: 50,
    maxPoints: 60,
    description: '',
    cefrLevel: undefined,
    subItems: [],
};
const singleLevel = {
    id: 'l1a',
    label: 'Only',
    minPoints: 80,
    maxPoints: 80,
    description: 'Only option',
    cefrLevel: undefined,
    subItems: [],
};
const fillerLevel = {
    id: 'fx',
    label: 'Filler',
    minPoints: 70,
    maxPoints: 70,
    description: 'Filler option',
    cefrLevel: undefined,
    subItems: [],
};

// 27 criteria so the last letter hits the index >= 26 fallback ('A2').
const criteria: RubricCriterion[] = [
    makeCriterion('c0', [levelA, levelB]),
    makeCriterion('c1', [singleLevel]),
    ...Array.from({ length: 25 }, (_, i) => makeCriterion(`c${i + 2}`, [fillerLevel])),
];

const entry0: ScoreEntry = {
    criterionId: 'c0',
    levelId: 'l0a',
    overridePoints: 85,
    checkedSubItems: [],
    comment: '',
    audioStoragePath: 'audio/p1',
};
const entry1: ScoreEntry = { criterionId: 'c1', levelId: null, checkedSubItems: [], comment: '' };

const sr: StudentRubric = {
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [
        entry0,
        entry1,
        ...Array.from({ length: 25 }, (_, i) => ({
            criterionId: `c${i + 2}`,
            levelId: null,
            checkedSubItems: [],
            comment: '',
        })),
    ],
    overallComment: '',
    isPeerReview: false,
};

const mockUpdateEntry = vi.fn();
const mockSetSubItemScore = vi.fn();
const mockOnInsertChip = vi.fn();
const mockOnBrowseAll = vi.fn();
const mockOnStartAudio = vi.fn();
const mockOnStopAudio = vi.fn();
const mockSetFocusedIdx = vi.fn();

function renderGrid(focusedIdx: number | null = 0) {
    return render(
        <GradingGrid
            criteria={criteria}
            sr={sr}
            fmt={fmt}
            orderedLevels={(c) => c.levels}
            focusedIdx={focusedIdx}
            setFocusedIdx={mockSetFocusedIdx}
            updateEntry={mockUpdateEntry}
            setSubItemScore={mockSetSubItemScore}
            commentBank={[]}
            commentEditorRef={null}
            onInsertChip={mockOnInsertChip}
            onBrowseAll={mockOnBrowseAll}
            recordingKey={null}
            onStartAudio={mockOnStartAudio}
            onStopAudio={mockOnStopAudio}
        />
    );
}

describe('GradingGrid coverage', () => {
    beforeEach(() => {
        mockUpdateEntry.mockClear();
        mockSetSubItemScore.mockClear();
        mockDeleteByPath.mockClear();
        mockOnInsertChip.mockClear();
        mockOnBrowseAll.mockClear();
        mockOnStartAudio.mockClear();
        mockOnStopAudio.mockClear();
        mockSetFocusedIdx.mockClear();
    });

    it('renders letters, override, single-point labels, CEFR tags, and filler cells', () => {
        renderGrid();
        // The index-26 fallback letter (criterion 27 = 'A2').
        expect(screen.getByText('A2')).toBeInTheDocument();
        // Override label with points (text split across child nodes).
        expect(screen.getByText(/gradeStudent.label_override/)).toBeInTheDocument();
        expect(screen.getAllByText('85').length).toBeGreaterThan(0);
        // Range label for the two-point level, single-point label for c1.
        expect(screen.getByText('90–100gradeStudent.table_points')).toBeInTheDocument();
        expect(screen.getByText('80gradeStudent.table_points')).toBeInTheDocument();
        // CEFR tag on the cefrLevel level.
        expect(screen.getByText('B1')).toBeInTheDocument();
        // Level descriptions: present for Fluent, absent for Basic (select prompt).
        expect(screen.getByText('Fluent and accurate')).toBeInTheDocument();
        expect(screen.getByText('gradeStudent.level_select')).toBeInTheDocument();
        // Filler cell because c1 has one level vs the max of two.
        expect(document.querySelector('.grid-cell-filler')).not.toBeNull();
    });

    it('selects and deselects a level through the cell click', () => {
        const { rerender } = renderGrid();
        // c1's single level is unselected → click sets it and clears any override.
        const cellBtn = screen.getByText('Only option').closest('.grid-cell-btn')!;
        fireEvent.click(cellBtn);
        expect(mockUpdateEntry).toHaveBeenCalledWith('c1', {
            levelId: 'l1a',
            overridePoints: undefined,
        });
        // Rerender with the updated entry so the cell is now selected.
        entry1.levelId = 'l1a';
        rerender(
            <GradingGrid
                criteria={criteria}
                sr={{ ...sr, entries: sr.entries.map((e) => (e.criterionId === 'c1' ? entry1 : e)) }}
                fmt={fmt}
                orderedLevels={(c) => c.levels}
                focusedIdx={0}
                setFocusedIdx={mockSetFocusedIdx}
                updateEntry={mockUpdateEntry}
                setSubItemScore={mockSetSubItemScore}
                commentBank={[]}
                commentEditorRef={null}
                onInsertChip={mockOnInsertChip}
                onBrowseAll={mockOnBrowseAll}
                recordingKey={null}
                onStartAudio={mockOnStartAudio}
                onStopAudio={mockOnStopAudio}
            />
        );
        // Now selected → click again deselects to null.
        fireEvent.click(screen.getByText('Only option').closest('.grid-cell-btn')!);
        expect(mockUpdateEntry).toHaveBeenLastCalledWith('c1', {
            levelId: null,
            overridePoints: undefined,
        });
        entry1.levelId = null;
    });

    it('renders the focused detail panel and drives its callbacks', () => {
        const { rerender } = renderGrid(0);
        // Focused row renders the detail panel with the comment composer.
        expect(screen.getByPlaceholderText('gradeStudent.comment_placeholder')).toBeInTheDocument();
        // Browse-all and audio record call the wrapped handlers.
        fireEvent.click(screen.getByTitle('gradeStudent.comment_open_bank'));
        expect(mockOnBrowseAll).toHaveBeenCalledWith('c0');
        fireEvent.click(screen.getByText('gradeStudent.audio_record'));
        expect(mockOnStartAudio).toHaveBeenCalledWith('c0');
        // The override stepper and sub-item range drive the wrapped update handlers.
        const overrideGroup = screen.getByRole('group', { name: 'gradeStudent.override_label' });
        fireEvent.click(within(overrideGroup).getByLabelText('gradeStudent.stepper_increase'));
        expect(mockUpdateEntry).toHaveBeenCalledWith('c0', { overridePoints: 85.5 });
        // Range sub-items expand to reveal the slider.
        fireEvent.click(screen.getByText(/Depth ·/));
        fireEvent.change(screen.getByRole('slider', { name: 'Depth' }), { target: { value: '3' } });
        expect(mockSetSubItemScore).toHaveBeenCalledWith(entry0, 'si1', 3);
        // Rerender while recording → stop calls the wrapped handler.
        rerender(
            <GradingGrid
                criteria={criteria}
                sr={sr}
                fmt={fmt}
                orderedLevels={(c) => c.levels}
                focusedIdx={0}
                setFocusedIdx={mockSetFocusedIdx}
                updateEntry={mockUpdateEntry}
                setSubItemScore={mockSetSubItemScore}
                commentBank={[]}
                commentEditorRef={null}
                onInsertChip={mockOnInsertChip}
                onBrowseAll={mockOnBrowseAll}
                recordingKey="c0"
                onStartAudio={mockOnStartAudio}
                onStopAudio={mockOnStopAudio}
            />
        );
        fireEvent.click(screen.getByText('gradeStudent.audio_stop'));
        expect(mockOnStopAudio).toHaveBeenCalledWith('c0');
        // Remove the stored audio → deletes the path and clears the entry fields.
        fireEvent.click(screen.getByLabelText('gradeStudent.audio_remove'));
        expect(mockDeleteByPath).toHaveBeenCalledWith('audio/p1');
        expect(mockUpdateEntry).toHaveBeenCalledWith('c0', {
            audioDataUrl: undefined,
            audioStoragePath: undefined,
        });
        // Inline base64 audio (no storage path) → the delete guard's false arm.
        entry0.audioStoragePath = undefined;
        entry0.audioDataUrl = 'data:audio/webm;base64,bbb';
        rerender(
            <GradingGrid
                criteria={criteria}
                sr={sr}
                fmt={fmt}
                orderedLevels={(c) => c.levels}
                focusedIdx={0}
                setFocusedIdx={mockSetFocusedIdx}
                updateEntry={mockUpdateEntry}
                setSubItemScore={mockSetSubItemScore}
                commentBank={[]}
                commentEditorRef={null}
                onInsertChip={mockOnInsertChip}
                onBrowseAll={mockOnBrowseAll}
                recordingKey={null}
                onStartAudio={mockOnStartAudio}
                onStopAudio={mockOnStopAudio}
            />
        );
        fireEvent.click(screen.getByLabelText('gradeStudent.audio_remove'));
        expect(mockDeleteByPath).not.toHaveBeenCalledTimes(2);
        expect(mockUpdateEntry).toHaveBeenLastCalledWith('c0', {
            audioDataUrl: undefined,
            audioStoragePath: undefined,
        });
        entry0.audioStoragePath = 'audio/p1';
        entry0.audioDataUrl = undefined;
    });

    it('renders without a focused row', () => {
        renderGrid(null);
        expect(document.querySelector('.grading-grid-table')).not.toBeNull();
        expect(screen.queryByPlaceholderText('gradeStudent.comment_placeholder')).not.toBeInTheDocument();
    });
});
