import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TieredConfig } from '../../../types';
import TieredConfigPanel from '../TieredConfigPanel';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

const initial: TieredConfig = {
    tiers: [
        { id: 'mavo', year: 'jaar-1', track: 'vmbo-tl', label: 'Mavo' },
        { id: 'havo', year: 'jaar-1', track: 'havo' },
    ],
    bands: [
        { id: 'io', code: 'IO', label: 'In ontwikkeling', points: 0, color: '#ffd7de' },
        { id: 'b', code: 'B', label: 'Beheerst', points: 1 },
        { id: 'e', code: 'E', label: 'Expert', points: 2, minPercentage: 80 },
    ],
    requirements: [{ id: 'r1', text: 'Op tijd' }],
};

function Harness({ start = initial, onChange }: { start?: TieredConfig; onChange?: (c: TieredConfig) => void }) {
    const [config, setConfig] = useState(start);
    return (
        <TieredConfigPanel
            config={config}
            onChange={(next) => {
                onChange?.(next);
                setConfig(next);
            }}
        />
    );
}

function setup(start?: TieredConfig) {
    const changes: TieredConfig[] = [];
    render(<Harness start={start} onChange={(c) => changes.push(c)} />);
    return { last: () => changes[changes.length - 1] };
}

const byLabel = (key: string, params: Record<string, unknown>) =>
    screen.getByLabelText(`rubricBuilder.${key}:${JSON.stringify(params)}`);

describe('TieredConfigPanel — tiers', () => {
    it('edits a tier, clearing the track for a year without tracks', () => {
        const { last } = setup();
        fireEvent.change(byLabel('tiered_track_of', { n: 2 }), { target: { value: 'vwo' } });
        expect(last().tiers[1]).toEqual({ id: 'havo', year: 'jaar-1', track: 'vwo' });

        const year = byLabel('tiered_year_of', { n: 1 });
        fireEvent.change(year, { target: { value: 'groep-8' } });
        expect(last().tiers[0]).toEqual({ id: 'mavo', year: 'groep-8', track: undefined, label: 'Mavo' });
        expect(byLabel('tiered_track_of', { n: 1 })).toBeDisabled();

        fireEvent.change(year, { target: { value: 'jaar-2' } });
        fireEvent.change(byLabel('tiered_track_of', { n: 1 }), { target: { value: '' } });
        expect(last().tiers[0].track).toBeUndefined();
    });

    it('shows the default header as a placeholder and clears an emptied label', () => {
        const { last } = setup();
        const label = byLabel('tiered_column_label_of', { n: 2 }) as HTMLInputElement;
        expect(label.placeholder).toBe('Jaar 1 · HAVO');
        fireEvent.change(label, { target: { value: 'Havo+' } });
        expect(last().tiers[1].label).toBe('Havo+');
        fireEvent.change(label, { target: { value: '' } });
        expect(last().tiers[1].label).toBeUndefined();
    });

    it('adds a tier for the next unused track of the same year, and removes tiers down to one', () => {
        const { last } = setup();
        fireEvent.click(screen.getByText('rubricBuilder.tiered_add_tier'));
        expect(last().tiers[2]).toEqual({ id: expect.any(String), year: 'jaar-1', track: 'vmbo-bb' });

        fireEvent.click(screen.getByLabelText('rubricBuilder.tiered_remove_tier:{"name":"Mavo"}'));
        fireEvent.click(screen.getByLabelText('rubricBuilder.tiered_remove_tier:{"name":"Jaar 1 · HAVO"}'));
        expect(last().tiers.map((t) => t.track)).toEqual(['vmbo-bb']);
        expect(screen.getByLabelText('rubricBuilder.tiered_remove_tier:{"name":"Jaar 1 · VMBO-BB"}')).toBeDisabled();
    });

    it('adds a trackless tier when the year has none, and starts from jaar 1 with no tiers', () => {
        const { last } = setup({ ...initial, tiers: [{ id: 'g7', year: 'groep-7' }] });
        fireEvent.click(screen.getByText('rubricBuilder.tiered_add_tier'));
        expect(last().tiers[1]).toEqual({ id: expect.any(String), year: 'groep-7' });

        const empty = setup({ ...initial, tiers: [] });
        fireEvent.click(screen.getAllByText('rubricBuilder.tiered_add_tier')[1]);
        expect(empty.last().tiers).toEqual([{ id: expect.any(String), year: 'jaar-1', track: 'vmbo-bb' }]);
    });
});

