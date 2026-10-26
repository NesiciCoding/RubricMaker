import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TieredConfig } from '../../../types';
import TieredGradingBar from '../TieredGradingBar';

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
    ],
};

function setup(props: Partial<React.ComponentProps<typeof TieredGradingBar>> = {}) {
    const onChange = vi.fn();
    render(
        <TieredGradingBar
            config={config}
            tierId="havo"
            classTierId="havo"
            requirementsMet={undefined}
            verdictOverride={undefined}
            verdict={undefined}
            percentage={0}
            complete={false}
            onChange={onChange}
            {...props}
        />
    );
    return onChange;
}

describe('TieredGradingBar', () => {
    it('labels tiers by their header or year and track, and offers the class tier back after a switch', () => {
        const onChange = setup({ tierId: 'mavo' });
        const select = screen.getByLabelText('gradeStudent.tiered_tier') as HTMLSelectElement;
        expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Mavo', 'Jaar 1 · HAVO']);
        expect(select.value).toBe('mavo');
        fireEvent.click(screen.getByLabelText('gradeStudent.tiered_use_class_tier'));
        expect(onChange).toHaveBeenCalledWith({ tierId: undefined });
    });

    it('asks for a tier when the saved one no longer exists and the class has none', () => {
        const onChange = setup({ tierId: 'gone', classTierId: undefined });
        const select = screen.getByLabelText('gradeStudent.tiered_tier') as HTMLSelectElement;
        expect(select.value).toBe('');
        expect(select.options[0].textContent).toBe('gradeStudent.tiered_choose_tier');
        expect(screen.getByText('gradeStudent.tiered_no_tier')).toBeInTheDocument();
        expect(screen.queryByLabelText('gradeStudent.tiered_use_class_tier')).toBeNull();
        fireEvent.change(select, { target: { value: 'mavo' } });
        expect(onChange).toHaveBeenCalledWith({ tierId: 'mavo' });
    });

    it('hides requirements when the rubric has none', () => {
        setup();
        expect(screen.queryByText('gradeStudent.tiered_requirements')).toBeNull();
    });

    it('holds back a points verdict until grading is complete, but shows an override straight away', () => {
        const io = config.bands[0];
        const b = config.bands[1];
        const { unmount } = render(
            <TieredGradingBar
                config={config}
                tierId="havo"
                classTierId="havo"
                requirementsMet={undefined}
                verdictOverride={undefined}
                verdict={{ band: io, reason: 'score' }}
                percentage={10}
                complete={false}
                onChange={vi.fn()}
            />
        );
        expect(screen.getByText('gradeStudent.tiered_verdict_pending')).toBeInTheDocument();
        unmount();

        setup({ verdict: { band: b, reason: 'override' }, verdictOverride: 'b' });
        expect(screen.getByText('B', { selector: 'span' })).toBeInTheDocument();
        expect(screen.getByText('gradeStudent.tiered_verdict_reason_override:{"pct":0}')).toBeInTheDocument();
        const override = screen.getByLabelText(/tiered_verdict_override/) as HTMLSelectElement;
        expect(override.value).toBe('b');
        expect(Array.from(override.options).map((o) => o.textContent)).toEqual([
            'gradeStudent.tiered_verdict_auto',
            'IO — In ontwikkeling',
            'B',
        ]);
    });

    it('treats an override of a removed band as automatic', () => {
        setup({ verdictOverride: 'gone' });
        expect((screen.getByLabelText(/tiered_verdict_override/) as HTMLSelectElement).value).toBe('');
    });
});
