import { describe, it, expect } from 'vitest';
import {
    GRAMMAR_STANDARD_COUNT,
    getClassGrammarOverview,
    getStudentGrammarOverview,
    getTestGrammarBreakdown,
    grammarBandForClass,
    grammarBandForTrack,
    grammarStatus,
    isLevelInBand,
} from './grammarStandardAggregator';
import { DEFAULT_FORMAT } from '../types';
import type { LinkedFrameworkDescriptor, Rubric, StudentRubric, StudentTest, Test } from '../types';

// Present Simple / A1 and Past Simple / A2 sit in different categories; the B2 item lets the
// level-band tests prove each band is its own window rather than everything below it.
const A1_ITEM = 'gr-present-simple-affirmative';
const A2_ITEM = 'gr-past-simple-irregular';
const B2_ITEM = 'gr-conditional-third';

const emptyDeps = {
    tests: [] as Test[],
    studentTests: [] as StudentTest[],
    rubrics: [] as Rubric[],
    studentRubrics: [] as StudentRubric[],
};

function descriptor(itemId: string, level: LinkedFrameworkDescriptor['level'] = 'A1'): LinkedFrameworkDescriptor {
    return {
        descriptorId: itemId,
        framework: 'grammar',
        categoryId: 'test-category',
        categoryLabelEn: 'Test category',
        categoryLabelNl: 'Testcategorie',
        categoryColor: '#123456',
        descriptionEn: `Description ${itemId}`,
        descriptionNl: `Beschrijving ${itemId}`,
        level,
    };
}

function mkTest(questions: Test['questions'], id = 't1'): Test {
    return {
        id,
        name: 'Grammar test',
        questions,
        requireSEB: false,
        shuffleQuestions: false,
        createdAt: '2026-01-01T00:00:00.000Z',
    };
}

