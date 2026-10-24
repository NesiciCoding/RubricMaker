import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import RubricCard, { type RubricCardActions } from '../RubricCard';
import type { Rubric, Student } from '../../../types';

// Counts how many times the i18n mock is called. useTranslation runs once per RubricCard render
// (it is called unconditionally at the top of the render body), so this measures actual card
// renders rather than wrapper executions — the same technique CriterionCard.test.tsx uses.
const { i18nMock } = vi.hoisted(() => ({ i18nMock: { useTranslationCalls: 0 } }));

vi.mock('react-i18next', () => ({
    useTranslation: () => {
        i18nMock.useTranslationCalls += 1;
        return {
            t: (key: string, opts?: string | Record<string, unknown>) => {
                if (typeof opts === 'string') return opts;
                if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
                return key;
            },
            i18n: { language: 'en' },
        };
    },
}));

function makeRubric(id: string, name: string): Rubric {
    return {
        id,
        name,
        subject: 'English',
        description: '',
        criteria: [{ id: `${id}-c1`, title: 'Criterion', description: '', weight: 100, levels: [] }],
        gradeScaleId: 'gs1',
        format: {} as Rubric['format'],
        attachmentIds: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        totalMaxPoints: 100,
        scoringMode: 'weighted-percentage',
    };
}

const noop = () => {};
const noopActions: RubricCardActions = {
    onEdit: noop,
    onDuplicate: noop,
    onDelete: noop,
    onDifferentiate: noop,
    onCopyShareCode: noop,
    onSharePreview: noop,
    onOpenShareModal: noop,
    onGradeStudents: noop,
    onCompare: noop,
    onGroupGrade: noop,
    onSpeakingSelect: noop,
};

const r1 = makeRubric('r1', 'Essay Rubric');
const r2 = makeRubric('r2', 'Lab Report');
// Stable across renders, the way RubricList's real `useMemo`-derived classStudents is — a fresh
// `[]` literal per render would itself defeat the memoization this test is meant to pin.
const noStudents: Student[] = [];

function Harness() {
    const [copiedId, setCopiedId] = useState<string | null>(null);
    return (
        <DragDropContext onDragEnd={noop}>
            <Droppable droppableId="rubric-list">
                {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}>
                        <RubricCard
                            rubric={r1}
                            index={0}
                            reorderable={true}
                            gradedCount={0}
                            dbConnected={false}
                            isCopied={copiedId === r1.id}
                            isPreviewCopied={false}
                            classStudents={noStudents}
                            hasActiveClass={false}
                            actions={{ ...noopActions, onCopyShareCode: () => setCopiedId(r1.id) }}
                        />
                        <RubricCard
                            rubric={r2}
                            index={1}
                            reorderable={true}
                            gradedCount={0}
                            dbConnected={false}
                            isCopied={copiedId === r2.id}
                            isPreviewCopied={false}
                            classStudents={noStudents}
                            hasActiveClass={false}
                            actions={noopActions}
                        />
                        {provided.placeholder}
                    </div>
                )}
            </Droppable>
        </DragDropContext>
    );
}

describe('RubricCard', () => {
    it('skips re-rendering other cards when one card is edited', () => {
        render(<Harness />);

        expect(screen.getByText('Essay Rubric')).toBeInTheDocument();
        expect(screen.getByText('Lab Report')).toBeInTheDocument();
        const rendersAfterMount = i18nMock.useTranslationCalls;

        // Copying card 1's share code only changes card 1's own props (isCopied flips); card 2's
        // props are reference-stable, so the memoized RubricCard for card 2 must not re-render.
        fireEvent.click(screen.getAllByTitle('tooltips.copy_share_code')[0]);

        expect(i18nMock.useTranslationCalls).toBe(rendersAfterMount + 1);
    });

    it('shows the graded-students count passed in as a prop', () => {
        render(<Harness />);
        expect(screen.getAllByText('rubricList.students_graded_badge:{"count":0}').length).toBe(2);
    });
});
