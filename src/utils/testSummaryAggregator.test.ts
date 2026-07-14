import { describe, it, expect } from 'vitest';
import {
    calcQuestionBreakdowns,
    calcSkillBreakdowns,
    calcTestStrongWeakSummary,
    mergeTestStrongWeakSummaries,
    bucketForAccuracy,
    calcTestItemAnalysis,
} from './testSummaryAggregator';
import type { Test, StudentTest, TestQuestion } from '../types';

const mcQuestion: TestQuestion = {
    id: 'q-mc',
    prompt: 'Pick the correct option',
    type: 'multiple-choice',
    points: 4,
    options: [
        { id: 'a', text: 'Wrong', isCorrect: false },
        { id: 'b', text: 'Right', isCorrect: true },
    ],
    linkedStandards: [
        {
            guid: 'std-1',
            statementNotation: 'CCSS.A.1',
            description: 'Standard A1',
            standardSetTitle: 'CCSS',
            jurisdictionTitle: 'US',
        },
    ],
};

const saQuestion: TestQuestion = {
    id: 'q-sa',
    prompt: 'Capital of France?',
    type: 'short-answer',
    points: 2,
    expectedAnswer: 'Paris',
    linkedStandards: [
        {
            guid: 'std-1',
            statementNotation: 'CCSS.A.1',
            description: 'Standard A1',
            standardSetTitle: 'CCSS',
            jurisdictionTitle: 'US',
        },
    ],
};

const unlinkedQuestion: TestQuestion = {
    id: 'q-open',
    prompt: 'Explain your reasoning',
    type: 'open',
    points: 6,
};

