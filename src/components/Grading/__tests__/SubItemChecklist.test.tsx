import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { RubricCriterion, RubricLevel, ScoreEntry, SubItem } from '../../../types';
import SubItemChecklist, { BestFitHint } from '../SubItemChecklist';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

const standard = {
    guid: 'g1',
    statementNotation: 'ELA.1',
    description: 'Writes clearly',
    standardSetTitle: 'Set',
    jurisdictionTitle: 'J',
};

const level = (id: string, points: number, subItems: SubItem[]): RubricLevel => ({
    id,
    label: id.toUpperCase(),
    minPoints: points,
    maxPoints: points,
    description: '',
    subItems,
});

const criterion = (mode: RubricCriterion['subItemMode'], levels: RubricLevel[]): RubricCriterion => ({
    id: 'c1',
    title: 'Spelling',
    description: '',
    weight: 100,
    levels,
    subItemMode: mode,
});

const entry = (patch: Partial<ScoreEntry> = {}): ScoreEntry => ({
    criterionId: 'c1',
    levelId: null,
    comment: '',
    checkedSubItems: [],
    ...patch,
});

describe('SubItemChecklist', () => {
    it('renders nothing for a level without sub-items', () => {
        const lvl = level('b', 1, []);
        const { container } = render(
            <SubItemChecklist
                criterion={criterion('checklist', [lvl])}
                level={lvl}
                entry={entry()}
                accentColor="#000"
                selected={false}
                onToggleTick={vi.fn()}
                onScore={vi.fn()}
            />
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('ticks checklist statements on any level, with a heading and linked standards', () => {
        const lvl = level('b', 1, [
            { id: 's1', label: 'Fewer than 8 errors', linkedStandards: [standard] },
            { id: 's2', label: 'Uses 5 words' },
        ]);
        const onToggleTick = vi.fn();
        const { rerender } = render(
            <SubItemChecklist
                criterion={criterion('checklist', [lvl])}
                level={lvl}
                entry={entry({ checkedSubItems: ['s2'] })}
                accentColor="#000"
                selected={false}
                heading="B"
                standardsDisplay="notation"
                onToggleTick={onToggleTick}
                onScore={vi.fn()}
            />
        );
        expect(screen.getByText('B')).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: 'Uses 5 words' })).toBeChecked();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Fewer than 8 errors' }));
        expect(onToggleTick).toHaveBeenCalledWith('s1');
        expect(screen.getByText('[ELA.1]')).toHaveAttribute('title', 'Writes clearly');
        expect(screen.queryByText('gradeStudent.sub_items_select_level_to_score')).toBeNull();

        rerender(
            <SubItemChecklist
                criterion={criterion('checklist', [lvl])}
                level={lvl}
                entry={entry()}
                accentColor="#000"
                selected
                standardsDisplay="description"
                onToggleTick={onToggleTick}
                onScore={vi.fn()}
            />
        );
        expect(screen.getByText('Writes clearly')).toHaveAttribute('title', 'ELA.1');
    });

    it('shows an unselected points level read-only with a hint', () => {
        const lvl = level('a', 4, [{ id: 'p1', label: 'Thesis', maxPoints: 2 }]);
        render(
            <SubItemChecklist
                criterion={criterion(undefined, [lvl])}
                level={lvl}
                entry={entry()}
                accentColor="#000"
                selected={false}
                onToggleTick={vi.fn()}
                onScore={vi.fn()}
            />
        );
        expect(screen.queryByRole('checkbox')).toBeNull();
        expect(screen.queryByRole('slider')).toBeNull();
        expect(screen.getByText('Thesis')).toBeInTheDocument();
        expect(screen.getByText('gradeStudent.sub_items_select_level_to_score')).toBeInTheDocument();
    });

    it('scores a selected points level and lists linked standards under each kind of item', () => {
        const lvl: RubricLevel = {
            ...level('a', 2, [
                { id: 'p1', label: 'Thesis', maxPoints: 1, linkedStandards: [standard] },
                { id: 'p2', label: 'Evidence', minPoints: 0, maxPoints: 3, linkedStandards: [standard] },
            ]),
            maxPoints: 6,
        };
        const onScore = vi.fn();
        render(
            <SubItemChecklist
                criterion={criterion('points', [lvl])}
                level={lvl}
                entry={entry({ levelId: 'a', subItemScores: { p2: 2 } })}
                accentColor="#000"
                selected
                standardsDisplay="notation"
                onToggleTick={vi.fn()}
                onScore={onScore}
            />
        );
        fireEvent.click(screen.getByRole('checkbox', { name: /Thesis/ }));
        expect(onScore).toHaveBeenCalledWith('p1', 1);
        fireEvent.change(screen.getByRole('slider', { name: 'Evidence' }), { target: { value: '2.5' } });
        expect(onScore).toHaveBeenCalledWith('p2', 2.5);
        expect(screen.getAllByText('[ELA.1]')).toHaveLength(2);
        expect(screen.getByTestId('sub-item-breakdown')).toHaveTextContent(
            'gradeStudent.sub_items_breakdown:{"base":2,"items":2,"total":4}'
        );
    });
});

describe('BestFitHint', () => {
    const levels = [level('e', 2, [{ id: 'e1', label: 'e1' }]), level('b', 1, [{ id: 'b1', label: 'b1' }])];

    it('stays hidden outside checklist mode, before any tick, and once the fit is chosen', () => {
        const onApply = vi.fn();
        const { rerender, container } = render(
            <BestFitHint
                criterion={criterion('points', levels)}
                entry={entry({ checkedSubItems: ['e1'] })}
                accentColor="#000"
                onApply={onApply}
            />
        );
        expect(container).toBeEmptyDOMElement();
        rerender(
            <BestFitHint
                criterion={criterion('checklist', levels)}
                entry={entry()}
                accentColor="#000"
                onApply={onApply}
            />
        );
        expect(container).toBeEmptyDOMElement();
        rerender(
            <BestFitHint
                criterion={criterion('checklist', levels)}
                entry={entry({ levelId: 'e', checkedSubItems: ['e1'] })}
                accentColor="#000"
                onApply={onApply}
            />
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('suggests the best-fitting level and applies it', () => {
        const onApply = vi.fn();
        render(
            <BestFitHint
                criterion={criterion('checklist', levels)}
                entry={entry({ levelId: 'b', checkedSubItems: ['e1'] })}
                accentColor="#000"
                onApply={onApply}
                style={{ marginTop: 6 }}
            />
        );
        expect(screen.getByRole('status')).toHaveStyle({ marginTop: '6px' });
        expect(screen.getByText('gradeStudent.best_fit:{"level":"E"}')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'gradeStudent.best_fit_apply_label:{"level":"E"}' }));
        expect(onApply).toHaveBeenCalledWith('e');
    });
});
