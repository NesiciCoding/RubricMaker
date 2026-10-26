import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import CriterionCard from '../CriterionCard';
import { ToastContext } from '../../../context/ToastContext';
import type { RubricCriterion } from '../../../types';

const { mockSaveCriterionClipboard, mockI18n } = vi.hoisted(() => ({
    mockSaveCriterionClipboard: vi.fn(),
    mockI18n: { language: 'en' },
}));

vi.mock('../../../store/storage', () => ({
    saveCriterionClipboard: mockSaveCriterionClipboard,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            return key;
        },
        i18n: mockI18n,
    }),
}));

const std = (guid: string, notation?: string) => ({
    guid,
    statementNotation: notation,
    description: `Description for ${guid}`,
    standardSetTitle: 'Set',
    jurisdictionTitle: 'Jurisdiction',
});

const si1 = {
    id: 'si1',
    label: 'Uses varied sentence structure',
    minPoints: 1,
    maxPoints: 3,
    linkedStandards: [std('sub-guid-1', 'CCSS.ELA-LITERACY.W.8.2'), std('sub-guid-2')],
};
// Legacy sub-item: no min/max, only points → `maxPoints ?? points` fallback.
const si2 = { id: 'si2', label: 'Legacy sub item', points: 2 };
// Bare sub-item: nothing set → `?? points ?? 1` fallback.
const si3 = { id: 'si3', label: 'Bare sub item' };

// Distinct min/max values so display-value queries stay unambiguous.
const l1 = {
    id: 'l1',
    label: 'Excellent',
    minPoints: 4,
    maxPoints: 5,
    description: 'The student demonstrates excellent understanding.',
    subItems: [si1, si2, si3],
};
const l2 = {
    id: 'l2',
    label: 'Good',
    minPoints: 2,
    maxPoints: 3,
    description: 'Excellent work overall.',
    subItems: [],
};

function makeCriterion(overrides: Partial<RubricCriterion> = {}): RubricCriterion {
    return {
        id: 'c1',
        title: 'Writing',
        description: '',
        weight: 40,
        levels: [l1, l2],
        ...overrides,
    };
}

const noop = () => {};

function makeCallbacks() {
    return {
        onMoveCriterion: vi.fn(),
        onDuplicateCriterion: vi.fn(),
        onDeleteCriterion: vi.fn(),
        onUpdateCriterion: vi.fn(),
        onAddLevel: vi.fn(),
        onDeleteLevel: vi.fn(),
        onUpdateLevel: vi.fn(),
        onSetSubItems: vi.fn(),
        onMoveSubItem: vi.fn(),
        onToggleCollapse: vi.fn(),
        onPickStandard: vi.fn(),
        onPickCefr: vi.fn(),
        onUnlinkStandard: vi.fn(),
        onUnlinkLegacyStandard: vi.fn(),
        onRemoveCefrDescriptor: vi.fn(),
        onRemoveFrameworkDescriptor: vi.fn(),
    };
}

type Callbacks = ReturnType<typeof makeCallbacks>;

