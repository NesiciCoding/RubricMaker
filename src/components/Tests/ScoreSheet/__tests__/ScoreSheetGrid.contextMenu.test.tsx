import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { Student, StudentTest, Test } from '../../../../types';
import ScoreSheetGrid from '../ScoreSheetGrid';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
}));

const mockShowToast = vi.fn();
vi.mock('../../../../hooks/useToast', () => ({ useToast: () => ({ showToast: mockShowToast }) }));

const test: Test = {
    id: 't1',
    name: 'Paper test',
    questions: [
        { id: 'q1', prompt: '1a', type: 'open', points: 2 },
        { id: 'q2', prompt: '1b', type: 'open', points: 4 },
    ],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01',
    scoreOnly: true,
    gradingNorm: { type: 'nterm', n: 1 },
};

const students: Student[] = [
    { id: 's1', name: 'Bram', classId: 'c1' },
    { id: 's2', name: 'Anna', classId: 'c1' },
    { id: 's3', name: 'Chris', classId: 'c1' },
];

const bram: StudentTest = {
    id: 'st1',
    testId: 't1',
    studentId: 's1',
    answers: [{ questionId: 'q1', response: '', pointsEarned: 2 }],
    status: 'in_progress',
    startedAt: '2026-01-01',
    source: 'manual',
};

function renderGrid(onSave = vi.fn(), sheet = new Map([['s1', bram]])) {
    render(
        <ScoreSheetGrid
            test={test}
            students={students}
            classes={[]}
            sheetByStudent={sheet}
            scale={null}
            items={[]}
            onSave={onSave}
        />
    );
    return onSave;
}

function cell(row: number, col: number) {
    return document.querySelector<HTMLInputElement>(`[data-cell="${row}-${col}"]`)!;
}

/** Keeps `sheetByStudent` in state and merges `onSave` into it, like the real app does, so a menu
 *  action chosen after an intervening save sees state the way it would in production. */
function StatefulHarness({ onSaveSpy }: { onSaveSpy: (list: StudentTest[]) => void }) {
    const [sheet, setSheet] = useState<Map<string, StudentTest>>(new Map());
    return (
        <ScoreSheetGrid
            test={test}
            students={students}
            classes={[]}
            sheetByStudent={sheet}
            scale={null}
            items={[]}
            onSave={(list) => {
                onSaveSpy(list);
                setSheet((prev) => {
                    const next = new Map(prev);
                    for (const st of list) next.set(st.studentId, st);
                    return next;
                });
            }}
        />
    );
}

