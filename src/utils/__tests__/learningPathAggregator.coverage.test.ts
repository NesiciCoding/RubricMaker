import { describe, it, expect } from 'vitest';
import {
    getLearningPathRecommendations,
    buildCohortAverages,
    getCriterionInterventionFlags,
    getCefrSkillInterventionFlags,
    getGrammarRecommendations,
    DEFAULT_LEARNING_PATH_CONFIG,
} from '../learningPathAggregator';
import type { Rubric, StudentRubric, StudentTest, Test, FlashcardDeck } from '../../types';
import type { CefrCellData } from '../cefrStudentAggregator';

function level(id: string, maxPoints: number) {
    return { id, label: id, minPoints: 0, maxPoints, description: '', subItems: [] };
}

function criterion(id: string, maxPoints: number, frameworkDescriptors?: unknown[]) {
    return {
        id,
        title: id,
        description: '',
        weight: 50,
        levels: [level(`${id}-l`, maxPoints)],
        ...(frameworkDescriptors ? { frameworkDescriptors } : {}),
    } as Rubric['criteria'][number];
}

function rubric(id: string, criteria: Rubric['criteria'], opts: Partial<Rubric> = {}) {
    return {
        id,
        name: id,
        subject: '',
        description: '',
        criteria,
        gradeScaleId: 'gs',
        format: {} as Rubric['format'],
        attachmentIds: [],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        totalMaxPoints: 100,
        scoringMode: 'weighted-percentage',
        ...opts,
    } as Rubric;
}

function studentRubric(
    id: string,
    studentId: string,
    rubricId: string,
    gradedAt: string | undefined,
    entries: StudentRubric['entries'],
    rubricSnapshot?: Rubric
) {
    return {
        id,
        studentId,
        rubricId,
        entries,
        ...(gradedAt ? { gradedAt } : {}),
        ...(rubricSnapshot ? { rubricSnapshot } : {}),
    } as StudentRubric;
}

function entry(criterionId: string, overridePoints: number): StudentRubric['entries'][number] {
    return {
        criterionId,
        levelId: null,
        overridePoints,
        checkedSubItems: [],
        comment: '',
    } as StudentRubric['entries'][number];
}

function cell(
    skill: CefrCellData['skill'],
    level: CefrCellData['level'],
    rubricCount: number,
    avgScore: number
): CefrCellData {
    return {
        skill,
        level,
        rubricCount,
        avgScore,
        threshold: 70,
        rubricAchieved: false,
        evidence: [],
        state: 'not-started',
        descriptors: [],
        totalDescriptors: 0,
        confidentCount: 0,
        confidenceRate: 0,
    };
}

const grammarDesc = (descriptorId: string) => ({
    descriptorId,
    framework: 'grammar',
    categoryId: 'g',
    categoryLabelEn: 'Grammar',
    categoryLabelNl: 'Grammatica',
    categoryColor: '#fff',
    descriptionEn: 'Uses past tense',
    descriptionNl: 'Gebruikt verleden tijd',
});

const DEFAULT = DEFAULT_LEARNING_PATH_CONFIG;

