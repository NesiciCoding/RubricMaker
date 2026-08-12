import React, { useCallback, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import CriterionCard from '../CriterionCard';
import type { RubricCriterion } from '../../../types';

// Counts how many times the i18n mock is called. useTranslation runs once per
// CriterionCard render (it is called unconditionally at the top of the render
// body), so this measures actual card renders rather than wrapper executions.
const { i18nMock } = vi.hoisted(() => ({ i18nMock: { useTranslationCalls: 0 } }));

vi.mock('react-i18next', () => ({
    useTranslation: () => {
        i18nMock.useTranslationCalls += 1;
        return {
            t: (key: string, opts?: string | Record<string, unknown>) => {
                if (typeof opts === 'string') return opts;
                return key;
            },
            i18n: { language: 'en' },
        };
    },
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
                                <CriterionCard {...cardProps(c2, updateCriterion)} />
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>
            );
        }

        render(<Harness />);

        const titleInputs = screen.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name');
        expect(titleInputs).toHaveLength(2);
        const rendersAfterMount = i18nMock.useTranslationCalls;

        fireEvent.change(titleInputs[0], { target: { value: 'Alpha updated' } });

        // The edited card shows the new title; the untouched card's props are reference-stable,
        // so the memoized CriterionCard is not re-rendered. useTranslation runs once per card
        // render: card 1 re-renders (+1), card 2 bails out (no change).
        expect(screen.getByDisplayValue('Alpha updated')).toBeInTheDocument();
        expect(i18nMock.useTranslationCalls).toBe(rendersAfterMount + 1);
    });
});
