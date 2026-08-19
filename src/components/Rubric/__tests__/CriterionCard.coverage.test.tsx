import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import CriterionCard from '../CriterionCard';
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
        onAddSubItem: vi.fn(),
        onUpdateSubItem: vi.fn(),
        onDeleteSubItem: vi.fn(),
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
                            onAddSubItem={cb.onAddSubItem}
                            onUpdateSubItem={cb.onUpdateSubItem}
                            onDeleteSubItem={cb.onDeleteSubItem}
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
        renderCard(makeCriterion(), cb);

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
        const levelCefrSelect = screen.getAllByLabelText('CEFR level')[0];
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

    it('expands sub-items and edits, links, and deletes them', () => {
        const cb = makeCallbacks();
        renderCard(makeCriterion(), cb);

        // Expand the sub-items of l1.
        const subToggle = screen.getByText('rubricBuilder.label_sub_items (3)');
        fireEvent.click(subToggle);
        const subLabel = screen.getByDisplayValue('Uses varied sentence structure');
        expect(subLabel).toBeInTheDocument();
        const subRow = subLabel.closest('div') as HTMLElement;

        // Sub-item label edit.
        fireEvent.change(subLabel, { target: { value: 'Varies sentence structure' } });
        expect(cb.onUpdateSubItem).toHaveBeenCalledWith('c1', 'l1', 'si1', { label: 'Varies sentence structure' });

        // Sub-item min/max points, scoped to the si1 row.
        const subInputs = within(subRow).getAllByRole('spinbutton');
        fireEvent.change(subInputs[0], { target: { value: '0' } });
        expect(cb.onUpdateSubItem).toHaveBeenCalledWith('c1', 'l1', 'si1', { minPoints: 0 });
        fireEvent.change(subInputs[1], { target: { value: '4' } });
        expect(cb.onUpdateSubItem).toHaveBeenCalledWith('c1', 'l1', 'si1', { maxPoints: 4 });

        // Legacy fallbacks: si2 shows min 0 / max from points (2); si3 shows min 0 / max 1.
        const si2Row = screen.getByDisplayValue('Legacy sub item').closest('div') as HTMLElement;
        const si2Inputs = within(si2Row).getAllByRole('spinbutton');
        expect(si2Inputs[0]).toHaveValue(0);
        expect(si2Inputs[1]).toHaveValue(2);
        const si3Row = screen.getByDisplayValue('Bare sub item').closest('div') as HTMLElement;
        const si3Inputs = within(si3Row).getAllByRole('spinbutton');
        expect(si3Inputs[0]).toHaveValue(0);
        expect(si3Inputs[1]).toHaveValue(1);

        // Sub-item linked standard chips + unlink (both, incl. the guid fallback). The chips
        // render below the row, so scope to the whole sub-items section.
        expect(screen.getByText('CCSS.ELA-LITERACY.W.8.2')).toBeInTheDocument();
        expect(screen.getByText('sub-guid-2')).toBeInTheDocument();
        const subUnlinks = screen.getAllByLabelText('rubricBuilder.action_unlink_standard');
        expect(subUnlinks).toHaveLength(2);
        fireEvent.click(subUnlinks[0]);
        expect(cb.onUnlinkStandard).toHaveBeenCalledWith({ type: 'subitem', cid: 'c1', lid: 'l1', sid: 'si1' }, 0);
        fireEvent.click(subUnlinks[1]);
        expect(cb.onUnlinkStandard).toHaveBeenCalledWith({ type: 'subitem', cid: 'c1', lid: 'l1', sid: 'si1' }, 1);

        // Link a standard to the sub-item.
        fireEvent.click(within(subRow).getByLabelText('rubricBuilder.sub_item_link_standard_title'));
        expect(cb.onPickStandard).toHaveBeenCalledWith({ type: 'subitem', cid: 'c1', lid: 'l1', sid: 'si1' });

        // Delete the sub-item.
        fireEvent.click(within(subRow).getByLabelText('rubricBuilder.sub_item_delete_title'));
        expect(cb.onDeleteSubItem).toHaveBeenCalledWith('c1', 'l1', 'si1');

        // Collapse again — the sub-item editor disappears.
        fireEvent.click(subToggle);
        expect(screen.queryByDisplayValue('Uses varied sentence structure')).not.toBeInTheDocument();

        // Re-expand l1 and add a sub-item.
        fireEvent.click(screen.getByText('rubricBuilder.label_sub_items (3)'));
        fireEvent.click(screen.getByText('rubricBuilder.action_add_sub_item'));
        expect(cb.onAddSubItem).toHaveBeenCalledWith('c1', 'l1');

        // Expand the empty sub-items of l2 and add there too (second add button).
        fireEvent.click(screen.getByText('rubricBuilder.label_sub_items (0)'));
        fireEvent.click(screen.getAllByText('rubricBuilder.action_add_sub_item')[1]);
        expect(cb.onAddSubItem).toHaveBeenCalledWith('c1', 'l2');
    });
});