function mkStudentTest(overrides: Partial<StudentTest> & { id: string }): StudentTest {
    return {
        testId: 't1',
        studentId: 's1',
        answers: [],
        status: 'graded',
        startedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function mkRubric(
    links: LinkedFrameworkDescriptor[],
    opts: { id?: string; maxPoints?: number; criterionId?: string } = {}
): Rubric {
    const maxPoints = opts.maxPoints ?? 10;
    return {
        id: opts.id ?? 'r1',
        name: 'Writing task',
        subject: 'English',
        description: '',
        criteria: [
            {
                id: opts.criterionId ?? 'c1',
                title: 'Grammar',
                description: '',
                weight: 100,
                levels: [
                    {
                        id: 'l1',
                        label: 'Good',
                        minPoints: 0,
                        maxPoints,
                        description: '',
                        subItems: [],
                    },
                ],
                frameworkDescriptors: links,
            },
        ],
        gradeScaleId: 'scale',
        format: DEFAULT_FORMAT,
        attachmentIds: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        totalMaxPoints: maxPoints,
        scoringMode: 'weighted-percentage',
    };
}

function mkGradedRubric(rubric: Rubric, overrides: Partial<StudentRubric> & { id: string }): StudentRubric {
    return {
        rubricId: rubric.id,
        studentId: 's1',
        entries: [
            {
                criterionId: rubric.criteria[0].id,
                levelId: 'l1',
                selectedPoints: 8,
                checkedSubItems: [],
                comment: '',
            },
        ],
        overallComment: '',
        gradedAt: '2026-01-10T00:00:00.000Z',
        isPeerReview: false,
        ...overrides,
    };
}

describe('grammar status thresholds', () => {
    it('classifies at the fixed 70/50 bands and reports missing evidence separately', () => {
        expect(grammarStatus(null)).toBe('no-evidence');
        expect(grammarStatus(70)).toBe('secure');
        expect(grammarStatus(69.9)).toBe('developing');
        expect(grammarStatus(50)).toBe('developing');
        expect(grammarStatus(49.9)).toBe('needs-work');
        expect(grammarStatus(0)).toBe('needs-work');
    });
});

describe('level bands', () => {
    it('maps each band to its own CEFR window rather than everything below it', () => {
        expect(isLevelInBand('A1', 'a1a2')).toBe(true);
        expect(isLevelInBand('A2', 'a1a2')).toBe(true);
        expect(isLevelInBand('B1', 'a1a2')).toBe(false);

        expect(isLevelInBand('B1', 'b1')).toBe(true);
        expect(isLevelInBand('A2', 'b1')).toBe(false);
        expect(isLevelInBand('B2', 'b1')).toBe(false);

        expect(isLevelInBand('B2', 'b2plus')).toBe(true);
        expect(isLevelInBand('C1', 'b2plus')).toBe(true);
        expect(isLevelInBand('B1', 'b2plus')).toBe(false);
        expect(isLevelInBand('C1', 'all')).toBe(true);
    });

    it('derives the default band from the VO track target level', () => {
        expect(grammarBandForTrack('vmbo-bb')).toBe('a1a2');
        expect(grammarBandForTrack('vmbo-tl')).toBe('b1');
        expect(grammarBandForTrack('havo')).toBe('b1');
        expect(grammarBandForTrack('vwo')).toBe('b2plus');
        expect(grammarBandForTrack(undefined)).toBe('all');
    });

    it('opens a single-track class on its matching band and a mixed class on all', () => {
        expect(grammarBandForClass(['havo'])).toBe('b1');
        expect(grammarBandForClass(['vwo'])).toBe('b2plus');
        expect(grammarBandForClass(['vmbo-kb', 'vmbo-bb'])).toBe('a1a2');
        expect(grammarBandForClass(['havo', 'vwo'])).toBe('all');
        expect(grammarBandForClass([])).toBe('all');
    });
});

describe('getStudentGrammarOverview', () => {
    it('returns every standard with no evidence when nothing is linked', () => {
        const overview = getStudentGrammarOverview('s1', emptyDeps);

        expect(overview.totalStandardCount).toBe(GRAMMAR_STANDARD_COUNT);
        expect(overview.assessedCount).toBe(0);
        expect(overview.combinedPct).toBeNull();
        expect(overview.categories.length).toBeGreaterThan(10);
        expect(overview.categories.every((category) => category.status === 'no-evidence')).toBe(true);
        expect(overview.standards.every((row) => row.combinedPct === null)).toBe(true);
    });

    it('scores test evidence from fully-correct linked questions across attempts', () => {
        const test = mkTest([
            { id: 'q1', prompt: 'She ___ here.', type: 'cloze', points: 1, linkedGrammarItemId: A1_ITEM },
        ]);
        const studentTests = [
            mkStudentTest({
                id: 'st1',
                answers: [{ questionId: 'q1', response: '', pointsEarned: 1 }],
            }),
            mkStudentTest({
                id: 'st2',
                answers: [{ questionId: 'q1', response: '', pointsEarned: 0 }],
            }),
        ];

        const overview = getStudentGrammarOverview('s1', { ...emptyDeps, tests: [test], studentTests });
        const row = overview.standards.find((candidate) => candidate.itemId === A1_ITEM)!;

        expect(row.testAttempts).toBe(2);
        expect(row.testCorrect).toBe(1);
        expect(row.testAccuracyPct).toBe(50);
        expect(row.combinedPct).toBe(50);
        expect(row.status).toBe('developing');
    });

    it('counts a question linked to two standards once for each standard', () => {
        const test = mkTest([
            {
                id: 'q1',
                prompt: 'If I had known, I would have come.',
                type: 'multiple-choice',
                points: 2,
                frameworkDescriptors: [descriptor(A2_ITEM, 'A2'), descriptor(B2_ITEM, 'B2')],
            },
        ]);
        const studentTests = [
            mkStudentTest({ id: 'st1', answers: [{ questionId: 'q1', response: 'a', pointsEarned: 2 }] }),
        ];

        const overview = getStudentGrammarOverview('s1', { ...emptyDeps, tests: [test], studentTests });

        for (const itemId of [A2_ITEM, B2_ITEM]) {
            const row = overview.standards.find((candidate) => candidate.itemId === itemId)!;
            expect(row.testAttempts).toBe(1);
            expect(row.testCorrect).toBe(1);
            expect(row.status).toBe('secure');
        }
    });

    it('skips in-progress attempts, unanswered questions, unknown tests and zero-point questions', () => {
        const test = mkTest([
            { id: 'q1', prompt: 'Answered', type: 'cloze', points: 1, linkedGrammarItemId: A1_ITEM },
            { id: 'q2', prompt: 'Unanswered', type: 'cloze', points: 1, linkedGrammarItemId: A1_ITEM },
            { id: 'q3', prompt: 'Zero points', type: 'cloze', points: 0, linkedGrammarItemId: A1_ITEM },
            { id: 'q4', prompt: 'Unknown test', type: 'cloze', points: 1, linkedGrammarItemId: A1_ITEM },
        ]);
        const studentTests = [
            mkStudentTest({ id: 'st1', answers: [{ questionId: 'q1', response: '', pointsEarned: 1 }] }),
            mkStudentTest({
                id: 'st2',
                status: 'in_progress',
                answers: [{ questionId: 'q1', response: '', pointsEarned: 1 }],
            }),
            mkStudentTest({
                id: 'st3',
                testId: 'missing',
                answers: [{ questionId: 'q1', response: '', pointsEarned: 1 }],
            }),
            mkStudentTest({ id: 'st4', answers: [{ questionId: 'q3', response: '', pointsEarned: 0 }] }),
        ];

        const overview = getStudentGrammarOverview('s1', { ...emptyDeps, tests: [test], studentTests });
        const row = overview.standards.find((candidate) => candidate.itemId === A1_ITEM)!;

        expect(row.testAttempts).toBe(2);
        expect(row.testCorrect).toBe(1);
        expect(row.testAccuracyPct).toBe(50);
    });

    it('scores writing evidence from the criterion percentage and marks it secure', () => {
        const rubric = mkRubric([descriptor(A1_ITEM, 'A1')]);
        const studentRubrics = [mkGradedRubric(rubric, { id: 'sr1' })];

        const overview = getStudentGrammarOverview('s1', { ...emptyDeps, rubrics: [rubric], studentRubrics });
        const row = overview.standards.find((candidate) => candidate.itemId === A1_ITEM)!;

        expect(row.writingInstances).toBe(1);
        expect(row.writingAvgPct).toBe(80);
        expect(row.testAccuracyPct).toBeNull();
        expect(row.combinedPct).toBe(80);
        expect(row.status).toBe('secure');
    });

    it('prefers the rubric snapshot over the live rubric when the standard links changed later', () => {
        const liveRubric = mkRubric([descriptor(A1_ITEM, 'A1')]);
        const snapshot = mkRubric([descriptor(B2_ITEM, 'B2')]);
        const studentRubrics = [mkGradedRubric(liveRubric, { id: 'sr1', rubricSnapshot: snapshot })];

        const overview = getStudentGrammarOverview('s1', {
            ...emptyDeps,
            rubrics: [liveRubric],
            studentRubrics,
        });

        expect(overview.standards.find((row) => row.itemId === B2_ITEM)!.writingInstances).toBe(1);
        expect(overview.standards.find((row) => row.itemId === A1_ITEM)!.writingInstances).toBe(0);
    });

    it('ignores peer reviews, ungraded rows and criteria with no points', () => {
        const graded = mkRubric([descriptor(A1_ITEM, 'A1')], { id: 'r1' });
        const zeroMax = mkRubric([descriptor(A2_ITEM, 'A2')], { id: 'r2', maxPoints: 0 });
        const studentRubrics = [
            mkGradedRubric(graded, { id: 'sr1', isPeerReview: true }),
            mkGradedRubric(zeroMax, { id: 'sr2' }),
            mkGradedRubric(graded, { id: 'sr3', gradedAt: undefined }),
        ];

        const overview = getStudentGrammarOverview('s1', {
            ...emptyDeps,
            rubrics: [graded, zeroMax],
            studentRubrics,
        });

        expect(overview.assessedCount).toBe(0);
    });

    it('averages the streams a standard actually has', () => {
        const test = mkTest([{ id: 'q1', prompt: 'x', type: 'cloze', points: 1, linkedGrammarItemId: A1_ITEM }]);
        const rubric = mkRubric([descriptor(A1_ITEM, 'A1')]);
        const studentTests = [
            mkStudentTest({ id: 'st1', answers: [{ questionId: 'q1', response: '', pointsEarned: 0 }] }),
        ];
        const studentRubrics = [mkGradedRubric(rubric, { id: 'sr1' })];

        const overview = getStudentGrammarOverview('s1', {
            ...emptyDeps,
            tests: [test],
            studentTests,
            rubrics: [rubric],
            studentRubrics,
        });
        const row = overview.standards.find((candidate) => candidate.itemId === A1_ITEM)!;

        expect(row.testAccuracyPct).toBe(0);
        expect(row.writingAvgPct).toBe(80);
        expect(row.combinedPct).toBe(40);
        expect(row.status).toBe('needs-work');
    });

    it('summarises how many assessed standards at or below the target level are secure', () => {
        const test = mkTest([
            { id: 'q1', prompt: 'A1', type: 'cloze', points: 1, linkedGrammarItemId: A1_ITEM },
            { id: 'q2', prompt: 'B2', type: 'cloze', points: 1, linkedGrammarItemId: B2_ITEM },
        ]);
        const studentTests = [
            mkStudentTest({
                id: 'st1',
                answers: [
                    { questionId: 'q1', response: '', pointsEarned: 1 },
                    { questionId: 'q2', response: '', pointsEarned: 1 },
                ],
            }),
        ];

        const overview = getStudentGrammarOverview(
            's1',
            { ...emptyDeps, tests: [test], studentTests },
            { targetLevel: 'B1' }
        );

        expect(overview.atTarget).toEqual({ targetLevel: 'B1', secure: 1, total: 1 });
    });

    it('narrows the rendered categories to the band without changing the summary counts', () => {
        const test = mkTest([
            { id: 'q1', prompt: 'A1', type: 'cloze', points: 1, linkedGrammarItemId: A1_ITEM },
            { id: 'q2', prompt: 'B2', type: 'cloze', points: 1, linkedGrammarItemId: B2_ITEM },
        ]);
        const studentTests = [
            mkStudentTest({
                id: 'st1',
                answers: [
                    { questionId: 'q1', response: '', pointsEarned: 1 },
                    { questionId: 'q2', response: '', pointsEarned: 0 },
                ],
            }),
        ];

        const overview = getStudentGrammarOverview(
            's1',
            { ...emptyDeps, tests: [test], studentTests },
            { band: 'a1a2' }
        );

        // The passive category holds only B1/B2 items, so the A1–A2 window drops it entirely.
        expect(overview.categories.some((category) => category.categoryId === 'passive')).toBe(false);
        expect(overview.standards.every((row) => isLevelInBand(row.level, 'a1a2'))).toBe(true);
        expect(overview.assessedCount).toBe(2);
    });
});

describe('getClassGrammarOverview', () => {
    const test = mkTest([
        { id: 'q1', prompt: 'A1', type: 'cloze', points: 1, linkedGrammarItemId: A1_ITEM },
        { id: 'q2', prompt: 'B2', type: 'cloze', points: 1, linkedGrammarItemId: B2_ITEM },
    ]);
    const studentTests = [
        mkStudentTest({
            id: 'st1',
            studentId: 's1',
            answers: [
                { questionId: 'q1', response: '', pointsEarned: 1 },
                { questionId: 'q2', response: '', pointsEarned: 1 },
            ],
        }),
        mkStudentTest({
            id: 'st2',
            studentId: 's2',
            answers: [
                { questionId: 'q1', response: '', pointsEarned: 0 },
                { questionId: 'q2', response: '', pointsEarned: 0 },
            ],
        }),
    ];

    it('averages each standard across students with equal weight', () => {
        const overview = getClassGrammarOverview(['s1', 's2'], { ...emptyDeps, tests: [test], studentTests });
        const row = overview.categories
            .flatMap((category) => category.standards)
            .find((candidate) => candidate.itemId === A1_ITEM)!;

        expect(row.classPct).toBe(50);
        expect(row.studentCount).toBe(2);
        expect(row.testAttempts).toBe(2);
        expect(row.testCorrect).toBe(1);
        expect(overview.classAveragePct).toBe(50);
        expect(overview.belowSecureCount).toBe(2);
    });

    it('keeps one row per requested student, including students with no evidence', () => {
        const overview = getClassGrammarOverview(['s1', 's2', 's3'], {
            ...emptyDeps,
            tests: [test],
            studentTests,
        });

        expect(overview.students.map((row) => row.studentId)).toEqual(['s1', 's2', 's3']);
        const third = overview.students.find((row) => row.studentId === 's3')!;
        expect(third.combinedPct).toBeNull();
        expect(third.assessedCount).toBe(0);
        expect(third.categoryPct.get('present-simple')).toBeNull();
    });

    it('exposes each student category score for the matrix cells', () => {
        const overview = getClassGrammarOverview(['s1', 's2'], { ...emptyDeps, tests: [test], studentTests });
        const first = overview.students.find((row) => row.studentId === 's1')!;

        expect(first.categoryPct.get('present-simple')).toBe(100);
        expect(first.categoryPct.get('conditionals')).toBe(100);
        expect(first.categoryPct.get('clauses')).toBeNull();
        expect(first.standardPct.get(A1_ITEM)).toBe(100);
    });

    it('reports the strongest and weakest scored categories', () => {
        const rubric = mkRubric([descriptor(B2_ITEM, 'B2')]);
        const studentRubrics = [
            mkGradedRubric(rubric, {
                id: 'sr1',
                entries: [{ criterionId: 'c1', levelId: 'l1', selectedPoints: 2, checkedSubItems: [], comment: '' }],
            }),
        ];

        const overview = getClassGrammarOverview(['s1'], {
            ...emptyDeps,
            tests: [test],
            studentTests,
            rubrics: [rubric],
            studentRubrics,
        });

        expect(overview.weakestCategory?.categoryId).toBe('conditionals');
        expect(overview.weakestCategory?.pct).toBe(60);
        expect(overview.strongestCategory?.categoryId).toBe('present-simple');
        expect(overview.strongestCategory?.pct).toBe(100);
    });

    it('filters matrix categories by band while keeping the unfiltered totals', () => {
        const overview = getClassGrammarOverview(
            ['s1', 's2'],
            { ...emptyDeps, tests: [test], studentTests },
            { band: 'a1a2' }
        );

        expect(overview.categories.some((category) => category.categoryId === 'passive')).toBe(false);
        expect(overview.categories.some((category) => category.categoryId === 'present-simple')).toBe(true);
        expect(overview.assessedStandardCount).toBe(2);
    });

    it('returns null summaries when a class has no grammar evidence', () => {
        const overview = getClassGrammarOverview(['s1', 's2'], emptyDeps);

        expect(overview.classAveragePct).toBeNull();
        expect(overview.belowSecureCount).toBe(0);
        expect(overview.weakestCategory).toBeNull();
        expect(overview.strongestCategory).toBeNull();
        expect(overview.assessedStandardCount).toBe(0);
    });
});

describe('getTestGrammarBreakdown', () => {
    it('reports per-standard accuracy with question numbers and each student result', () => {
        const test = mkTest([
            { id: 'q1', prompt: 'Tagged', type: 'cloze', points: 1, linkedGrammarItemId: A1_ITEM },
            { id: 'q2', prompt: 'Untagged', type: 'cloze', points: 1 },
            { id: 'q3', prompt: 'Tagged again', type: 'cloze', points: 1, linkedGrammarItemId: A1_ITEM },
        ]);
        const studentTests = [
            mkStudentTest({
                id: 'st1',
                studentId: 's1',
                answers: [
                    { questionId: 'q1', response: '', pointsEarned: 1 },
                    { questionId: 'q3', response: '', pointsEarned: 1 },
                ],
            }),
            mkStudentTest({
                id: 'st2',
                studentId: 's2',
                answers: [
                    { questionId: 'q1', response: '', pointsEarned: 0 },
                    { questionId: 'q3', response: '', pointsEarned: 1 },
                ],
            }),
        ];

        const breakdown = getTestGrammarBreakdown(test, studentTests);
        expect(breakdown.taggedQuestionCount).toBe(2);
        expect(breakdown.totalQuestionCount).toBe(3);

        const row = breakdown.standards.find((candidate) => candidate.itemId === A1_ITEM)!;
        expect(row.questionNumbers).toEqual([1, 3]);
        expect(row.attempts).toBe(4);
        expect(row.correct).toBe(3);
        expect(row.accuracyPct).toBe(75);
        expect(row.studentResults).toEqual(
            expect.arrayContaining([
                { studentId: 's1', attempts: 2, correct: 2 },
                { studentId: 's2', attempts: 2, correct: 1 },
            ])
        );
        expect(breakdown.secureCount).toBe(1);
        expect(breakdown.belowSecureCount).toBe(0);
    });

    it('counts a standard below the secure threshold and resolves legacy item ids', () => {
        const test = mkTest([
            {
                id: 'q1',
                prompt: 'Legacy id',
                type: 'cloze',
                points: 1,
                linkedGrammarItemId: 'gr-past-simple-negative-question',
            },
        ]);
        const studentTests = [
            mkStudentTest({ id: 'st1', answers: [{ questionId: 'q1', response: '', pointsEarned: 0 }] }),
        ];

        const breakdown = getTestGrammarBreakdown(test, studentTests);
        expect(breakdown.standards[0].itemId).toBe('gr-past-simple-negative');
        expect(breakdown.standards[0].accuracyPct).toBe(0);
        expect(breakdown.belowSecureCount).toBe(1);
        expect(breakdown.secureCount).toBe(0);
    });

    it('ignores in-progress attempts and answers belonging to another test', () => {
        const test = mkTest([{ id: 'q1', prompt: 'Tagged', type: 'cloze', points: 1, linkedGrammarItemId: A1_ITEM }]);
        const studentTests = [
            mkStudentTest({
                id: 'st1',
                status: 'in_progress',
                answers: [{ questionId: 'q1', response: '', pointsEarned: 1 }],
            }),
            mkStudentTest({
                id: 'st2',
                testId: 'other',
                answers: [{ questionId: 'q1', response: '', pointsEarned: 1 }],
            }),
        ];

        const breakdown = getTestGrammarBreakdown(test, studentTests);
        expect(breakdown.taggedQuestionCount).toBe(1);
        expect(breakdown.standards).toHaveLength(0);
    });

    it('returns no standards for a test whose questions carry no grammar links', () => {
        const test = mkTest([{ id: 'q1', prompt: 'Untagged', type: 'cloze', points: 1 }]);
        const breakdown = getTestGrammarBreakdown(test, [mkStudentTest({ id: 'st1' })]);

        expect(breakdown.standards).toEqual([]);
        expect(breakdown.taggedQuestionCount).toBe(0);
        expect(breakdown.secureCount).toBe(0);
        expect(breakdown.belowSecureCount).toBe(0);
        expect(breakdown.totalQuestionCount).toBe(1);
    });
});
