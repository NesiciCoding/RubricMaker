import type { GradeRange } from '../types';
import { pctToColor } from '../components/Statistics/CriterionHeatmap';

/**
 * Color for the Dashboard student snapshot's Grammar column. Uses the teacher's configured
 * `Settings.masteryColorBands` (same GradeRange shape as grade-scale colors, edited the same way
 * in SettingsPage) when set, otherwise falls back to the app's existing red→yellow→green
 * `pctToColor` interpolation so the default look needs no configuration.
 */
export function scoreToMasteryColor(pct: number, bands?: GradeRange[]): string {
    if (bands && bands.length > 0) {
        const clamped = Math.max(0, Math.min(100, pct));
        const match = bands.find((b) => clamped >= b.min && clamped <= b.max);
        if (match) return match.color;
    }
    return pctToColor(pct);
}