describe('learningPathAggregator coverage', () => {
    it('ranks cohort-gap recommendations across all rubric filters', () => {
        const cells: CefrCellData[] = [
            cell('writing', 'B1', 2, 50), // gap -30 → recommended
            cell('reading', 'B1', 0, 70), // rubricCount 0 → skipped
            cell('speaking_production', 'A2', 1, 70), // gap -10 → within threshold → skipped
            cell('listening', 'A1', 1, 40), // no cohort entry → skipped
            cell('writing', 'A1', 1, 20), // gap -45 → recommended, no matching rubrics
        ];
        const cohort = new Map([
            ['writing__B1', 80],
            ['speaking__A2', 80],
            ['writing__A1', 65],
        ]);
        const rubrics: Rubric[] = [
            rubric('r1', [criterion('c1', 10)], { cefrSkill: 'writing', cefrTargetLevel: 'B1' }),
            rubric('r2', [criterion('c1', 10)], { cefrSkill: 'writing', cefrTargetLevel: 'B1' }),
            rubric('r3', [criterion('c1', 10)], { cefrTargetLevel: 'B1' }), // skill fallback 'writing'
            rubric('r4', [criterion('c1', 10)], { cefrSkill: 'writing', cefrTargetLevel: 'C1' }),
            rubric('r5', [criterion('c1', 10)], { cefrSkill: 'reading', cefrTargetLevel: 'B1' }),
        ];
        const achieved = new Set(['r2']);

        const recs = getLearningPathRecommendations('s1', cells, cohort, rubrics, achieved);

        expect(recs).toHaveLength(2);
        // sorted by gap ascending — writing__A1 gap -45 first
        expect(recs[0].level).toBe('A1');
        expect(recs[0].gap).toBe(-45);
        expect(recs[0].suggestedRubricIds).toEqual([]);
        expect(recs[1].level).toBe('B1');
        expect(recs[1].gap).toBe(-30);
        expect(recs[1].studentScore).toBe(50);
        expect(recs[1].cohortAverage).toBe(80);
        expect(recs[1].suggestedRubricIds).toEqual(['r1', 'r3']);

        // custom config — threshold 50 suppresses both gaps
        const suppressed = getLearningPathRecommendations('s1', cells, cohort, rubrics, achieved, {
            ...DEFAULT,
            cohortGapThreshold: 50,
        });
        expect(suppressed).toEqual([]);
    });

    it('averages cohort cells and skips empty cells', () => {
        const averages = buildCohortAverages([
            [cell('writing', 'B1', 2, 60), cell('reading', 'B1', 1, 80)],
            [cell('writing', 'B1', 1, 40), cell('speaking_production', 'A1', 0, 99)],
        ]);
        expect(averages.get('writing__B1')).toBe(50);
        expect(averages.get('reading__B1')).toBe(80);
        expect(averages.has('speaking__A1')).toBe(false);
    });

    it('detects criterion intervention streaks across snapshots and skips unscorable entries', () => {
        const rc1 = rubric('rc1', [criterion('cA', 10)]);
        const rc2 = rubric('rc2', [criterion('cB', 0)]);
        const rc3 = rubric('rc3', [criterion('cC', 10)]);
        const rubrics = [rc1, rc2, rc3];

        const srs: StudentRubric[] = [
            studentRubric('sr1', 's1', 'rc1', '2025-01-01T00:00:00Z', [entry('cA', 4)]), // 40%
            studentRubric('sr2', 's1', 'rc1', '2025-01-02T00:00:00Z', [entry('cA', 9)]), // 90% — breaks streak
            studentRubric('sr3', 's1', 'rc1', '2025-01-03T00:00:00Z', [entry('cA', 5)]), // 50%
            studentRubric('sr4', 's1', 'rc1', '2025-01-04T00:00:00Z', [entry('cA', 3)]), // 30%
            studentRubric('sr5', 's1', 'rc1', '2025-01-05T00:00:00Z', [entry('cA', 2)]), // 20%
            studentRubric('srBad', 's1', 'rc1', '2025-01-06T00:00:00Z', [entry('nope', 2)]), // unknown criterion
            studentRubric('srZero', 's1', 'rc2', '2025-01-07T00:00:00Z', [entry('cB', 2)]), // maxPoints 0
            studentRubric('srNoRubric', 's1', 'missing', '2025-01-08T00:00:00Z', [entry('cA', 2)]), // no rubric
            studentRubric('srOther', 's2', 'rc1', '2025-01-09T00:00:00Z', [entry('cA', 2)]), // other student
            studentRubric('srNoGrade', 's1', 'rc1', undefined, [entry('cA', 2)]), // no gradedAt
            studentRubric('srSnap', 's1', 'whatever', '2025-01-10T00:00:00Z', [entry('cC', 3)], rc3), // snapshot path, single low
        ];

        const flags = getCriterionInterventionFlags('s1', srs, rubrics);

        expect(flags).toHaveLength(1);
        expect(flags[0]).toEqual({
            studentId: 's1',
            kind: 'criterion',
            targetId: 'cA',
            streakLength: 3,
            scores: [50, 30, 20],
            triggeredAt: '2025-01-05T00:00:00Z',
        });
    });

    it('detects CEFR-skill streaks with skill fallback and unscorable skips', () => {
        const rcA = rubric('rcA', [criterion('cA', 10)], { cefrSkill: 'writing', cefrTargetLevel: 'B1' });
        const rcB = rubric('rcB', [criterion('cB', 10)], { cefrTargetLevel: 'B2' }); // skill fallback 'writing'
        const rcC = rubric('rcC', [criterion('cC', 10)], { cefrSkill: 'reading' }); // no target level
        const rcD = rubric('rcD', [criterion('cD', 0)], { cefrSkill: 'speaking_production', cefrTargetLevel: 'A2' }); // maxPoints 0
        const rcE = rubric('rcE', [criterion('cE', 10)], { cefrSkill: 'reading', cefrTargetLevel: 'A1' });
        const rubrics = [rcA, rcB, rcC, rcD, rcE];

        const srs: StudentRubric[] = [
            studentRubric('s1', 's1', 'rcA', '2025-01-01T00:00:00Z', [entry('cA', 4)]), // 40%
            studentRubric('s2', 's1', 'rcA', '2025-01-02T00:00:00Z', [entry('cA', 9)]), // 90% — break
            studentRubric('s3', 's1', 'rcA', '2025-01-03T00:00:00Z', [entry('cA', 5)]), // 50%
            studentRubric('s4', 's1', 'rcA', '2025-01-04T00:00:00Z', [entry('cA', 3)]), // 30%
            studentRubric('s5', 's1', 'rcA', '2025-01-05T00:00:00Z', [entry('cA', 2)]), // 20%
            studentRubric('s6', 's1', 'rcB', '2025-01-06T00:00:00Z', [entry('cB', 4)]), // 40% — extends writing streak
            studentRubric('s7', 's1', 'rcC', '2025-01-07T00:00:00Z', [entry('cC', 2)]), // no target → skip
            studentRubric('s8', 's1', 'rcD', '2025-01-08T00:00:00Z', [entry('cD', 2)]), // maxPoints 0 → skip
            studentRubric('s9', 's1', 'rcE', '2025-01-09T00:00:00Z', [entry('nope', 2)]), // unknown criterion → earned 0
        ];

        const flags = getCefrSkillInterventionFlags('s1', srs, rubrics);

        expect(flags).toHaveLength(1);
        expect(flags[0]).toEqual({
            studentId: 's1',
            kind: 'cefrSkill',
            targetId: 'writing',
            streakLength: 4,
            scores: [50, 30, 20, 40],
            triggeredAt: '2025-01-06T00:00:00Z',
        });
    });

    it('builds grammar recommendations from rubric descriptors and test questions with deck/test indexing', () => {
        const rc1 = rubric('rc1', [
            criterion('cG1', 10, [grammarDesc('g1')]),
            criterion('cG2', 10, [grammarDesc('g2')]),
            criterion('cG3', 10, [{ ...grammarDesc('g3'), framework: 'ib' }]), // no grammar framework
            criterion('cG4', 0, [grammarDesc('g4')]), // maxPoints 0
        ]);

        const srs: StudentRubric[] = [
            studentRubric('g1a', 's1', 'rc1', '2025-01-01T00:00:00Z', [entry('cG1', 4)]), // g1 40%
            studentRubric('g1b', 's1', 'rc1', '2025-01-02T00:00:00Z', [entry('cG1', 5)]), // 50%
            studentRubric('g1c', 's1', 'rc1', '2025-01-03T00:00:00Z', [entry('cG1', 3)]), // 30%
            studentRubric('g1d', 's1', 'rc1', '2025-01-04T00:00:00Z', [entry('cG1', 9)]), // 90% — break → flush [40,50,30]
            studentRubric('g1e', 's1', 'rc1', '2025-01-05T00:00:00Z', [entry('cG1', 2)]), // 20%
            studentRubric('g1f', 's1', 'rc1', '2025-01-06T00:00:00Z', [entry('cG1', 1)]), // 10%
            studentRubric('g1g', 's1', 'rc1', '2025-01-07T00:00:00Z', [entry('cG1', 1)]), // 10% → trailing flush [20,10,10]
            studentRubric('g2a', 's1', 'rc1', '2025-01-08T00:00:00Z', [entry('cG2', 3)]), // g2 single low
            studentRubric('g3a', 's1', 'rc1', '2025-01-09T00:00:00Z', [entry('cG3', 2)]), // ib framework → skip
            studentRubric('g4a', 's1', 'rc1', '2025-01-10T00:00:00Z', [entry('cG4', 2)]), // maxPoints 0 → skip
            studentRubric('gNoCriterion', 's1', 'rc1', '2025-01-11T00:00:00Z', [entry('nope', 2)]), // unknown criterion
            studentRubric('gNoRubric', 's1', 'missingR', '2025-01-12T00:00:00Z', [entry('cG1', 2)]), // no rubric
        ];

        const q1 = {
            id: 'q1',
            prompt: 'p',
            type: 'short-answer',
            points: 4,
            linkedGrammarItemId: 'gq1',
        } as Test['questions'][number];
        const t1 = {
            id: 't1',
            name: 'grammar practice',
            mode: 'practice',
            contentArea: 'grammar',
            questions: [q1],
        } as Test;
        const t2 = {
            id: 't2',
            name: 'mc',
            mode: 'practice',
            contentArea: 'grammar',
            questions: [
                {
                    id: 'q2',
                    prompt: 'p',
                    type: 'multiple-choice',
                    points: 4,
                    linkedGrammarItemId: 'gq2',
                    options: [
                        { id: 'optA', text: 'A', isCorrect: true },
                        { id: 'optB', text: 'B', isCorrect: false },
                    ],
                } as Test['questions'][number],
            ],
        } as Test;
        const t4 = {
            id: 't4',
            name: 'no answer',
            mode: 'practice',
            contentArea: 'grammar',
            questions: [{ ...q1, id: 'q4', linkedGrammarItemId: 'gq4' }],
        } as Test;
        const t5 = {
            id: 't5',
            name: 'skipped',
            mode: 'practice',
            contentArea: 'grammar',
            questions: [
                { ...q1, id: 'qNoLink', linkedGrammarItemId: undefined as string | undefined },
                { ...q1, id: 'qZero', points: 0, linkedGrammarItemId: 'gq5' },
            ],
        } as Test;
        const t6 = {
            id: 't6',
            name: 'exam mode',
            mode: 'assessment',
            contentArea: 'grammar',
            questions: [{ ...q1, id: 'q6' }],
        } as Test;
        const t7 = {
            id: 't7',
            name: 'reading practice',
            mode: 'practice',
            contentArea: 'reading',
            questions: [{ ...q1, id: 'q7' }],
        } as Test;
        const tests = [t1, t2, t4, t5, t6, t7];

        const st1 = (id: string, submittedAt: string, pointsEarned: number): StudentTest =>
            ({
                id,
                testId: 't1',
                studentId: 's1',
                status: 'submitted',
                submittedAt,
                startedAt: submittedAt,
                answers: [{ questionId: 'q1', response: 'x', pointsEarned }],
            }) as StudentTest;
        const studentTests: StudentTest[] = [
            st1('st1a', '2025-01-10T00:00:00Z', 2), // 50%
            st1('st1b', '2025-01-11T00:00:00Z', 1), // 25%
            st1('st1c', '2025-01-12T00:00:00Z', 1), // 25% → gq1 streak [50,25,25]
            {
                id: 'st2',
                testId: 't2',
                studentId: 's1',
                status: 'graded',
                startedAt: '2025-01-13T00:00:00Z', // no submittedAt — startedAt fallback
                answers: [{ questionId: 'q2', response: 'optA' }], // auto-scored → 4/4 = 100%
            } as StudentTest,
            {
                id: 'st3',
                testId: 't3',
                studentId: 's1',
                status: 'in_progress',
                startedAt: '2025-01-14T00:00:00Z',
                answers: [],
            } as StudentTest,
            {
                id: 'st4',
                testId: 'missing',
                studentId: 's1',
                status: 'submitted',
                submittedAt: '2025-01-15T00:00:00Z',
                startedAt: '2025-01-15T00:00:00Z',
                answers: [],
            } as StudentTest,
            {
                id: 'st5',
                testId: 't4',
                studentId: 's1',
                status: 'submitted',
                submittedAt: '2025-01-16T00:00:00Z',
                startedAt: '2025-01-16T00:00:00Z',
                answers: [], // no answer for q4
            } as StudentTest,
            {
                id: 'st6',
                testId: 't5',
                studentId: 's1',
                status: 'submitted',
                submittedAt: '2025-01-17T00:00:00Z',
                startedAt: '2025-01-17T00:00:00Z',
                answers: [], // questions skipped: no link / zero points
            } as StudentTest,
        ];

        const decks: FlashcardDeck[] = [
            {
                id: 'd1',
                name: 'grammar deck',
                deckKind: 'grammar',
                cards: [
                    { id: 'c1', front: 'f', back: 'b', linkedGrammarItemId: 'gq1' },
                    { id: 'c2', front: 'f', back: 'b', linkedGrammarItemId: 'gq1' }, // duplicate → seen skip
                    { id: 'c3', front: 'f', back: 'b' }, // no link → skip
                ],
            } as FlashcardDeck,
            {
                id: 'd2',
                name: 'vocab deck',
                deckKind: 'vocabulary',
                cards: [{ id: 'c4', front: 'f', back: 'b', linkedGrammarItemId: 'gq1' }],
            } as FlashcardDeck,
        ];

        const recs = getGrammarRecommendations('s1', srs, [rc1], studentTests, tests, decks);

        // gq1 streak (test-sourced, with deck + test suggestions) sorts first by triggeredAt desc
        expect(recs).toHaveLength(3);
        expect(recs[0].grammarItemId).toBe('gq1');
        expect(recs[0].streakLength).toBe(3);
        expect(recs[0].scores).toEqual([50, 25, 25]);
        expect(recs[0].triggeredAt).toBe('2025-01-12T00:00:00Z');
        expect(recs[0].suggestedGrammarDeckIds).toEqual(['d1']);
        expect(recs[0].suggestedGrammarTestIds).toEqual(['t1']);
        // g1 trailing streak (findStreaks end flush, no matching content → empty suggestions)
        expect(recs[1].grammarItemId).toBe('g1');
        expect(recs[1].streakLength).toBe(3);
        expect(recs[1].scores).toEqual([20, 10, 10]);
        expect(recs[1].triggeredAt).toBe('2025-01-07T00:00:00Z');
        expect(recs[1].suggestedGrammarDeckIds).toEqual([]);
        expect(recs[1].suggestedGrammarTestIds).toEqual([]);
        // g1 interrupt-flush streak (findStreaks else arm)
        expect(recs[2].grammarItemId).toBe('g1');
        expect(recs[2].scores).toEqual([40, 50, 30]);
        expect(recs[2].triggeredAt).toBe('2025-01-03T00:00:00Z');
    });
});