describe('ScoreSheetGrid context menu', () => {
    beforeEach(() => vi.clearAllMocks());

    it('pastes a copied block from the cell menu', async () => {
        const onSave = renderGrid();
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { readText: vi.fn().mockResolvedValue('1\t2\n2\t4') },
        });
        fireEvent.contextMenu(cell(1, 0));
        fireEvent.click(screen.getByRole('menuitem', { name: 'tests.scoreSheet.menu_paste' }));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        const saved = onSave.mock.calls[0][0] as StudentTest[];
        expect(saved.map((st) => st.studentId).sort()).toEqual(['s2', 's3']);
        const anna = saved.find((st) => st.studentId === 's2')!;
        expect(anna.answers.map((a) => a.pointsEarned).sort()).toEqual([1, 2]);
        const chris = saved.find((st) => st.studentId === 's3')!;
        expect(chris.answers.map((a) => a.pointsEarned).sort()).toEqual([2, 4]);
    });

    it('explains when the browser refuses clipboard access', async () => {
        const onSave = renderGrid();
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { readText: vi.fn().mockRejectedValue(new Error('denied')) },
        });
        fireEvent.contextMenu(cell(0, 0));
        fireEvent.click(screen.getByRole('menuitem', { name: 'tests.scoreSheet.menu_paste' }));

        await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('tests.scoreSheet.menu_paste_blocked', 'error'));
        expect(onSave).not.toHaveBeenCalled();
    });

    it('opens the cell menu on right-click and leaves the input native menu alone otherwise', () => {
        renderGrid();
        fireEvent.contextMenu(cell(0, 0));
        expect(screen.getByRole('menu', { name: 'tests.scoreSheet.menu_cell_label' })).toBeInTheDocument();
        for (const key of ['menu_mark_absent', 'menu_clear_cell', 'menu_copy_value', 'menu_fill_down']) {
            expect(screen.getByRole('menuitem', { name: `tests.scoreSheet.${key}` })).toBeInTheDocument();
        }
    });

    it('fills the same points down the column for editable, present students', () => {
        const onSave = renderGrid();
        fireEvent.contextMenu(cell(0, 0));
        fireEvent.click(screen.getByRole('menuitem', { name: 'tests.scoreSheet.menu_fill_down' }));

        expect(onSave).toHaveBeenCalledTimes(1);
        const saved = onSave.mock.calls[0][0] as StudentTest[];
        expect(saved.map((st) => st.studentId)).toEqual(['s2', 's3']);
        expect(saved.every((st) => st.answers[0].questionId === 'q1' && st.answers[0].pointsEarned === 2)).toBe(true);
        expect(mockShowToast).toHaveBeenCalledWith('tests.scoreSheet.menu_filled', 'success');
    });

    it('skips absent students when filling down', () => {
        const absentAnna: StudentTest = { ...bram, id: 'st2', studentId: 's2', absent: true, answers: [] };
        const onSave = renderGrid(
            vi.fn(),
            new Map([
                ['s1', bram],
                ['s2', absentAnna],
            ])
        );
        fireEvent.contextMenu(cell(0, 0));
        fireEvent.click(screen.getByRole('menuitem', { name: 'tests.scoreSheet.menu_fill_down' }));

        const saved = onSave.mock.calls[0][0] as StudentTest[];
        expect(saved.map((st) => st.studentId)).toEqual(['s3']);
    });

    it('marks the student absent from the cell menu', () => {
        const onSave = renderGrid();
        fireEvent.contextMenu(cell(0, 0));
        fireEvent.click(screen.getByRole('menuitem', { name: 'tests.scoreSheet.menu_mark_absent' }));

        const saved = onSave.mock.calls[0][0] as StudentTest[];
        expect(saved[0]).toMatchObject({ studentId: 's1', absent: true });
    });

    it('clears the cell', () => {
        const onSave = renderGrid();
        fireEvent.contextMenu(cell(0, 0));
        fireEvent.click(screen.getByRole('menuitem', { name: 'tests.scoreSheet.menu_clear_cell' }));

        const saved = onSave.mock.calls[0][0] as StudentTest[];
        expect(saved[0].answers).toEqual([]);
    });

    it('disables fill-down on the last row and clear on an empty cell', () => {
        renderGrid();
        fireEvent.contextMenu(cell(2, 0));
        expect(screen.getByRole('menuitem', { name: 'tests.scoreSheet.menu_fill_down' })).toBeDisabled();
        expect(screen.getByRole('menuitem', { name: 'tests.scoreSheet.menu_clear_cell' })).toBeDisabled();
    });

    it('gives the row header its own menu', () => {
        renderGrid();
        fireEvent.contextMenu(screen.getByText('Bram'));
        expect(screen.getByRole('menu', { name: 'tests.scoreSheet.menu_row_label' })).toBeInTheDocument();
        for (const key of ['menu_mark_absent', 'menu_clear_row', 'menu_copy_row']) {
            expect(screen.getByRole('menuitem', { name: `tests.scoreSheet.${key}` })).toBeInTheDocument();
        }
    });

    it('clears every question in the row', () => {
        const withTwo: StudentTest = {
            ...bram,
            answers: [
                { questionId: 'q1', response: '', pointsEarned: 2 },
                { questionId: 'q2', response: '', pointsEarned: 3 },
            ],
        };
        const onSave = renderGrid(vi.fn(), new Map([['s1', withTwo]]));
        fireEvent.contextMenu(screen.getByText('Bram'));
        fireEvent.click(screen.getByRole('menuitem', { name: 'tests.scoreSheet.menu_clear_row' }));

        const saved = onSave.mock.calls[0][0] as StudentTest[];
        expect(saved[0].answers).toEqual([]);
    });

    it('regression: "Mark absent" keeps the score the menu\'s own auto-focus just committed', () => {
        // Opening a menu focuses its first item, which blurs the cell being edited and commits its
        // draft. The menu's own action closures were built one tick earlier, before that commit —
        // reading state through a ref (rather than the closed-over value) is what keeps them in sync.
        const onSaveSpy = vi.fn();
        render(<StatefulHarness onSaveSpy={onSaveSpy} />);

        act(() => cell(0, 0).focus());
        fireEvent.change(cell(0, 0), { target: { value: '2' } });
        fireEvent.contextMenu(cell(0, 0));
        expect(onSaveSpy).toHaveBeenCalledTimes(1);
        expect(onSaveSpy.mock.calls[0][0][0]).toMatchObject({
            studentId: 's1',
            answers: [expect.objectContaining({ questionId: 'q1', pointsEarned: 2 })],
        });

        fireEvent.click(screen.getByRole('menuitem', { name: 'tests.scoreSheet.menu_mark_absent' }));

        expect(onSaveSpy).toHaveBeenCalledTimes(2);
        expect(onSaveSpy.mock.calls[1][0][0]).toMatchObject({
            studentId: 's1',
            absent: true,
            answers: [expect.objectContaining({ questionId: 'q1', pointsEarned: 2 })],
        });
    });

    it("regression: pasting from the menu keeps a score the menu's own auto-focus just committed on another cell", async () => {
        const onSaveSpy = vi.fn();
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { readText: vi.fn().mockResolvedValue('3') },
        });
        render(<StatefulHarness onSaveSpy={onSaveSpy} />);

        act(() => cell(0, 0).focus());
        fireEvent.change(cell(0, 0), { target: { value: '2' } });
        fireEvent.contextMenu(cell(0, 1));
        expect(onSaveSpy).toHaveBeenCalledTimes(1);
        expect(onSaveSpy.mock.calls[0][0][0]).toMatchObject({
            studentId: 's1',
            answers: [expect.objectContaining({ questionId: 'q1', pointsEarned: 2 })],
        });

        fireEvent.click(screen.getByRole('menuitem', { name: 'tests.scoreSheet.menu_paste' }));

        await waitFor(() => expect(onSaveSpy).toHaveBeenCalledTimes(2));
        const afterPaste = onSaveSpy.mock.calls[1][0][0] as StudentTest;
        expect(afterPaste.studentId).toBe('s1');
        expect(afterPaste.answers.map((a) => [a.questionId, a.pointsEarned]).sort()).toEqual([
            ['q1', 2],
            ['q2', 3],
        ]);
    });

    it('explains when the browser refuses to copy', async () => {
        renderGrid();
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
        });
        fireEvent.contextMenu(cell(0, 0));
        fireEvent.click(screen.getByRole('menuitem', { name: 'tests.scoreSheet.menu_copy_value' }));

        await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('tests.scoreSheet.menu_copy_blocked', 'error'));
    });

    it('explains when the clipboard API is unavailable, for copy and for paste', async () => {
        const onSave = renderGrid();
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });

        fireEvent.contextMenu(cell(0, 0));
        fireEvent.click(screen.getByRole('menuitem', { name: 'tests.scoreSheet.menu_copy_value' }));
        expect(mockShowToast).toHaveBeenCalledWith('tests.scoreSheet.menu_copy_blocked', 'error');

        mockShowToast.mockClear();
        fireEvent.contextMenu(cell(1, 0));
        fireEvent.click(screen.getByRole('menuitem', { name: 'tests.scoreSheet.menu_paste' }));
        await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('tests.scoreSheet.menu_paste_blocked', 'error'));
        expect(onSave).not.toHaveBeenCalled();
    });
});
