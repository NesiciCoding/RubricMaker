import { describe, expect, it } from 'vitest';
import {
    recomputeSectionPath,
    scoreSectionPct,
    type RoutableQuestion,
    type RoutableTest,
} from '../../supabase/functions/_shared/placementRouting.ts';
import {
    computeStaircaseState,
    replayStaircaseLevels,
    updateItemElo,
} from '../../supabase/functions/_shared/placementStaircase.ts';
import { seededShuffle } from '../../supabase/functions/_shared/seededShuffle.ts';

// Golden values for the shared placement logic. The same functions drive the student's client-side
// routing/staircase, submit-test's forged-path rejection and next-placement-question's live run,
// so a change here changes all three — update a fixture only when the rule itself is meant to change.

const mc = (id: string, sectionId?: string, points = 1): RoutableQuestion => ({
    id,
    sectionId,
    type: 'multiple-choice',
    points,
    prompt: '',
    options: [
        { id: 'right', isCorrect: true },
        { id: 'wrong', isCorrect: false },
    ],
});

const routedTest: RoutableTest = {
    sections: [
        { id: 's1', routing: { thresholdPct: 50, passSectionId: 's2', failSectionId: 's3' } },
        { id: 's2', routing: { thresholdPct: 100, passSectionId: 's4', failSectionId: 's1' } },
        { id: 's3' },
        { id: 's4' },
    ],
    questions: [
        mc('q1', 's1'),
        mc('q2'),
        { id: 'essay', sectionId: 's1', type: 'open', points: 10, prompt: '' },
        mc('q3', 's2'),
        mc('q4', 's3'),
    ],
};

describe('MST routing replay', () => {
    it('scores a section over auto-scorable questions only, with unsectioned questions in the entry section', () => {
        expect(scoreSectionPct(routedTest, 's1', [{ questionId: 'q1', response: 'right' }])).toBe(50);
    });

    it('takes the pass edge at the threshold', () => {
        expect(recomputeSectionPath(routedTest, [{ questionId: 'q1', response: 'right' }])).toEqual(['s1', 's2']);
    });

    it('takes the fail edge below the threshold', () => {
        expect(recomputeSectionPath(routedTest, [{ questionId: 'q1', response: 'wrong' }])).toEqual(['s1', 's3']);
    });

    it('follows chained routing and never revisits a section', () => {
        const answers = [
            { questionId: 'q1', response: 'right' },
            { questionId: 'q3', response: 'right' },
        ];
        expect(recomputeSectionPath(routedTest, answers)).toEqual(['s1', 's2', 's4']);
        const failS2 = [
            { questionId: 'q1', response: 'right' },
            { questionId: 'q3', response: 'wrong' },
        ];
        expect(recomputeSectionPath(routedTest, failS2)).toEqual(['s1', 's2']);
    });

    it('has no path without sections', () => {
        expect(recomputeSectionPath({ questions: [mc('q1')] }, [])).toBeNull();
    });
});

describe('staircase ladder', () => {
    const flags = (s: string) => [...s].map((c) => c === 'T');

    it('steps up after two correct and down after one miss', () => {
        expect(replayStaircaseLevels(flags('TTTTFF'))).toEqual({
            levelBeforeStep: ['A2', 'A2', 'B1', 'B1', 'B2', 'B1'],
            askedAfterConverged: false,
        });
        expect(computeStaircaseState(flags('TTTTFF').map((correct) => ({ correct })))).toMatchObject({
            level: 'A2',
            reversalCount: 1,
            converged: false,
        });
    });

    it('ignores clamped moves for reversals and converges after two reversals', () => {
        expect(computeStaircaseState(flags('FFTTF').map((correct) => ({ correct })))).toMatchObject({
            level: 'A1',
            reversalCount: 2,
            converged: true,
        });
    });

    it('flags a step asked after convergence', () => {
        expect(replayStaircaseLevels(flags('FFTTFT'))).toEqual({
            levelBeforeStep: ['A2', 'A1', 'A1', 'A1', 'A2', 'A1'],
            askedAfterConverged: true,
        });
    });

    it('converges at the question cap', () => {
        expect(replayStaircaseLevels(flags('TFTFTFTFTFTFT')).askedAfterConverged).toBe(true);
    });

    it('applies a teacher override before the answer, within the generator range', () => {
        const steps = [{ correct: true }, { correct: true }, { correct: false, overridden: 'down' as const }];
        expect(
            computeStaircaseState(steps, {
                minLevel: 'B1',
                maxLevel: 'C1',
                startLevel: 'B2',
                convergeAfterReversals: 3,
            })
        ).toMatchObject({ level: 'B1', reversalCount: 1, converged: false });
    });
});

describe('Elo item update', () => {
    it('lowers an item beaten by its level anchor and raises one that was missed', () => {
        expect(updateItemElo(1200, 1200, true)).toBeCloseTo(1188, 10);
        expect(updateItemElo(1200, 1200, false)).toBeCloseTo(1212, 10);
    });
});

describe('seededShuffle', () => {
    it('is stable for a given seed (saved drafts depend on it)', () => {
        expect(seededShuffle(['a', 'b', 'c', 'd', 'e', 'f'], 'CODE-A2')).toEqual(['e', 'd', 'b', 'f', 'c', 'a']);
        expect(seededShuffle([1, 2, 3, 4, 5], '')).toEqual([4, 5, 2, 3, 1]);
        expect(seededShuffle(['x', 'y', 'z'], 'student-42')).toEqual(['y', 'z', 'x']);
    });
});