describe('TieredConfigPanel — bands', () => {
    it('edits code, name, points, colour and the verdict percentage of a band', () => {
        const { last } = setup();
        fireEvent.change(byLabel('tiered_band_code_of', { n: 2 }), { target: { value: 'V' } });
        fireEvent.change(byLabel('tiered_band_label_of', { n: 2 }), { target: { value: 'Voldoende' } });
        fireEvent.change(byLabel('tiered_band_points_of', { name: 'V' }), { target: { value: '3' } });
        fireEvent.change(byLabel('tiered_band_colour_of', { name: 'V' }), { target: { value: '#00ff00' } });
        fireEvent.change(byLabel('tiered_band_cutoff_of', { name: 'V' }), { target: { value: '40' } });
        expect(last().bands[1]).toEqual({
            id: 'b',
            code: 'V',
            label: 'Voldoende',
            points: 3,
            color: '#00ff00',
            minPercentage: 40,
        });
        fireEvent.change(byLabel('tiered_band_cutoff_of', { name: 'V' }), { target: { value: '' } });
        expect(last().bands[1].minPercentage).toBeUndefined();
    });

    it('fixes the lowest band at 0% and suggests the midpoint for the others', () => {
        setup();
        const lowest = byLabel('tiered_band_cutoff_of', { name: 'IO' }) as HTMLInputElement;
        expect(lowest).toBeDisabled();
        expect(lowest.value).toBe('0');
        expect((byLabel('tiered_band_cutoff_of', { name: 'B' }) as HTMLInputElement).placeholder).toBe('25');
        expect((byLabel('tiered_band_cutoff_of', { name: 'E' }) as HTMLInputElement).value).toBe('80');
    });

    it('resets every verdict percentage to the default', () => {
        const { last } = setup();
        fireEvent.click(screen.getByText('rubricBuilder.tiered_reset_cutoffs'));
        expect(last().bands.every((b) => b.minPercentage === undefined)).toBe(true);
        expect(screen.getByText('rubricBuilder.tiered_reset_cutoffs').closest('button')).toBeDisabled();
    });

    it('adds a band one point above the top band and removes bands down to one', () => {
        const { last } = setup();
        fireEvent.click(screen.getByText('rubricBuilder.tiered_add_band'));
        expect(last().bands[3]).toEqual({ id: expect.any(String), code: '', label: '', points: 3 });
        // A band without a code is named by its position.
        fireEvent.click(screen.getByLabelText('rubricBuilder.tiered_remove_band:{"name":"4"}'));
        fireEvent.click(screen.getByLabelText('rubricBuilder.tiered_remove_band:{"name":"IO"}'));
        fireEvent.click(screen.getByLabelText('rubricBuilder.tiered_remove_band:{"name":"B"}'));
        expect(last().bands.map((b) => b.code)).toEqual(['E']);
        expect(screen.getByLabelText('rubricBuilder.tiered_remove_band:{"name":"E"}')).toBeDisabled();
    });

    it('starts a first band at one point and lists what makes the config unusable', () => {
        const { last } = setup({ ...initial, bands: [] });
        expect(within(screen.getByRole('alert')).getByText('rubricBuilder.tiered_issue_no_bands')).toBeInTheDocument();
        fireEvent.click(screen.getByText('rubricBuilder.tiered_add_band'));
        expect(last().bands[0].points).toBe(1);
        expect(screen.queryByRole('alert')).toBeNull();
    });
});

describe('TieredConfigPanel — requirements', () => {
    it('adds, edits and removes requirements', () => {
        const { last } = setup({ ...initial, requirements: undefined });
        expect(screen.getByText('rubricBuilder.tiered_requirements_help:{"band":"IO"}')).toBeInTheDocument();
        fireEvent.click(screen.getByText('rubricBuilder.tiered_add_requirement'));
        fireEvent.click(screen.getByText('rubricBuilder.tiered_add_requirement'));
        fireEvent.change(byLabel('tiered_requirement_of', { n: 2 }), { target: { value: 'Zelf geschreven' } });
        expect(last().requirements?.map((r) => r.text)).toEqual(['', 'Zelf geschreven']);
        fireEvent.click(screen.getByLabelText('rubricBuilder.tiered_remove_requirement:{"n":1}'));
        expect(last().requirements?.map((r) => r.text)).toEqual(['Zelf geschreven']);
    });

    it('names no band in the help text when there are none', () => {
        setup({ ...initial, bands: [] });
        expect(screen.getByText('rubricBuilder.tiered_requirements_help:{"band":""}')).toBeInTheDocument();
    });
});
