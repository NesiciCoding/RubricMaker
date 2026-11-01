import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NormConfig, { type NormSettings } from '../NormConfig';
import NormPreview from '../NormPreview';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
        i18n: { language: 'en' },
    }),
}));

const scales = [{ id: 'gs1', name: 'Letters', type: 'letter' as const, ranges: [] }];

function Harness({ initial, onChange }: { initial: NormSettings; onChange?: (v: NormSettings) => void }) {
    const [value, setValue] = useState<NormSettings>(initial);
    return (
        <>
            <NormConfig
                value={value}
                maxPoints={10}
                gradeScales={scales}
                onChange={(patch) => {
                    const next = { ...value, ...patch };
                    setValue(next);
                    onChange?.(next);
                }}
            />
            <NormPreview test={value} maxPoints={10} />
        </>
    );
}

describe('NormConfig', () => {
    it('picks a grade scale for the default norm', () => {
        const onChange = vi.fn();
        render(<Harness initial={{}} onChange={onChange} />);
        expect(screen.getByText('tests.norm.preview_scale')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('tests.norm.scale_label'), { target: { value: 'gs1' } });
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ gradeScaleId: 'gs1' }));
        fireEvent.change(screen.getByLabelText('tests.norm.scale_label'), { target: { value: '' } });
        expect(onChange.mock.lastCall![0].gradeScaleId).toBeUndefined();
    });

    it('edits the pass grade and decimals of a numeric norm', () => {
        const onChange = vi.fn();
        render(<Harness initial={{ gradingNorm: { type: 'caesura', passPoints: 5 } }} onChange={onChange} />);
        fireEvent.change(screen.getByLabelText('tests.norm.pass_points_label'), { target: { value: '6' } });
        fireEvent.change(screen.getByLabelText('tests.norm.pass_grade_label'), { target: { value: '6' } });
        fireEvent.change(screen.getByLabelText('tests.norm.decimals_label'), { target: { value: '0' } });
        expect(onChange.mock.lastCall![0]).toMatchObject({
            gradingNorm: { type: 'caesura', passPoints: 6 },
            passGrade: 6,
            gradeDecimals: 0,
        });
        fireEvent.change(screen.getByLabelText('tests.norm.pass_grade_label'), { target: { value: '' } });
        expect(onChange.mock.lastCall![0].passGrade).toBe(5.5);
    });

    it('builds a norm table with year/track columns', () => {
        const onChange = vi.fn();
        render(<Harness initial={{ gradingNorm: { type: 'scale' } }} onChange={onChange} />);
        fireEvent.change(document.getElementById('norm-type')!, { target: { value: 'table' } });
        fireEvent.click(screen.getByText('tests.norm.add_tier'));
        fireEvent.change(screen.getByLabelText(/tier_year.*"n":2/), { target: { value: 'jaar-3' } });
        fireEvent.change(screen.getByLabelText(/tier_track.*"n":2/), { target: { value: '' } });
        fireEvent.change(screen.getByLabelText(/tier_label.*"n":2/), { target: { value: 'J3' } });
        expect(screen.getByText('J3')).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.norm.add_row'));
        const cells = screen.getAllByLabelText(/grade_cell.*"n":2/);
        fireEvent.blur(cells[0], { target: { value: '2,5' } });
        fireEvent.blur(cells[1], { target: { value: 'x' } });
        const table = onChange.mock.lastCall![0].gradingNorm;
        expect(table.tiers[1]).toMatchObject({ year: 'jaar-3', label: 'J3' });
        expect(table.tiers[1].track).toBeUndefined();
        expect(table.rows[0].grades[table.tiers[1].id]).toBe(2.5);
        expect(table.rows).toHaveLength(4);
        fireEvent.change(screen.getAllByLabelText('tests.norm.min_points')[3], { target: { value: '12' } });
        fireEvent.click(screen.getByLabelText(/remove_row.*"points":12/));
        fireEvent.click(screen.getByLabelText(/remove_tier.*"n":2/));
        const after = onChange.mock.lastCall![0].gradingNorm;
        expect(after.tiers).toHaveLength(1);
        expect(after.rows).toHaveLength(3);
        expect(Object.keys(after.rows[0].grades)).toEqual([after.tiers[0].id]);
    });

    it('replaces the table rows from a pasted block', () => {
        const onChange = vi.fn();
        render(
            <Harness initial={{ gradingNorm: { type: 'table', tiers: [{ id: 'a' }], rows: [] } }} onChange={onChange} />
        );
        fireEvent.click(screen.getByText('tests.norm.add_row'));
        const target = screen.getByLabelText('tests.norm.min_points');
        fireEvent.paste(target, { clipboardData: { getData: () => '0\t1\nfoo\t2\n5\t5,5\n10\t10' } });
        expect(onChange.mock.lastCall![0].gradingNorm.rows).toEqual([
            { minPoints: 0, grades: { a: 1 } },
            { minPoints: 5, grades: { a: 5.5 } },
            { minPoints: 10, grades: { a: 10 } },
        ]);
        fireEvent.paste(target, { clipboardData: { getData: () => '3' } });
        expect(onChange.mock.lastCall![0].gradingNorm.rows).toHaveLength(3);
    });

    it('switches to the N-term and shows the preview', () => {
        render(<Harness initial={{}} />);
        fireEvent.change(document.getElementById('norm-type')!, { target: { value: 'nterm' } });
        fireEvent.change(screen.getByLabelText('tests.norm.n_label'), { target: { value: '' } });
        expect(screen.getAllByText('10.0').length).toBeGreaterThan(0);
    });
});