function renderCard(
    criterion: RubricCriterion,
    cb: Callbacks,
    props: Partial<Parameters<typeof CriterionCard>[0]> = {}
) {
    return render(
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
                            onMoveCriterion={cb.onMoveCriterion}
                            onDuplicateCriterion={cb.onDuplicateCriterion}
                            onDeleteCriterion={cb.onDeleteCriterion}
                            onUpdateCriterion={cb.onUpdateCriterion}
                            onAddLevel={cb.onAddLevel}
                            onDeleteLevel={cb.onDeleteLevel}
                            onUpdateLevel={cb.onUpdateLevel}
                            onSetSubItems={cb.onSetSubItems}
                            onMoveSubItem={cb.onMoveSubItem}
                            onToggleCollapse={cb.onToggleCollapse}
                            onPickStandard={cb.onPickStandard}
                            onPickCefr={cb.onPickCefr}
                            onUnlinkStandard={cb.onUnlinkStandard}
                            onUnlinkLegacyStandard={cb.onUnlinkLegacyStandard}
                            onRemoveCefrDescriptor={cb.onRemoveCefrDescriptor}
                            onRemoveFrameworkDescriptor={cb.onRemoveFrameworkDescriptor}
                            {...props}
                        />
                    </div>
                )}
            </Droppable>
        </DragDropContext>
    );
}
describe('CriterionCard coverage', () => {
    beforeEach(() => {
        mockSaveCriterionClipboard.mockReset();
        mockI18n.language = 'en';
    });

    it('edits the header fields, moves, and toggles skill + group-grading', () => {
        const cb = makeCallbacks();
        renderCard(makeCriterion({ cefrSkill: 'writing', collaborative: false }), cb);

        fireEvent.change(screen.getByPlaceholderText('rubricBuilder.placeholder_description'), {
            target: { value: 'A description' },
        });
        expect(cb.onUpdateCriterion).toHaveBeenCalledWith('c1', { description: 'A description' });

        fireEvent.change(screen.getByDisplayValue('40'), { target: { value: '50' } });
        expect(cb.onUpdateCriterion).toHaveBeenCalledWith('c1', { weight: 50 });

        fireEvent.click(screen.getByLabelText('rubricBuilder.action_move_criterion_up'));
        expect(cb.onMoveCriterion).toHaveBeenCalledWith(0, -1);
        fireEvent.click(screen.getByLabelText('rubricBuilder.action_move_criterion_down'));
        expect(cb.onMoveCriterion).toHaveBeenCalledWith(0, 1);

        // CEFR skill select (first select in the DOM — the header precedes the levels).
        const skillSelect = screen.getAllByRole('combobox')[0];
        fireEvent.change(skillSelect, { target: { value: 'reading' } });
        expect(cb.onUpdateCriterion).toHaveBeenCalledWith('c1', { cefrSkill: 'reading' });
        fireEvent.change(skillSelect, { target: { value: '' } });
        expect(cb.onUpdateCriterion).toHaveBeenCalledWith('c1', { cefrSkill: undefined });

        // Group-grading checkbox: unchecked → checked → collaborative back to undefined.
        const groupCheckbox = screen.getByRole('checkbox');
        expect(groupCheckbox).not.toBeChecked();
        fireEvent.click(groupCheckbox);
        expect(cb.onUpdateCriterion).toHaveBeenCalledWith('c1', { collaborative: undefined });

        // Checked → unchecked → collaborative: false.
        const cb2 = makeCallbacks();
        renderCard(makeCriterion({ collaborative: true }), cb2);
        const secondCheckbox = screen.getAllByRole('checkbox')[1];
        expect(secondCheckbox).toBeChecked();
        fireEvent.click(secondCheckbox);
        expect(cb2.onUpdateCriterion).toHaveBeenCalledWith('c1', { collaborative: false });
    });

    it('falls back to untitled labels for empty criterion titles and level labels', () => {
        const cb = makeCallbacks();
        renderCard(makeCriterion({ title: '', levels: [{ ...l1, label: '' }] }), cb);
        // Both drag handles carry the untitled fallback in their aria-labels.
        expect(screen.getByLabelText(/rubricBuilder\.drag_reorder_criterion/)).toBeInTheDocument();
        expect(screen.getByLabelText(/rubricBuilder\.drag_reorder_level/)).toBeInTheDocument();
        expect(cb.onUpdateCriterion).not.toHaveBeenCalled();
    });

    it('hides the descriptor-count badge without explicit descriptor arrays', () => {
        const cb = makeCallbacks();
        renderCard(makeCriterion({ cefrDescriptors: undefined, frameworkDescriptors: [] }), cb);
        // The badge count span only renders when the total is > 0.
        expect(screen.queryByText('framework.action_link_descriptor')!.textContent).not.toMatch(/[0-9]/);
    });

    it('shows the badge when only one descriptor kind is set', () => {
        const cb = makeCallbacks();
        // cefrDescriptors missing → the count expression falls through to [] for it.
        renderCard(
            makeCriterion({
                frameworkDescriptors: [
                    {
                        descriptorId: 'fd1',
                        framework: 'blooms',
                        categoryId: 'remember',
                        categoryColor: '#3b82f6',
                        categoryLabelEn: 'Knowledge',
                        categoryLabelNl: 'Kennis',
                        descriptionEn: 'Recalls facts',
                        descriptionNl: 'Herinnert feiten',
                    },
                ],
            }),
            cb
        );
        expect(screen.getByText('1')).toBeInTheDocument();

        // frameworkDescriptors missing → the count expression falls through to [] for it.
        const cb2 = makeCallbacks();
        renderCard(
            makeCriterion({
                cefrDescriptors: [
                    {
                        descriptorId: 'd1',
                        level: 'B1',
                        skill: 'writing',
                        descriptionEn: 'Can write simple connected text',
                        descriptionNl: 'Kan eenvoudige teksten schrijven',
                    },
                ],
            }),
            cb2
        );
        expect(screen.getAllByText('1')).toHaveLength(2);
    });

    it('renders Dutch skill options and descriptor labels', () => {
        mockI18n.language = 'nl';
        const cb = makeCallbacks();
        renderCard(
            makeCriterion({
                cefrDescriptors: [
                    {
                        descriptorId: 'd1',
                        level: 'B1',
                        skill: 'writing',
                        descriptionEn: 'Can write simple connected text',
                        descriptionNl: 'Kan eenvoudige teksten schrijven',
                    },
                ],
                frameworkDescriptors: [
                    {
                        descriptorId: 'fd1',
                        framework: 'blooms',
                        categoryId: 'remember',
                        categoryColor: '#3b82f6',
                        categoryLabelEn: 'Knowledge',
                        categoryLabelNl: 'Kennis',
                        descriptionEn: 'Recalls facts',
                        descriptionNl: 'Herinnert feiten',
                    },
                ],
            }),
            cb
        );
        expect(screen.getByText('Schrijven')).toBeInTheDocument();
        expect(screen.getByText('Kan eenvoudige teksten schrijven')).toBeInTheDocument();
        expect(screen.getByText('Kennis')).toBeInTheDocument();
        expect(screen.getByText('Herinnert feiten')).toBeInTheDocument();
    });

    it('renders and unlinks standards, CEFR descriptors, and framework descriptors', () => {
        const cb = makeCallbacks();
        renderCard(
            makeCriterion({
                levels: [{ ...l1, subItems: [] }, l2],
                linkedStandards: [
                    std('guid-1', 'CCSS.ELA-LITERACY.W.8.2'),
                    std('guid-2'), // no statementNotation → guid fallback
                ],
                linkedStandard: std('legacy-guid'), // no statementNotation → guid fallback
                cefrDescriptors: [
                    {
                        descriptorId: 'd1',
                        level: 'B1',
                        skill: 'writing',
                        descriptionEn: 'Can write simple connected text',
                        descriptionNl: 'Kan eenvoudige teksten schrijven',
                    },
                ],
                frameworkDescriptors: [
                    {
                        descriptorId: 'fd1',
                        framework: 'blooms',
                        categoryId: 'remember',
                        categoryColor: '#3b82f6',
                        categoryLabelEn: 'Knowledge',
                        categoryLabelNl: 'Kennis',
                        descriptionEn: 'Recalls facts',
                        descriptionNl: 'Herinnert feiten',
                    },
                ],
            }),
            cb
        );

        // Standard chips: notation + guid fallback + legacy guid fallback.
        expect(screen.getByText('CCSS.ELA-LITERACY.W.8.2')).toBeInTheDocument();
        expect(screen.getByText('guid-2')).toBeInTheDocument();
        expect(screen.getByText('legacy-guid')).toBeInTheDocument();

        // Descriptor count badge on the CEFR link button.
        expect(screen.getByText('2')).toBeInTheDocument();

        // Unlink the two criterion-level standards.
        const unlinkButtons = screen.getAllByLabelText('rubricBuilder.action_unlink_standard');
        fireEvent.click(unlinkButtons[0]);
        expect(cb.onUnlinkStandard).toHaveBeenCalledWith({ type: 'criterion', cid: 'c1' }, 0);
        fireEvent.click(unlinkButtons[1]);
        expect(cb.onUnlinkStandard).toHaveBeenCalledWith({ type: 'criterion', cid: 'c1' }, 1);

        // Unlink the legacy standard.
        fireEvent.click(screen.getByText('legacy-guid').closest('div')!.querySelector('button') as HTMLElement);
        expect(cb.onUnlinkLegacyStandard).toHaveBeenCalledWith('c1');

        // Link-standard + CEFR pick buttons.
        fireEvent.click(screen.getByText('rubricBuilder.action_link_standard'));
        expect(cb.onPickStandard).toHaveBeenCalledWith({ type: 'criterion', cid: 'c1' });
        fireEvent.click(screen.getByText('framework.action_link_descriptor'));
        expect(cb.onPickCefr).toHaveBeenCalledWith('c1');

        // Remove the CEFR and framework descriptor chips.
        const removeButtons = screen.getAllByLabelText('rubricBuilder.action_remove_descriptor');
        fireEvent.click(removeButtons[0]);
        expect(cb.onRemoveCefrDescriptor).toHaveBeenCalledWith('c1', 'd1');
        fireEvent.click(removeButtons[1]);
        expect(cb.onRemoveFrameworkDescriptor).toHaveBeenCalledWith('c1', 'fd1');
    });

    it('copies a criterion and surfaces clipboard failures', () => {
        const cb = makeCallbacks();
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        renderCard(makeCriterion(), cb);

        fireEvent.click(screen.getByLabelText('rubricBuilder.action_copy_criterion'));
        expect(mockSaveCriterionClipboard).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));

        mockSaveCriterionClipboard.mockImplementation(() => {
            throw new Error('quota exceeded');
        });
        fireEvent.click(screen.getByLabelText('rubricBuilder.action_copy_criterion'));
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('duplicates and deletes a criterion', () => {
        const cb = makeCallbacks();
        renderCard(makeCriterion(), cb);
        fireEvent.click(screen.getByLabelText('rubricBuilder.action_duplicate_criterion'));
        expect(cb.onDuplicateCriterion).toHaveBeenCalledWith(0);
        fireEvent.click(screen.getByLabelText('rubricBuilder.action_delete_criterion'));
        expect(cb.onDeleteCriterion).toHaveBeenCalledWith('c1');
    });

    it('collapses to level pills and expands back', () => {
        const cb = makeCallbacks();
        renderCard(makeCriterion(), cb, { collapsed: true });
        // Pills summarize the levels.
        expect(screen.getByText('Excellent')).toBeInTheDocument();
        expect(screen.getByText('Good')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('rubricBuilder.action_expand_criterion'));
        expect(cb.onToggleCollapse).toHaveBeenCalledWith('c1');

        cb.onToggleCollapse.mockClear();
        const cb2 = makeCallbacks();
        renderCard(makeCriterion(), cb2);
        fireEvent.click(screen.getByLabelText('rubricBuilder.action_collapse_criterion'));
        expect(cb2.onToggleCollapse).toHaveBeenCalledWith('c1');
    });

    it('edits the single-point descriptor, adding a level when none exists', () => {
        const cb = makeCallbacks();
        renderCard(makeCriterion({ levels: [] }), cb, { scoringMode: 'single-point' });

        fireEvent.change(screen.getByPlaceholderText('rubricBuilder.single_point_descriptor_placeholder'), {
            target: { value: 'Proficiency descriptor' },
        });
        expect(cb.onAddLevel).toHaveBeenCalledWith('c1');
        expect(cb.onUpdateLevel).toHaveBeenCalledWith('c1', '', { description: 'Proficiency descriptor' });

        fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '7' } });
        expect(cb.onUpdateLevel).toHaveBeenCalledWith('c1', '', { maxPoints: 7, minPoints: 0 });
    });

    it('edits the single-point descriptor with an existing level', () => {
        const cb = makeCallbacks();
        renderCard(
            makeCriterion({
                levels: [{ id: 'sp1', label: '', minPoints: 0, maxPoints: 5, description: 'Old', subItems: [] }],
            }),
            cb,
            { scoringMode: 'single-point' }
        );
        fireEvent.change(screen.getByDisplayValue('Old'), { target: { value: 'New descriptor' } });
        expect(cb.onUpdateLevel).toHaveBeenCalledWith('c1', 'sp1', { description: 'New descriptor' });
        fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '8' } });
        expect(cb.onUpdateLevel).toHaveBeenCalledWith('c1', 'sp1', { maxPoints: 8, minPoints: 0 });
    });

    it('edits levels: labels, points, descriptions, CEFR level, delete, and quality tips', () => {
        const cb = makeCallbacks();
        renderCard(makeCriterion({ levels: [{ ...l1, subItems: [] }, l2] }), cb);

        // Quality tip renders for "Excellent work overall." (quality word, no student word).
        expect(screen.getByText('rubricBuilder.level_quality_tip')).toBeInTheDocument();

        // Level label edit.
        fireEvent.change(screen.getByDisplayValue('Excellent'), { target: { value: 'Outstanding' } });
        expect(cb.onUpdateLevel).toHaveBeenCalledWith('c1', 'l1', { label: 'Outstanding' });

        // Min/max points (l1: 4/5, l2: 2/3 — all unique display values).
        fireEvent.change(screen.getByDisplayValue('4'), { target: { value: '3' } });
        expect(cb.onUpdateLevel).toHaveBeenCalledWith('c1', 'l1', { minPoints: 3 });
        fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '6' } });
        expect(cb.onUpdateLevel).toHaveBeenCalledWith('c1', 'l1', { maxPoints: 6 });
        fireEvent.change(screen.getByDisplayValue('2'), { target: { value: '1' } });
        expect(cb.onUpdateLevel).toHaveBeenCalledWith('c1', 'l2', { minPoints: 1 });
        fireEvent.change(screen.getByDisplayValue('3'), { target: { value: '6' } });
        expect(cb.onUpdateLevel).toHaveBeenCalledWith('c1', 'l2', { maxPoints: 6 });

        // Level description.
        fireEvent.change(screen.getByDisplayValue('The student demonstrates excellent understanding.'), {
            target: { value: 'Shows mastery' },
        });
        expect(cb.onUpdateLevel).toHaveBeenCalledWith('c1', 'l1', { description: 'Shows mastery' });

        // CEFR level select (one per level — use the first).
        const levelCefrSelect = screen.getAllByLabelText('a11y.cefr_level')[0];
        fireEvent.change(levelCefrSelect, { target: { value: 'B1' } });
        expect(cb.onUpdateLevel).toHaveBeenCalledWith('c1', 'l1', { cefrLevel: 'B1' });
        fireEvent.change(levelCefrSelect, { target: { value: '' } });
        expect(cb.onUpdateLevel).toHaveBeenCalledWith('c1', 'l1', { cefrLevel: undefined });

        // Delete level (renders because there are two).
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.action_delete_level')[0]);
        expect(cb.onDeleteLevel).toHaveBeenCalledWith('c1', 'l1');

        // Add a level.
        fireEvent.click(screen.getByText('rubricBuilder.action_add_level'));
        expect(cb.onAddLevel).toHaveBeenCalledWith('c1');
    });

    it('lists sub-items inline and edits, links, moves and deletes them', () => {
        const cb = makeCallbacks();
        renderCard(makeCriterion(), cb);

        const subLabel = screen.getByDisplayValue('Uses varied sentence structure');
        const subRow = subLabel.closest('li') as HTMLElement;

        fireEvent.change(subLabel, { target: { value: 'Varies sentence structure' } });
        expect(cb.onSetSubItems).toHaveBeenLastCalledWith('c1', 'l1', [
            { ...si1, label: 'Varies sentence structure' },
            si2,
            si3,
        ]);

        // si1 has a minimum, so its range is open: [min, max].
        const subInputs = within(subRow).getAllByRole('spinbutton');
        fireEvent.change(subInputs[0], { target: { value: '0' } });
        expect(cb.onSetSubItems).toHaveBeenLastCalledWith('c1', 'l1', [{ ...si1, minPoints: 0 }, si2, si3]);
        fireEvent.change(subInputs[1], { target: { value: '4' } });
        expect(cb.onSetSubItems).toHaveBeenLastCalledWith('c1', 'l1', [{ ...si1, maxPoints: 4, points: 4 }, si2, si3]);

        // Legacy si2 shows its points as the max; the bare si3 is worth 0. Neither shows a min until asked.
        const si2Row = screen.getByDisplayValue('Legacy sub item').closest('li') as HTMLElement;
        expect(
            within(si2Row)
                .getAllByRole('spinbutton')
                .map((el) => (el as HTMLInputElement).value)
        ).toEqual(['2']);
        const si3Row = screen.getByDisplayValue('Bare sub item').closest('li') as HTMLElement;
        expect(
            within(si3Row)
                .getAllByRole('spinbutton')
                .map((el) => (el as HTMLInputElement).value)
        ).toEqual(['0']);
        fireEvent.click(within(si2Row).getByLabelText('rubricBuilder.sub_item_range_toggle'));
        expect(within(si2Row).getAllByRole('spinbutton')).toHaveLength(2);
        fireEvent.click(within(si2Row).getByLabelText('rubricBuilder.sub_item_range_toggle'));
        expect(within(si2Row).getAllByRole('spinbutton')).toHaveLength(1);

        // Linked standard chips + unlink (both, incl. the guid fallback).
        expect(within(subRow).getByText('CCSS.ELA-LITERACY.W.8.2')).toBeInTheDocument();
        expect(within(subRow).getByText('sub-guid-2')).toBeInTheDocument();
        const subUnlinks = within(subRow).getAllByLabelText('rubricBuilder.action_unlink_standard');
        fireEvent.click(subUnlinks[0]);
        expect(cb.onUnlinkStandard).toHaveBeenCalledWith({ type: 'subitem', cid: 'c1', lid: 'l1', sid: 'si1' }, 0);
        fireEvent.click(subUnlinks[1]);
        expect(cb.onUnlinkStandard).toHaveBeenCalledWith({ type: 'subitem', cid: 'c1', lid: 'l1', sid: 'si1' }, 1);
        fireEvent.click(within(subRow).getByLabelText('rubricBuilder.sub_item_link_standard_title'));
        expect(cb.onPickStandard).toHaveBeenCalledWith({ type: 'subitem', cid: 'c1', lid: 'l1', sid: 'si1' });

        // Reorder, move to another level, delete.
        fireEvent.click(within(si2Row).getByLabelText('rubricBuilder.sub_item_move_up'));
        expect(cb.onSetSubItems).toHaveBeenLastCalledWith('c1', 'l1', [si2, si1, si3]);
        fireEvent.click(within(si2Row).getByLabelText('rubricBuilder.sub_item_move_down'));
        expect(cb.onSetSubItems).toHaveBeenLastCalledWith('c1', 'l1', [si1, si3, si2]);
        expect(within(subRow).getByLabelText('rubricBuilder.sub_item_move_up')).toBeDisabled();
        fireEvent.change(within(si2Row).getByLabelText('rubricBuilder.sub_item_move_to_level'), {
            target: { value: 'l2' },
        });
        expect(cb.onMoveSubItem).toHaveBeenCalledWith('c1', 'l1', 'si2', 'l2');
        fireEvent.click(within(subRow).getByLabelText('rubricBuilder.sub_item_delete_title'));
        expect(cb.onSetSubItems).toHaveBeenLastCalledWith('c1', 'l1', [si2, si3]);

        // Each level has its own add button; points-mode items start at 0–1.
        const addButtons = screen.getAllByText('rubricBuilder.action_add_sub_item');
        fireEvent.click(addButtons[1]);
        expect(cb.onSetSubItems).toHaveBeenLastCalledWith('c1', 'l2', [
            { id: expect.any(String), label: '', points: 1, minPoints: 0, maxPoints: 1 },
        ]);
    });

    it('adds, removes and pastes sub-items from the keyboard', () => {
        const cb = makeCallbacks();
        const empty = { id: 'e1', label: '' };
        renderCard(makeCriterion({ subItemMode: 'checklist', levels: [{ ...l1, subItems: [si1, empty] }, l2] }), cb);
        const first = screen.getByDisplayValue('Uses varied sentence structure');

        // Checklist items have no points inputs.
        expect(within(first.closest('li') as HTMLElement).queryAllByRole('spinbutton')).toHaveLength(0);

        fireEvent.keyDown(first, { key: 'Enter' });
        expect(cb.onSetSubItems).toHaveBeenLastCalledWith('c1', 'l1', [
            si1,
            { id: expect.any(String), label: '' },
            empty,
        ]);
        fireEvent.keyDown(first, { key: 'Enter', shiftKey: true });
        // Enter that confirms an IME candidate is part of typing, not "next statement".
        fireEvent.keyDown(first, { key: 'Enter', isComposing: true });
        expect(cb.onSetSubItems).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(first, { key: 'ArrowDown', altKey: true });
        expect(cb.onSetSubItems).toHaveBeenLastCalledWith('c1', 'l1', [empty, si1]);
        fireEvent.keyDown(first, { key: 'ArrowUp', altKey: true });
        expect(cb.onSetSubItems).toHaveBeenCalledTimes(2);

        const emptyInput = screen.getAllByPlaceholderText('rubricBuilder.placeholder_sub_item_label')[1];
        fireEvent.keyDown(emptyInput, { key: 'Backspace' });
        expect(cb.onSetSubItems).toHaveBeenLastCalledWith('c1', 'l1', [si1]);
        fireEvent.keyDown(first, { key: 'Backspace' });
        expect(cb.onSetSubItems).toHaveBeenCalledTimes(3);

        // A multi-line paste into an empty item fills it and adds the rest; into a filled one it inserts after.
        const paste = (el: HTMLElement, text: string) =>
            fireEvent.paste(el, { clipboardData: { getData: () => text } });
        paste(emptyInput, '☐ One\n• Two');
        expect(cb.onSetSubItems).toHaveBeenLastCalledWith('c1', 'l1', [
            si1,
            { ...empty, label: 'One' },
            { id: expect.any(String), label: 'Two' },
        ]);
        paste(first, '1. Three\n2. Four');
        expect(cb.onSetSubItems).toHaveBeenLastCalledWith('c1', 'l1', [
            si1,
            { id: expect.any(String), label: 'Three' },
            { id: expect.any(String), label: 'Four' },
            empty,
        ]);
        // A single line pastes normally.
        paste(first, 'just text');
        expect(cb.onSetSubItems).toHaveBeenCalledTimes(5);
    });

    it('offers an undo after turning a description into sub-items', () => {
        const cb = makeCallbacks();
        const showToast = vi.fn<
            (message: string, type?: string, options?: { action?: { onClick: () => void } }) => number
        >(() => 1);
        const existing = { id: 'x1', label: 'Existing' };
        render(
            <ToastContext.Provider value={{ showToast, dismissToast: vi.fn() }}>
                <DragDropContext onDragEnd={noop}>
                    <Droppable droppableId="criteria">
                        {(provided) => (
                            <div ref={provided.innerRef} {...provided.droppableProps}>
                                <CriterionCard
                                    {...cb}
                                    criterion={makeCriterion({
                                        subItemMode: 'checklist',
                                        levels: [{ ...l1, description: '• Alpha', subItems: [existing] }],
                                    })}
                                    cIdx={0}
                                    isFirst
                                    isLast
                                    collapsed={false}
                                    scoringMode="weighted-percentage"
                                />
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>
            </ToastContext.Provider>
        );
        fireEvent.click(screen.getByText('rubricBuilder.action_description_to_sub_items'));
        expect(cb.onSetSubItems).toHaveBeenLastCalledWith('c1', 'l1', [
            existing,
            { id: expect.any(String), label: 'Alpha' },
        ]);
        expect(showToast).toHaveBeenCalledWith('rubricBuilder.description_converted', 'info', expect.anything());

        showToast.mock.calls[0][2]!.action!.onClick();
        expect(cb.onSetSubItems).toHaveBeenLastCalledWith('c1', 'l1', [existing]);
        expect(cb.onUpdateLevel).toHaveBeenLastCalledWith('c1', 'l1', { description: '• Alpha' });
    });

    it('switches the sub-item mode and turns a description into sub-items', () => {
        const cb = makeCallbacks();
        renderCard(makeCriterion({ levels: [{ ...l1, description: 'First\nSecond', subItems: [] }] }), cb);

        const checklist = screen.getByRole('radio', { name: 'rubricBuilder.sub_item_mode_checklist' });
        expect(checklist).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByText('rubricBuilder.sub_item_mode_points_help')).toBeInTheDocument();
        fireEvent.click(checklist);
        expect(cb.onUpdateCriterion).toHaveBeenCalledWith('c1', { subItemMode: 'checklist' });

        fireEvent.click(screen.getByText('rubricBuilder.action_description_to_sub_items'));
        expect(cb.onSetSubItems).toHaveBeenCalledWith('c1', 'l1', [
            { id: expect.any(String), label: 'First', points: 1, minPoints: 0, maxPoints: 1 },
            { id: expect.any(String), label: 'Second', points: 1, minPoints: 0, maxPoints: 1 },
        ]);
        expect(cb.onUpdateLevel).toHaveBeenCalledWith('c1', 'l1', { description: '' });
    });
});
