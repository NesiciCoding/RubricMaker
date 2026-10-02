import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Rubric } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    }),
}));

import RubricTaskScorer from '../RubricTaskScorer';
import { blankRubricEntries } from '../../../utils/rubricTaskScoring';

const level = (id: string, label: string, pts: number, cefr?: 'B2') => ({
    id,
    label,
    minPoints: pts,
    maxPoints: pts,
    description: '',
    subItems: [],
    ...(cefr ? { cefrLevel: cefr } : {}),
});

const rubric = {
    id: 'r1',
    name: 'Email',
    createdAt: '2026-01-01T00:00:00.000Z',
    scoringMode: 'weighted-percentage',
    totalMaxPoints: 0,
    criteria: [
        {
            id: 'c1',
            title: 'Content',
            description: '',
            weight: 100,
            levels: [level('lo', 'Low', 1), level('hi', 'High', 4, 'B2')],
        },
    ],
} as unknown as Rubric;

describe('RubricTaskScorer', () => {
    it('emits entries when a level is picked and shows the mapped points', () => {
        const onChange = vi.fn();
        const { rerender } = render(
            <RubricTaskScorer
                rubric={rubric}
                entries={blankRubricEntries(rubric)}
                questionPoints={8}
                onChange={onChange}
            />
        );
        expect(screen.getByRole('status')).toHaveTextContent('tests.results.rubric_incomplete');
        fireEvent.click(screen.getByRole('button', { name: /High/ }));
        const next = onChange.mock.calls[0][0];
        expect(next).toEqual([expect.objectContaining({ criterionId: 'c1', levelId: 'hi' })]);

        rerender(<RubricTaskScorer rubric={rubric} entries={next} questionPoints={8} onChange={onChange} />);
        expect(screen.getByRole('status')).toHaveTextContent('"points":8');
        expect(screen.getByRole('button', { name: /High/ })).toHaveAttribute('aria-pressed', 'true');
    });

    it('counts a criterion scored only by override as complete', () => {
        render(
            <RubricTaskScorer
                rubric={rubric}
                entries={[{ criterionId: 'c1', levelId: null, overridePoints: 2, checkedSubItems: [], comment: '' }]}
                questionPoints={8}
                onChange={vi.fn()}
            />
        );
        expect(screen.getByRole('status')).not.toHaveTextContent('rubric_incomplete');
    });

    it('lets an override replace the level and can be read-only', () => {
        const onChange = vi.fn();
        const { rerender } = render(
            <RubricTaskScorer
                rubric={rubric}
                entries={blankRubricEntries(rubric)}
                questionPoints={8}
                onChange={onChange}
            />
        );
        fireEvent.change(screen.getByLabelText(/rubric_override_points/), { target: { value: '2' } });
        expect(onChange.mock.calls[0][0][0]).toMatchObject({ overridePoints: 2 });

        rerender(
            <RubricTaskScorer
                rubric={rubric}
                entries={blankRubricEntries(rubric)}
                questionPoints={8}
                onChange={onChange}
                readOnly
            />
        );
        expect(screen.getByRole('button', { name: /Low/ })).toBeDisabled();
    });
});
