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
        expect(gradeRangeWarnings([range(0, 0, 'New')])).toEqual([]);
        // A scale with no rows at all has nothing to report.
        expect(gradeRangeWarnings([])).toEqual([]);
    });

    it('collapses repeated overflow warnings into one entry', () => {
        expect(gradeRangeWarnings([range(0, 100), range(0, 100)])).toEqual(['settings.range_warning_overlap']);
    });
});
