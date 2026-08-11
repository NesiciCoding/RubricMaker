import React, { memo, useCallback, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import CriterionCard from '../CriterionCard';
import type { RubricCriterion } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

function makeCriterion(id: string, title: string): RubricCriterion {
    return {
        id,
        title,
        description: '',
        weight: 25,
        levels: [{ id: `${id}-l1`, label: 'Excellent', minPoints: 4, maxPoints: 4, description: '', subItems: [] }],
    };
}

const noop = () => {};

function cardProps(
    criterion: RubricCriterion,
    onUpdateCriterion: (cid: string, patch: Partial<RubricCriterion>) => void
) {
    return {
        criterion,
        cIdx: 0,
        isFirst: true,
        isLast: true,
        collapsed: false,
        scoringMode: 'weighted-percentage' as const,
        onMoveCriterion: noop,
        onDuplicateCriterion: noop,
        onDeleteCriterion: noop,
        onUpdateCriterion,
        onAddLevel: noop,
        onDeleteLevel: noop,
        onUpdateLevel: noop,
        onAddSubItem: noop,
        onUpdateSubItem: noop,
        onDeleteSubItem: noop,
        onToggleCollapse: noop,
        onPickStandard: noop,
        onPickCefr: noop,
        onUnlinkStandard: noop,
        onUnlinkLegacyStandard: noop,
        onRemoveCefrDescriptor: noop,
        onRemoveFrameworkDescriptor: noop,
    };
}

describe('CriterionCard', () => {
    it('skips re-rendering other cards when one criterion is edited', () => {
        let c1 = makeCriterion('c1', 'Alpha');
        const c2 = makeCriterion('c2', 'Beta');
        const c2Renders = { count: 0 };

        // A memoized wrapper counts how often the second card's props actually change.
        const Wrapped2 = memo(function Wrapped2(props: ReturnType<typeof cardProps>) {
            c2Renders.count += 1;
            return <CriterionCard {...props} />;
        });

        function Harness() {
            const [, setTick] = useState(0);
            const updateCriterion = useCallback((cid: string, patch: Partial<RubricCriterion>) => {
                if (cid === 'c1') c1 = { ...c1, ...patch };
                setTick((t) => t + 1);
            }, []);

            return (
                <DragDropContext onDragEnd={noop}>
                    <Droppable droppableId="criteria">
                        {(provided) => (
                            <div ref={provided.innerRef} {...provided.droppableProps}>
                                <CriterionCard {...cardProps(c1, updateCriterion)} />
                                <Wrapped2 {...cardProps(c2, updateCriterion)} />
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>
            );
        }

        render(<Harness />);

        const titleInputs = screen.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name');
        expect(titleInputs).toHaveLength(2);
        const rendersAfterMount = c2Renders.count;

        fireEvent.change(titleInputs[0], { target: { value: 'Alpha updated' } });

        // The edited card shows the new title; the untouched card's props are reference-stable,
        // so its memoized subtree is not re-rendered.
        expect(screen.getByDisplayValue('Alpha updated')).toBeInTheDocument();
        expect(c2Renders.count).toBe(rendersAfterMount);
    });
});
