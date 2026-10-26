import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { RubricCriterion, ScoreEntry } from '../../../types';
import SubItemFeedback from '../SubItemFeedback';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

const criterion = (mode?: RubricCriterion['subItemMode']): RubricCriterion => ({
    id: 'c1',
    title: 'Spelling',
    description: '',
    weight: 100,
    subItemMode: mode,
    levels: [
        {
            id: 'e',
            label: 'E',
            minPoints: 2,
            maxPoints: 2,
            description: '',
            subItems: [{ id: 'e1', label: 'Adds pictures', maxPoints: 1 }],
        },
        {
            id: 'b',
            label: 'B',
            minPoints: 1,
            maxPoints: 1,
            description: '',
            subItems: [
                { id: 'b1', label: 'Five topics', maxPoints: 2 },
                { id: 'b2', label: '30 words each', maxPoints: 1 },
            ],
        },
    ],
});

const entry = (patch: Partial<ScoreEntry>): ScoreEntry => ({
    criterionId: 'c1',
    levelId: null,
    comment: '',
    checkedSubItems: [],
    ...patch,
});

describe('SubItemFeedback', () => {
    it('renders nothing without an entry or anything to show', () => {
        const { container, rerender } = render(<SubItemFeedback criterion={criterion('checklist')} />);
        expect(container).toBeEmptyDOMElement();
        rerender(<SubItemFeedback criterion={criterion('checklist')} entry={entry({ levelId: 'b' })} />);
        expect(container).toBeEmptyDOMElement();
        rerender(<SubItemFeedback criterion={criterion()} entry={entry({})} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('lists ticked checklist statements, naming the level when it is not the one reached', () => {
        render(
            <SubItemFeedback
                criterion={criterion('checklist')}
                entry={entry({ levelId: 'b', checkedSubItems: ['b1', 'e1'] })}
            />
        );
        const items = screen.getAllByRole('listitem').map((li) => li.textContent);
        expect(items).toEqual(['Adds pictures (E)', 'Five topics']);
        expect(screen.queryByText('30 words each')).toBeNull();
    });

    it("lists the reached level's points sub-items with their scores", () => {
        render(<SubItemFeedback criterion={criterion()} entry={entry({ levelId: 'b', subItemScores: { b1: 1.5 } })} />);
        expect(screen.getByText('sharedFeedback.sub_item_points:{"score":1.5,"max":2}')).toBeInTheDocument();
        expect(screen.getByText('sharedFeedback.sub_item_points:{"score":0,"max":1}')).toBeInTheDocument();
        expect(screen.queryByText('Adds pictures')).toBeNull();
    });
});
