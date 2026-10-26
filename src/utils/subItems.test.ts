import { describe, expect, it } from 'vitest';
import type { Rubric, RubricCriterion, RubricLevel, ScoreEntry, SubItem } from '../types';
import { DEFAULT_FORMAT } from '../types';
import { calcEntryPoints, patchScoreEntry } from './gradeCalc';
import { remapEntriesToRubric } from './gradeSnapshot';
import {
    bestFitLevel,
    isTicked,
    keepExistingTicks,
    splitIntoSubItemLabels,
    stripListMarker,
    scoresSubItems,
    subItemBreakdown,
    subItemEarned,
    subItemMode,
    subItemRange,
    subItemScore,
    toggleTick,
} from './subItems';

const si = (id: string, extra: Partial<SubItem> = {}): SubItem => ({ id, label: id, ...extra });

function level(id: string, points: number, subItems: SubItem[], maxPoints = points): RubricLevel {
    return { id, label: id, minPoints: points, maxPoints, description: '', subItems };
}

function criterion(mode: RubricCriterion['subItemMode'], levels: RubricLevel[]): RubricCriterion {
    return { id: 'c1', title: 'C', description: '', weight: 100, levels, subItemMode: mode };
}

const entry = (patch: Partial<ScoreEntry> = {}): ScoreEntry => ({
    criterionId: 'c1',
    levelId: null,
    comment: '',
    checkedSubItems: [],
    ...patch,
});

// IO / B / E, three statements each, like a row of the MY ID card sheet.
const checklistLevels = [
    level('e', 2, [si('e1'), si('e2'), si('e3')]),
    level('b', 1, [si('b1'), si('b2'), si('b3')]),
    level('io', 0, [si('io1'), si('io2'), si('io3')]),
];

describe('subItemMode / scoresSubItems', () => {
    it('treats a criterion without a mode as points mode', () => {
        expect(subItemMode({})).toBe('points');
        expect(subItemMode({ subItemMode: 'checklist' })).toBe('checklist');
        expect(subItemMode({ subItemMode: 'bogus' as never })).toBe('points');
    });

    it('only scores sub-items in points mode when some level has them', () => {
        expect(scoresSubItems(criterion(undefined, [level('a', 1, [si('x')])]))).toBe(true);
        expect(scoresSubItems(criterion(undefined, [level('a', 1, [])]))).toBe(false);
        expect(scoresSubItems(criterion('checklist', [level('a', 1, [si('x')])]))).toBe(false);
    });

    it('tolerates levels saved without a subItems array', () => {
        const legacy = { subItemMode: undefined, levels: [{ id: 'a' } as RubricLevel] };
        expect(scoresSubItems(legacy)).toBe(false);
    });
});

describe('sub-item points', () => {
    it('reads the range, falling back to the legacy single points value', () => {
        expect(subItemRange(si('a', { minPoints: 1, maxPoints: 3, points: 9 }))).toEqual({ min: 1, max: 3 });
        expect(subItemRange(si('a', { points: 2 }))).toEqual({ min: 0, max: 2 });
        expect(subItemRange(si('a'))).toEqual({ min: 0, max: 0 });
    });

    it('scores an explicit value, else a legacy tick at its maximum, else nothing', () => {
        const item = si('a', { minPoints: 1, maxPoints: 3 });
        expect(subItemScore(entry({ subItemScores: { a: 2 } }), item)).toBe(2);
        expect(subItemScore(entry({ checkedSubItems: ['a'] }), item)).toBe(3);
        expect(subItemScore(entry(), item)).toBeUndefined();
        // An unscored item counts 0 towards the total, not its minimum.
        expect(subItemEarned(entry(), item)).toBe(0);
    });

    it('explains how a points-mode level reaches its total, including the clamp', () => {
        const lvl = level('a', 2, [si('x', { maxPoints: 2 }), si('y', { maxPoints: 2 })], 4);
        expect(subItemBreakdown(entry({ levelId: 'a', subItemScores: { x: 1 } }), lvl)).toEqual({
            base: 2,
            items: 1,
            total: 3,
            clamped: false,
        });
        expect(subItemBreakdown(entry({ levelId: 'a', subItemScores: { x: 2, y: 2 } }), lvl)).toEqual({
            base: 2,
            items: 4,
            total: 4,
            clamped: true,
        });
    });

    it('agrees with calcEntryPoints for points-mode criteria', () => {
        const lvl = level('a', 2, [si('x', { maxPoints: 2 }), si('y', { points: 1 })], 5);
        const c = criterion(undefined, [lvl]);
        for (const e of [
            entry({ levelId: 'a' }),
            entry({ levelId: 'a', subItemScores: { x: 1.5 } }),
            entry({ levelId: 'a', checkedSubItems: ['y'], selectedPoints: 3 }),
            entry({ levelId: 'a', subItemScores: { x: 2 }, checkedSubItems: ['y'], selectedPoints: 4 }),
        ]) {
            expect(calcEntryPoints(e, c)).toBe(subItemBreakdown(e, lvl).total);
        }
    });
});

