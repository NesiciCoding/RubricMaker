import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RubricCriterion, TieredConfig } from '../../../types';
import TieredCriterionGrid from '../TieredCriterionGrid';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

const config: TieredConfig = {
    tiers: [
        { id: 'mavo', year: 'jaar-1', track: 'vmbo-tl', label: 'Mavo' },
        { id: 'havo', year: 'jaar-1', track: 'havo' },
    ],
    bands: [
        { id: 'io', code: 'IO', label: 'In ontwikkeling', points: 0, color: '#ffd7de' },
        { id: 'b', code: 'B', label: '', points: 1 },
        { id: 'e', code: 'E', label: 'Expert', points: 2 },
    ],
};

const std = { guid: 'g1', statementNotation: 'ELA.1', description: 'd', standardSetTitle: 's', jurisdictionTitle: 'j' };

// The criterion has no level for band E, as after a band was added but not yet synced.
const criterion: RubricCriterion = {
    id: 'c1',
    title: 'Spelling',
    description: '',
    weight: 100,
    subItemMode: 'checklist',
    levels: [
        {
            id: 'lb',
            bandId: 'b',
            label: 'B',
            minPoints: 1,
            maxPoints: 1,
            description: '',
            subItems: [
                { id: 'm1', label: 'Mavo B', tierId: 'mavo' },
                { id: 'h1', label: 'Havo B', tierId: 'havo', linkedStandards: [std] },
            ],
        },
        {
            id: 'lio',
            bandId: 'io',
            label: 'IO',
            minPoints: 0,
            maxPoints: 0,
            description: '',
            subItems: [{ id: 'm2', label: 'Mavo IO', tierId: 'mavo' }],
        },
    ],
};

function setup() {
    const cb = {
        onSetSubItems: vi.fn(),
        onMoveSubItem: vi.fn(),
        onPickStandard: vi.fn(),
        onUnlinkStandard: vi.fn(),
    };
    render(<TieredCriterionGrid criterion={criterion} config={config} {...cb} />);
    return cb;
}

const cell = (band: string, tier: string) =>
    screen.getByRole('list', {
        name: `rubricBuilder.sub_items_list_label:${JSON.stringify({
            level: `rubricBuilder.tiered_cell_label:${JSON.stringify({ band, tier })}`,
        })}`,
    });

describe('TieredCriterionGrid', () => {
    it('lays out bands worst-first against tier columns, skipping a band without a level', () => {
        setup();
        expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
            'rubricBuilder.tiered_band',
            'Mavo',
            'Jaar 1 · HAVO',
        ]);
        expect(screen.getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['IOIn ontwikkeling', 'B']);
        expect(screen.getAllByRole('rowheader')[0].style.background).toContain('rgb(255, 215, 222)');
        expect(screen.getAllByRole('rowheader')[1].style.background).toContain('rgb(235, 249, 216)');
        expect(within(cell('B', 'Mavo')).getByDisplayValue('Mavo B')).toBeInTheDocument();
        expect(within(cell('B', 'Jaar 1 · HAVO')).getByDisplayValue('Havo B')).toBeInTheDocument();
        expect(within(cell('IO', 'Jaar 1 · HAVO')).queryAllByRole('listitem')).toHaveLength(0);
    });

    it("edits one cell's statements, keeping other tiers and tagging new ones with the cell's tier", () => {
        const cb = setup();
        fireEvent.change(within(cell('B', 'Mavo')).getByDisplayValue('Mavo B'), { target: { value: 'Mavo B!' } });
        expect(cb.onSetSubItems).toHaveBeenLastCalledWith('c1', 'lb', [
            { id: 'h1', label: 'Havo B', tierId: 'havo', linkedStandards: [std] },
            { id: 'm1', label: 'Mavo B!', tierId: 'mavo' },
        ]);

        fireEvent.click(screen.getAllByText('rubricBuilder.action_add_sub_item')[1]);
        expect(cb.onSetSubItems).toHaveBeenLastCalledWith('c1', 'lio', [
            { id: 'm2', label: 'Mavo IO', tierId: 'mavo' },
            { id: expect.any(String), label: '', tierId: 'havo' },
        ]);
    });

    it('moves a statement to another band and links or unlinks its standards', () => {
        const cb = setup();
        const havoB = within(cell('B', 'Jaar 1 · HAVO'));
        const move = havoB.getByLabelText('rubricBuilder.sub_item_move_to_level') as HTMLSelectElement;
        expect(Array.from(move.options).map((o) => o.textContent)).toEqual([
            'rubricBuilder.sub_item_move_to_level_short',
            'IO',
        ]);
        fireEvent.change(move, { target: { value: 'lio' } });
        expect(cb.onMoveSubItem).toHaveBeenCalledWith('c1', 'lb', 'h1', 'lio');

        fireEvent.click(havoB.getByLabelText('rubricBuilder.sub_item_link_standard_title'));
        expect(cb.onPickStandard).toHaveBeenCalledWith({ type: 'subitem', cid: 'c1', lid: 'lb', sid: 'h1' });
        fireEvent.click(havoB.getByLabelText('rubricBuilder.action_unlink_standard'));
        expect(cb.onUnlinkStandard).toHaveBeenCalledWith({ type: 'subitem', cid: 'c1', lid: 'lb', sid: 'h1' }, 0);
    });

    it('shows the keyboard hint once for the whole grid', () => {
        setup();
        expect(screen.getAllByText('rubricBuilder.sub_items_keyboard_hint')).toHaveLength(1);
        expect(screen.queryByText('rubricBuilder.sub_items_checklist_heading')).toBeNull();
    });
});
