import { describe, it, expect } from 'vitest';
import { gradeRangeWarnings } from '../SettingsPage';
import type { GradeRange } from '../../types';

const range = (min: number, max: number, label = `${min}-${max}`): GradeRange => ({
    min,
    max,
    label,
    color: '#000000',
});

describe('gradeRangeWarnings', () => {
    it('accepts the shipped scales', () => {
        expect(
            gradeRangeWarnings([range(90, 100, 'A'), range(80, 89, 'B'), range(70, 79, 'C'), range(0, 69, 'F')])
        ).toEqual([]);
        expect(gradeRangeWarnings([range(55, 100, 'Pass'), range(0, 54, 'Fail')])).toEqual([]);
    });

    it('reports an overlap once two ranges claim the same percentage', () => {
        expect(gradeRangeWarnings([range(0, 100), range(80, 90)])).toEqual(['settings.range_warning_overlap']);
    });

    it('reports a gap only when a percentage is claimed by no range', () => {
        // 50–59 is unreachable; 0–100 coverage is intact, so only the gap is flagged.
        expect(gradeRangeWarnings([range(0, 49), range(60, 100)])).toEqual(['settings.range_warning_gap']);
        // Adjacent integer ranges (0–49, 50–100) are contiguous, not gapped.
        expect(gradeRangeWarnings([range(0, 49), range(50, 100)])).toEqual([]);
    });

    it('reports a range that ends below where it starts', () => {
        expect(gradeRangeWarnings([range(0, 100, 'ok'), { ...range(90, 40), label: 'inverted' }])).toContain(
            'settings.range_warning_min_above_max'
        );
    });

    it('reports scales that do not reach both ends of 0–100', () => {
        expect(gradeRangeWarnings([range(5, 100)])).toEqual(['settings.range_warning_coverage']);
        expect(gradeRangeWarnings([range(0, 95)])).toEqual(['settings.range_warning_coverage']);
    });

    it('ignores the untouched 0–0 placeholder row', () => {
        // A row that was just added (min and max still 0) is not yet a real range.
        expect(gradeRangeWarnings([range(0, 100, 'Pass'), range(0, 0, 'New')])).toEqual([]);
        // A scale with no rows at all has nothing to report.
        expect(gradeRangeWarnings([])).toEqual([]);
    });

    it('reports a scale left with nothing but the placeholder row', () => {
        // Deleting the real row while a 0–0 row is open leaves a scale whose only range matches any
        // score, so it has to complain instead of falling through the placeholder filter in silence.
        expect(gradeRangeWarnings([range(0, 0, 'New')])).toEqual(['settings.range_warning_coverage']);
    });

    it('does not report a gap that a broader range already covers', () => {
        // 0–100 spans 30–40, so only the overlap is real. Comparing against the previous row alone
        // would report a gap between 30 and 40 on the strength of the narrower rows.
        expect(gradeRangeWarnings([range(0, 100, 'All'), range(20, 30, 'Low'), range(40, 50, 'Mid')])).toEqual([
            'settings.range_warning_overlap',
        ]);
    });

    it('collapses repeated overflow warnings into one entry', () => {
        expect(gradeRangeWarnings([range(0, 100), range(0, 100)])).toEqual(['settings.range_warning_overlap']);
    });
});