describe('ticks', () => {
    it('toggles a tick on and off', () => {
        const ticked = toggleTick(entry(), 'a');
        expect(ticked).toEqual(['a']);
        expect(isTicked(entry({ checkedSubItems: ticked }), 'a')).toBe(true);
        expect(toggleTick(entry({ checkedSubItems: ticked }), 'a')).toEqual([]);
    });

    it('keeps only ticks whose sub-item still exists on any level', () => {
        const c = criterion('checklist', checklistLevels);
        expect(keepExistingTicks(c, ['b1', 'gone', 'io3'])).toEqual(['b1', 'io3']);
    });
});

describe('bestFitLevel', () => {
    const c = criterion('checklist', checklistLevels);

    it('is null until something is ticked', () => {
        expect(bestFitLevel(c, entry())).toBeNull();
    });

    it('picks the level with the highest share of its statements ticked', () => {
        expect(bestFitLevel(c, entry({ checkedSubItems: ['b1', 'b2', 'e1'] }))?.id).toBe('b');
        expect(bestFitLevel(c, entry({ checkedSubItems: ['io1', 'e1', 'e2'] }))?.id).toBe('e');
    });

    it('breaks a tie towards the lower level', () => {
        expect(bestFitLevel(c, entry({ checkedSubItems: ['io1', 'b1'] }))?.id).toBe('io');
    });

    it('ignores statements the filter hides', () => {
        const visible = (item: SubItem) => item.id !== 'b2' && item.id !== 'b3';
        expect(bestFitLevel(c, entry({ checkedSubItems: ['b1', 'e1', 'e2'] }), visible)?.id).toBe('b');
    });
});

describe('checklist mode in the grading engine', () => {
    const c = criterion('checklist', checklistLevels);

    it('scores the level alone; ticks never add points', () => {
        expect(calcEntryPoints(entry({ levelId: 'b', checkedSubItems: ['b1', 'b2', 'e1'] }), c)).toBe(1);
        expect(calcEntryPoints(entry({ levelId: 'io', checkedSubItems: ['e1', 'e2', 'e3'] }), c)).toBe(0);
    });

    it('keeps ticks when the level changes, unlike points mode', () => {
        const before = entry({ levelId: 'b', checkedSubItems: ['b1', 'e1'], subItemScores: { b1: 1 } });
        const checklist = patchScoreEntry(before, { levelId: 'e' }, 'checklist');
        expect(checklist.checkedSubItems).toEqual(['b1', 'e1']);
        expect(checklist.subItemScores).toBeUndefined();
        expect(patchScoreEntry(before, { levelId: 'e' }).checkedSubItems).toEqual([]);
    });

    it('keeps ticks on every level when a grade is moved to a newer rubric version', () => {
        const rubric: Rubric = {
            id: 'r',
            name: 'R',
            subject: '',
            description: '',
            gradeScaleId: 'gs',
            format: DEFAULT_FORMAT,
            attachmentIds: [],
            createdAt: '',
            updatedAt: '',
            totalMaxPoints: 0,
            scoringMode: 'weighted-percentage',
            criteria: [criterion('checklist', checklistLevels.slice(0, 2))],
        };
        const graded = entry({ levelId: 'b', checkedSubItems: ['b1', 'e2', 'io1'] });
        expect(remapEntriesToRubric([graded], rubric).entries[0].checkedSubItems).toEqual(['b1', 'e2']);

        const ungraded = entry({ checkedSubItems: ['e2', 'io1'] });
        expect(remapEntriesToRubric([ungraded], rubric).entries[0].checkedSubItems).toEqual(['e2']);

        const removedLevel = entry({ levelId: 'io', checkedSubItems: ['b1', 'io1'] });
        const remapped = remapEntriesToRubric([removedLevel], rubric);
        expect(remapped.clearedCount).toBe(1);
        expect(remapped.entries[0].checkedSubItems).toEqual(['b1']);
    });
});

describe('splitIntoSubItemLabels', () => {
    it('splits lines and strips bullets, checkboxes and numbering', () => {
        const pasted = [
            '☐ De teksten bevatten meer dan 8 spelfouten.',
            '',
            '• Heeft minimaal 5-8 woorden gebruikt.',
            '  2. Numbered line',
            'a) Lettered line',
            '- dash line',
            'Plain line',
        ].join('\r\n');
        expect(splitIntoSubItemLabels(pasted)).toEqual([
            'De teksten bevatten meer dan 8 spelfouten.',
            'Heeft minimaal 5-8 woorden gebruikt.',
            'Numbered line',
            'Lettered line',
            'dash line',
            'Plain line',
        ]);
    });

    it('leaves text that merely starts with a number or letter alone', () => {
        expect(stripListMarker('5 verplichte onderwerpen')).toBe('5 verplichte onderwerpen');
        expect(stripListMarker('A clear introduction')).toBe('A clear introduction');
    });
});