const makeTest = (overrides: Partial<Test> = {}): Test => ({
    id: 't1',
    name: 'Unit test',
    questions: [mcQuestion, saQuestion, unlinkedQuestion],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

const makeStudentTest = (overrides: Partial<StudentTest> = {}): StudentTest => ({
    id: 'st1',
    testId: 't1',
    studentId: 's1',
    answers: [],
    status: 'submitted',
    startedAt: '2026-01-01T09:00:00.000Z',
    ...overrides,
});

describe('bucketForAccuracy', () => {
    it('matches the gradeColor thresholds from periodReportExport', () => {
        expect(bucketForAccuracy(75)).toBe('strong');
        expect(bucketForAccuracy(74.9)).toBe('developing');
        expect(bucketForAccuracy(55)).toBe('developing');
        expect(bucketForAccuracy(54.9)).toBe('weak');
    });
});

describe('calcQuestionBreakdowns — single student', () => {
    it('reports 100% for a correct answer and 0% for an incorrect one', () => {
        const test = makeTest();
        const studentTests = [
            makeStudentTest({
                answers: [
                    { questionId: 'q-mc', response: 'b' },
                    { questionId: 'q-sa', response: 'London' },
                ],
            }),
        ];
        const breakdowns = calcQuestionBreakdowns('s1', studentTests, test);

        const mc = breakdowns.find((b) => b.questionId === 'q-mc');
        const sa = breakdowns.find((b) => b.questionId === 'q-sa');

        expect(mc?.accuracyPct).toBe(100);
        expect(mc?.bucket).toBe('strong');
        expect(sa?.accuracyPct).toBe(0);
        expect(sa?.bucket).toBe('weak');
    });

    it('returns 0 samples for a question the student never answered', () => {
        const test = makeTest();
        const studentTests = [makeStudentTest({ answers: [] })];
        const breakdowns = calcQuestionBreakdowns('s1', studentTests, test);
        expect(breakdowns.every((b) => b.sampleSize === 0 && b.accuracyPct === 0)).toBe(true);
    });
});

describe('calcQuestionBreakdowns — cohort mode', () => {
    it('aggregates accuracy across all students when studentId is null', () => {
        const test = makeTest();
        const studentTests = [
            makeStudentTest({ id: 'st1', studentId: 's1', answers: [{ questionId: 'q-mc', response: 'b' }] }),
            makeStudentTest({ id: 'st2', studentId: 's2', answers: [{ questionId: 'q-mc', response: 'a' }] }),
        ];
        const breakdowns = calcQuestionBreakdowns(null, studentTests, test);
        const mc = breakdowns.find((b) => b.questionId === 'q-mc');

        expect(mc?.sampleSize).toBe(2);
        expect(mc?.accuracyPct).toBe(50);
        expect(mc?.bucket).toBe('weak');
    });

    it('ignores StudentTest rows for a different test', () => {
        const test = makeTest();
        const studentTests = [
            makeStudentTest({ id: 'st1', studentId: 's1', answers: [{ questionId: 'q-mc', response: 'b' }] }),
            makeStudentTest({
                id: 'st2',
                testId: 'other-test',
                studentId: 's2',
                answers: [{ questionId: 'q-mc', response: 'a' }],
            }),
        ];
        const breakdowns = calcQuestionBreakdowns(null, studentTests, test);
        const mc = breakdowns.find((b) => b.questionId === 'q-mc');
        expect(mc?.sampleSize).toBe(1);
        expect(mc?.accuracyPct).toBe(100);
    });
});

describe('calcSkillBreakdowns', () => {
    it('rolls up accuracy per linked standard across grouped questions', () => {
        const test = makeTest();
        const studentTests = [
            makeStudentTest({
                answers: [
                    { questionId: 'q-mc', response: 'b' },
                    { questionId: 'q-sa', response: 'Paris' },
                ],
            }),
        ];
        const skills = calcSkillBreakdowns('s1', studentTests, test);
        expect(skills).toHaveLength(1);
        expect(skills[0].groupId).toBe('std-1');
        expect(skills[0].questionIds).toEqual(['q-mc', 'q-sa']);
        expect(skills[0].accuracyPct).toBe(100);
        expect(skills[0].bucket).toBe('strong');
    });

    it('excludes questions with no linked standard or CEFR descriptor from the rollup', () => {
        const test = makeTest();
        const studentTests = [makeStudentTest({ answers: [{ questionId: 'q-open', response: 'anything' }] })];
        const skills = calcSkillBreakdowns('s1', studentTests, test);
        expect(skills.some((s) => s.questionIds.includes('q-open'))).toBe(false);
    });

    it('produces a tie when two groups have identical accuracy', () => {
        const tieTest = makeTest({
            questions: [
                { ...mcQuestion, id: 'q-a', linkedStandards: [{ ...mcQuestion.linkedStandards![0], guid: 'std-a' }] },
                { ...mcQuestion, id: 'q-b', linkedStandards: [{ ...mcQuestion.linkedStandards![0], guid: 'std-b' }] },
            ],
        });
        const studentTests = [
            makeStudentTest({
                answers: [
                    { questionId: 'q-a', response: 'b' },
                    { questionId: 'q-b', response: 'b' },
                ],
            }),
        ];
        const skills = calcSkillBreakdowns('s1', studentTests, tieTest);
        expect(skills).toHaveLength(2);
        expect(skills[0].accuracyPct).toBe(skills[1].accuracyPct);
        expect(skills[0].bucket).toBe(skills[1].bucket);
    });

    it('groups by CEFR descriptor when a question has one instead of a standard', () => {
        const cefrQuestion: TestQuestion = {
            id: 'q-cefr',
            prompt: 'Listening task',
            type: 'multiple-choice',
            points: 2,
            options: [
                { id: 'x', text: 'Wrong', isCorrect: false },
                { id: 'y', text: 'Right', isCorrect: true },
            ],
            linkedCefrDescriptors: [
                {
                    descriptorId: 'cefr-1',
                    level: 'B1',
                    skill: 'listening',
                    descriptionEn: 'Can understand routine info',
                    descriptionNl: 'Kan routine-info begrijpen',
                },
            ],
        };
        const test = makeTest({ questions: [cefrQuestion] });
        const studentTests = [makeStudentTest({ answers: [{ questionId: 'q-cefr', response: 'y' }] })];
        const skills = calcSkillBreakdowns('s1', studentTests, test);
        expect(skills).toHaveLength(1);
        expect(skills[0].groupId).toBe('cefr-1');
        expect(skills[0].label).toBe('Can understand routine info');
    });
});

describe('calcTestStrongWeakSummary', () => {
    it('combines question and skill breakdowns under the requested studentId', () => {
        const test = makeTest();
        const studentTests = [makeStudentTest({ answers: [{ questionId: 'q-mc', response: 'b' }] })];
        const summary = calcTestStrongWeakSummary('s1', studentTests, test);
        expect(summary.studentId).toBe('s1');
        expect(summary.questions).toHaveLength(3);
        expect(summary.skills.length).toBeGreaterThan(0);
    });

    it('uses studentId null for cohort-wide summaries', () => {
        const test = makeTest();
        const studentTests = [
            makeStudentTest({ id: 'st1', studentId: 's1', answers: [{ questionId: 'q-mc', response: 'b' }] }),
            makeStudentTest({ id: 'st2', studentId: 's2', answers: [{ questionId: 'q-mc', response: 'a' }] }),
        ];
        const summary = calcTestStrongWeakSummary(null, studentTests, test);
        expect(summary.studentId).toBeNull();
        const mc = summary.questions.find((q) => q.questionId === 'q-mc');
        expect(mc?.sampleSize).toBe(2);
    });
});

describe('mergeTestStrongWeakSummaries', () => {
    it('returns an empty summary for no inputs', () => {
        expect(mergeTestStrongWeakSummaries([])).toEqual({ studentId: null, questions: [], skills: [] });
    });

    it('concatenates questions and weight-averages skill accuracy across tests', () => {
        const a = {
            studentId: 's1',
            questions: [{ questionId: 'q1', accuracyPct: 100, bucket: 'strong' as const, sampleSize: 1 }],
            skills: [
                {
                    groupId: 'std-1',
                    label: 'Standard A1',
                    questionIds: ['q1'],
                    accuracyPct: 100,
                    bucket: 'strong' as const,
                    sampleSize: 1,
                },
            ],
        };
        const b = {
            studentId: 's1',
            questions: [{ questionId: 'q2', accuracyPct: 0, bucket: 'weak' as const, sampleSize: 1 }],
            skills: [
                {
                    groupId: 'std-1',
                    label: 'Standard A1',
                    questionIds: ['q2'],
                    accuracyPct: 0,
                    bucket: 'weak' as const,
                    sampleSize: 1,
                },
            ],
        };

        const merged = mergeTestStrongWeakSummaries([a, b]);
        expect(merged.studentId).toBe('s1');
        expect(merged.questions).toHaveLength(2);
        expect(merged.skills).toHaveLength(1);
        expect(merged.skills[0].accuracyPct).toBe(50);
        expect(merged.skills[0].bucket).toBe('weak');
        expect(merged.skills[0].sampleSize).toBe(2);
        expect(merged.skills[0].questionIds).toEqual(['q1', 'q2']);
    });
});

describe('calcTestItemAnalysis', () => {
    const q: TestQuestion = {
        id: 'q1',
        prompt: 'Pick one',
        type: 'multiple-choice',
        points: 4,
        options: [
            { id: 'a', text: 'Distractor A', isCorrect: false },
            { id: 'b', text: 'Right', isCorrect: true },
            { id: 'c', text: 'Distractor C', isCorrect: false },
        ],
    };
    const test: Test = {
        id: 't1',
        name: 'Item analysis test',
        questions: [q],
        requireSEB: false,
        shuffleQuestions: false,
        createdAt: '2026-01-01T00:00:00.000Z',
    };

    function submission(id: string, response: string, rawTotalPoints: number): StudentTest {
        return {
            id: `st-${id}`,
            testId: 't1',
            studentId: id,
            answers: [{ questionId: 'q1', response }],
            status: 'submitted',
            startedAt: '2026-01-01T09:00:00.000Z',
            rawTotalPoints,
        };
    }

    it('returns sampleSize 0, null discrimination, and no distractor for a question nobody answered', () => {
        const [row] = calcTestItemAnalysis([], test);
        expect(row).toEqual({ questionId: 'q1', sampleSize: 0, discrimination: null, topDistractor: null });
    });

    it('returns null discrimination when the class is too small to split reliably', () => {
        const studentTests = [submission('s1', 'b', 4), submission('s2', 'a', 0)];
        const [row] = calcTestItemAnalysis(studentTests, test);
        expect(row.discrimination).toBeNull();
        expect(row.sampleSize).toBe(2);
    });

    it('computes a positive discrimination index when high scorers get the item right more often', () => {
        // 8 students: top 2 (by total score) answer correctly, bottom 2 answer wrong (option a).
        const studentTests = [
            submission('top1', 'b', 20),
            submission('top2', 'b', 19),
            submission('mid1', 'b', 15),
            submission('mid2', 'a', 14),
            submission('mid3', 'b', 12),
            submission('mid4', 'a', 11),
            submission('bot1', 'a', 3),
            submission('bot2', 'a', 2),
        ];
        const [row] = calcTestItemAnalysis(studentTests, test);
        expect(row.sampleSize).toBe(8);
        expect(row.discrimination).not.toBeNull();
        expect(row.discrimination!).toBeGreaterThan(0);
    });

    it('identifies the most commonly chosen wrong option as the top distractor', () => {
        const studentTests = [
            submission('s1', 'a', 4),
            submission('s2', 'a', 4),
            submission('s3', 'a', 4),
            submission('s4', 'c', 4),
            submission('s5', 'b', 4),
        ];
        const [row] = calcTestItemAnalysis(studentTests, test);
        expect(row.topDistractor).toEqual({ optionId: 'a', text: 'Distractor A', count: 3, isCorrect: false });
    });

    it('ignores submissions with no answers and submissions for other tests', () => {
        const studentTests: StudentTest[] = [
            {
                id: 'empty',
                testId: 't1',
                studentId: 's1',
                answers: [],
                status: 'in_progress',
                startedAt: '2026-01-01T00:00:00.000Z',
            },
            submission('s2', 'a', 4),
            { ...submission('s3', 'b', 4), testId: 'other' },
        ];
        const [row] = calcTestItemAnalysis(studentTests, test);
        expect(row.sampleSize).toBe(1);
    });
});
