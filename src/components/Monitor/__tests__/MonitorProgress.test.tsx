import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ResponsesGrid from '../ResponsesGrid';
import LevelResponsesGrid from '../LevelResponsesGrid';
import type { StaircaseStep, Test } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) =>
            opts
                ? `${key} ${Object.entries(opts)
                      .map(([k, v]) => `${k}=${String(v)}`)
                      .join(' ')}`
                : key,
        i18n: { language: 'en' },
    }),
}));

const test: Test = {
    id: 't1',
    name: 'Quiz',
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    questions: [
        { id: 'q1', prompt: 'a', type: 'open', points: 1, sectionId: 'secA' },
        { id: 'q2', prompt: 'b', type: 'open', points: 1, sectionId: 'secA' },
        { id: 'q3', prompt: 'c', type: 'open', points: 1, sectionId: 'secB' },
    ],
};

const rows = [
    {
        studentId: 's1',
        displayName: 'Alice',
        answers: [
            { questionId: 'q1', response: 'x' },
            { questionId: 'q2', response: '  ' },
            { questionId: 'q3', response: 'y' },
        ],
    },
    { studentId: 's2', displayName: 'Bob', answers: [{ questionId: 'q1', response: 'z' }], sectionPath: ['secA'] },
];

describe('ResponsesGrid progress', () => {
    it('renders no progress bars by default', () => {
        render(<ResponsesGrid test={test} rows={rows} />);
        expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
        expect(screen.queryByTestId('class-progress-row')).not.toBeInTheDocument();
    });

    it('shows answered over presented questions per student, ignoring blank answers', () => {
        render(<ResponsesGrid test={test} rows={rows} showProgress />);
        const alice = screen.getByRole('progressbar', { name: 'tests.monitor.grid.progress_aria answered=2 total=3' });
        expect(alice).toHaveAttribute('aria-valuenow', '2');
        expect(alice).toHaveAttribute('aria-valuemax', '3');
        // Bob was routed past secB, so only two questions count for him.
        const bob = screen.getByRole('progressbar', { name: 'tests.monitor.grid.progress_aria answered=1 total=2' });
        expect(bob).toHaveAttribute('aria-valuemax', '2');
    });

    it('shows the share of presented students who answered each question, and how many finished', () => {
        render(<ResponsesGrid test={test} rows={rows} showClassProgress />);
        const row = screen.getByTestId('class-progress-row');
        expect(
            within(row).getByRole('progressbar', {
                name: 'tests.monitor.grid.class_progress_aria answered=2 total=2',
            })
        ).toBeInTheDocument();
        expect(
            within(row).getByRole('progressbar', {
                name: 'tests.monitor.grid.class_progress_aria answered=0 total=2',
            })
        ).toBeInTheDocument();
        // q3 was only presented to Alice.
        expect(
            within(row).getByRole('progressbar', {
                name: 'tests.monitor.grid.class_progress_aria answered=1 total=1',
            })
        ).toBeInTheDocument();
        expect(
            within(row).getByRole('progressbar', {
                name: 'tests.monitor.grid.class_finished_aria finished=0 total=2',
            })
        ).toBeInTheDocument();
        expect(within(row).getAllByText('100%')).toHaveLength(2);
        expect(within(row).getByText('0%')).toBeInTheDocument();
    });

    it('keeps the class row aligned with the progress column when both are on', () => {
        render(<ResponsesGrid test={test} rows={rows} showProgress showClassProgress />);
        const headerCells = screen.getAllByRole('columnheader');
        const classCells = within(screen.getByTestId('class-progress-row')).getAllByRole('cell');
        expect(classCells).toHaveLength(headerCells.length);
    });
});

const path = (levels: [string, boolean][]): StaircaseStep[] =>
    levels.map(([level, correct], i) => ({
        sectionId: level,
        level: level as StaircaseStep['level'],
        questionId: `q${i}`,
        correct,
    }));

describe('LevelResponsesGrid progress', () => {
    const levelRows = [
        {
            studentId: 's1',
            displayName: 'Alice',
            levelPath: path([
                ['A2', true],
                ['B1', false],
                ['A2', true],
            ]),
            finished: true,
        },
        { studentId: 's2', displayName: 'Bob', levelPath: path([['A2', false]]), questionsAnswered: 4 },
    ];

    it('shows a finished run as complete and a live run against the question cap', () => {
        render(<LevelResponsesGrid rows={levelRows} maxQuestions={12} showProgress />);
        const alice = screen.getByRole('progressbar', { name: 'tests.monitor.grid.progress_finished_aria count=3' });
        expect(alice).toHaveAttribute('aria-valuenow', '3');
        expect(alice).toHaveAttribute('aria-valuemax', '3');
        const bob = screen.getByRole('progressbar', {
            name: 'tests.monitor.grid.progress_adaptive_aria answered=4 total=12',
        });
        expect(bob).toHaveAttribute('aria-valuenow', '4');
    });

    it('falls back to the trace length when no live count or cap is known', () => {
        render(
            <LevelResponsesGrid
                rows={[{ studentId: 's1', displayName: 'Alice', levelPath: path([['A1', true]]) }]}
                showProgress
            />
        );
        expect(
            screen.getByRole('progressbar', { name: 'tests.monitor.grid.progress_adaptive_aria answered=1 total=1' })
        ).toBeInTheDocument();
    });

    it('shows how much of the class reached each level and how many finished', () => {
        render(<LevelResponsesGrid rows={levelRows} showProgress showClassProgress />);
        const row = screen.getByTestId('class-progress-row');
        expect(
            within(row).getByRole('progressbar', {
                name: 'tests.monitor.grid.class_reached_aria reached=2 total=2 level=A2',
            })
        ).toBeInTheDocument();
        expect(
            within(row).getByRole('progressbar', {
                name: 'tests.monitor.grid.class_reached_aria reached=1 total=2 level=B1',
            })
        ).toBeInTheDocument();
        expect(
            within(row).getByRole('progressbar', {
                name: 'tests.monitor.grid.class_finished_aria finished=1 total=2',
            })
        ).toBeInTheDocument();
        expect(within(row).getAllByRole('cell')).toHaveLength(screen.getAllByRole('columnheader').length);
    });
});
