import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import CriterionCard from '../CriterionCard';
import { criterionCardMenuItems } from '../criterionCardMenuItems';
import { ToastContext } from '../../../context/ToastContext';
import type { RubricCriterion } from '../../../types';

vi.mock('../../../store/storage', () => ({ saveCriterionClipboard: vi.fn() }));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

const criterion: RubricCriterion = {
    id: 'c1',
    title: 'Writing',
    description: '',
    weight: 40,
    levels: [{ id: 'l1', label: 'Good', minPoints: 0, maxPoints: 4, description: 'ok', subItems: [] }],
};

const noop = () => {};
const fn = () => vi.fn();

function renderCard(props: Partial<Parameters<typeof CriterionCard>[0]> = {}) {
    const calls = {
        onMoveCriterion: fn(),
        onDuplicateCriterion: fn(),
        onDeleteCriterion: fn(),
        onToggleCollapse: fn(),
        onPickStandard: fn(),
        onPickCefr: fn(),
        onPasteCriterion: fn(),
    };
    render(
        <ToastContext.Provider value={{ showToast: vi.fn(), dismissToast: vi.fn() }}>
            <DragDropContext onDragEnd={noop}>
                <Droppable droppableId="criteria">
                    {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps}>
                            <CriterionCard
                                criterion={criterion}
                                cIdx={0}
                                isFirst={false}
                                isLast={false}
                                collapsed={false}
                                scoringMode="weighted-percentage"
                                onUpdateCriterion={fn()}
                                onAddLevel={fn()}
                                onDeleteLevel={fn()}
                                onUpdateLevel={fn()}
                                onSetSubItems={fn()}
                                onMoveSubItem={fn()}
                                onPickSubItemDescriptor={fn()}
                                onUnlinkStandard={fn()}
                                onUnlinkLegacyStandard={fn()}
                                onRemoveCefrDescriptor={fn()}
                                onRemoveFrameworkDescriptor={fn()}
                                onRemoveSubItemCefrDescriptor={fn()}
                                onRemoveSubItemFrameworkDescriptor={fn()}
                                {...calls}
                                {...props}
                            />
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        </ToastContext.Provider>
    );
    return calls;
}

describe('criterionCardMenuItems', () => {
    const base = {
        labels: {
            duplicate: 'd',
            copy: 'c',
            paste: 'p',
            moveUp: 'u',
            moveDown: 'dn',
            expand: 'e',
            collapse: 'co',
            linkStandard: 'ls',
            linkDescriptor: 'ld',
            remove: 'r',
        },
        isFirst: false,
        isLast: false,
        collapsed: false,
        canPaste: true,
        duplicate: vi.fn(),
        copy: vi.fn(),
        paste: vi.fn(),
        move: vi.fn(),
        toggleCollapse: vi.fn(),
        linkStandard: vi.fn(),
        linkDescriptor: vi.fn(),
        remove: vi.fn(),
    };
    const state = (args: Partial<typeof base>) =>
        Object.fromEntries(criterionCardMenuItems({ ...base, ...args }).map((i) => [i.key, i.disabled ?? false]));

    it('disables Move up on the first criterion and Move down on the last, never hiding them', () => {
        expect(state({ isFirst: true })['move-up']).toBe(true);
        expect(state({ isFirst: true })['move-down']).toBe(false);
        expect(state({ isLast: true })['move-down']).toBe(true);
        expect(state({ isFirst: true, isLast: true })).toHaveProperty('move-up');
    });

    it('disables Paste while the clipboard is empty and flips the collapse label', () => {
        expect(state({ canPaste: false }).paste).toBe(true);
        const labels = (collapsed: boolean) =>
            criterionCardMenuItems({ ...base, collapsed }).find((i) => i.key === 'collapse')?.label;
        expect(labels(false)).toBe('co');
        expect(labels(true)).toBe('e');
    });

    it('marks only Delete as dangerous', () => {
        const danger = criterionCardMenuItems(base).filter((i) => i.danger);
        expect(danger.map((i) => i.key)).toEqual(['delete']);
    });
});

describe('CriterionCard context menu', () => {
    it('opens on right-click outside the text fields and runs the chosen action', () => {
        const calls = renderCard();
        fireEvent.contextMenu(document.querySelector('.print-criterion')!);
        const menu = screen.getByRole('menu', { name: 'rubricBuilder.criterion_menu_label' });
        expect(menu).toBeInTheDocument();
        fireEvent.click(screen.getByRole('menuitem', { name: 'rubricBuilder.action_duplicate_criterion' }));
        expect(calls.onDuplicateCriterion).toHaveBeenCalledWith(0);
    });

    it('opens the same menu from the visible button, with Move up disabled on the first criterion', () => {
        const calls = renderCard({ isFirst: true });
        fireEvent.click(screen.getByRole('button', { name: 'rubricBuilder.criterion_menu_label' }));
        expect(screen.getByRole('menuitem', { name: 'rubricBuilder.action_move_criterion_up' })).toBeDisabled();
        fireEvent.click(screen.getByRole('menuitem', { name: 'rubricBuilder.action_move_criterion_down' }));
        expect(calls.onMoveCriterion).toHaveBeenCalledWith(0, 1);
    });

    it('keeps the native menu inside the criterion fields', () => {
        renderCard();
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        screen.getByDisplayValue('Writing').dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('enables Paste only when a clipboard exists and a paste handler is given', () => {
        const calls = renderCard({ canPasteCriterion: () => true });
        fireEvent.click(screen.getByRole('button', { name: 'rubricBuilder.criterion_menu_label' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'rubricBuilder.action_paste_criterion' }));
        expect(calls.onPasteCriterion).toHaveBeenCalled();
    });

    it('leaves Paste disabled when the clipboard is empty', () => {
        renderCard({ canPasteCriterion: () => false });
        fireEvent.click(screen.getByRole('button', { name: 'rubricBuilder.criterion_menu_label' }));
        expect(screen.getByRole('menuitem', { name: 'rubricBuilder.action_paste_criterion' })).toBeDisabled();
    });
});
