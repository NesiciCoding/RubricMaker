import { describe, expect, it } from 'vitest';
import type { Rubric, ScoreEntry } from '../types';
import { blankRubricEntries, rubricAnswerPoints, rubricTaskPercentage } from './rubricTaskScoring';

const level = (id: string, min: number, max: number) => ({
    id,
    label: id,
    minPoints: min,
    maxPoints: max,
    description: '',
    subItems: [],
});

const rubric = {
    id: 'r1',
    name: 'Writing',
    criteria: [
        { id: 'c1', title: 'Content', description: '', weight: 50, levels: [level('c1hi', 4, 4), level('c1lo', 1, 1)] },
        {
            id: 'c2',
            title: 'Language',
            description: '',
            weight: 50,
            levels: [level('c2hi', 4, 4), level('c2lo', 1, 1)],
        },
    ],
    scoringMode: 'weighted-percentage',
    totalMaxPoints: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as Rubric;

const entry = (criterionId: string, levelId: string | null, extra: Partial<ScoreEntry> = {}): ScoreEntry => ({
    criterionId,
    levelId,
    checkedSubItems: [],
    comment: '',
    ...extra,
});

describe('rubric task scoring', () => {
    it('starts with one blank entry per criterion', () => {
        expect(blankRubricEntries(rubric).map((e) => [e.criterionId, e.levelId])).toEqual([
            ['c1', null],
            ['c2', null],
        ]);
    });

    it('maps the rubric percentage onto the question points', () => {
        const entries = [entry('c1', 'c1hi'), entry('c2', 'c2lo')];
        expect(rubricTaskPercentage(rubric, entries)).toBeCloseTo(62.5, 5);
        expect(rubricAnswerPoints(rubric, entries, 8)).toBe(5);
        expect(rubricAnswerPoints(rubric, [entry('c1', 'c1hi'), entry('c2', 'c2hi')], 3)).toBe(3);
    });

    it('honours override points and scores nothing until criteria are graded', () => {
        expect(rubricAnswerPoints(rubric, [entry('c1', null, { overridePoints: 4 }), entry('c2', 'c2hi')], 10)).toBe(
            10
        );
        expect(rubricAnswerPoints(rubric, blankRubricEntries(rubric), 10)).toBe(0);
    });

    it('rounds to two decimals and stays within the question points', () => {
        expect(rubricAnswerPoints(rubric, [entry('c1', 'c1hi'), entry('c2', 'c2lo')], 1)).toBe(0.63);
        expect(rubricAnswerPoints(rubric, [entry('c1', 'c1hi'), entry('c2', 'c2hi')], 0)).toBe(0);
    });
});
