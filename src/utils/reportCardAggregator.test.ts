import { describe, it, expect } from 'vitest';
import { buildReportCardData } from './reportCardAggregator';
import type { Rubric, Student, StudentRubric, ReportCardConfig, Test, StudentTest } from '../types';

function makeRubric(overrides: Partial<Rubric> = {}): Rubric {
    return {
        id: 'r1',
        name: 'Test Rubric',
        subject: 'English',
        description: '',
        gradeScaleId: 'gs1',
        format: {} as Rubric['format'],
        attachmentIds: [],
        createdAt: '',
        updatedAt: '',
        totalMaxPoints: 100,
        scoringMode: 'weighted-percentage',
        criteria: [
            {
                id: 'c1',
                title: 'Writing Quality',
                description: '',
                weight: 100,
                levels: [
                    { id: 'l1', label: 'Good', minPoints: 80, maxPoints: 100, description: '', subItems: [] },
                    { id: 'l2', label: 'Poor', minPoints: 0, maxPoints: 50, description: '', subItems: [] },
                ],
            },
        ],
        ...overrides,
    };
}

function makeStudent(overrides: Partial<Student> = {}): Student {
    return { id: 's1', name: 'Ada Lovelace', classId: 'cl1', ...overrides };
}

function makeSr(overrides: Partial<StudentRubric> = {}): StudentRubric {
    return {
        id: 'sr1',
        rubricId: 'r1',
        studentId: 's1',
        overallComment: '',
        gradedAt: '2024-01-15',
        isPeerReview: false,
        entries: [{ criterionId: 'c1', levelId: 'l1', selectedPoints: 85, checkedSubItems: [], comment: '' }],
        ...overrides,
    };
}

const allOnConfig: ReportCardConfig = {
    includeRubrics: true,
    includeStandards: true,
    includeLearningGoals: true,
    includeCefr: true,
    includeTestSummary: true,
};

const allOffConfig: ReportCardConfig = {
    includeRubrics: false,
    includeStandards: false,
    includeLearningGoals: false,
    includeCefr: false,
    includeTestSummary: false,
};

describe('buildReportCardData', () => {
    it('builds all sections when all flags are enabled', () => {
        const student = makeStudent();
        const rubric = makeRubric();
        const sr = makeSr();
        const result = buildReportCardData('s1', allOnConfig, {
            student,
            className: 'Class A',
            entries: [{ sr, rubric, scale: null }],
            rubrics: [rubric],
            studentRubrics: [sr],
            selfAssessments: [],
        });

        expect(result.studentId).toBe('s1');
        expect(result.studentName).toBe('Ada Lovelace');
        expect(result.className).toBe('Class A');
        expect(result.sections.map((s) => s.type)).toEqual([
            'rubrics',
            'standards',
            'learningGoals',
            'cefr',
            'testSummary',
        ]);
    });

    it('returns an empty sections array when all flags are disabled', () => {
        const student = makeStudent();
        const rubric = makeRubric();
        const sr = makeSr();
        const result = buildReportCardData('s1', allOffConfig, {
            student,
            className: 'Class A',
            entries: [{ sr, rubric, scale: null }],
            rubrics: [rubric],
            studentRubrics: [sr],
            selfAssessments: [],
        });

        expect(result.sections).toHaveLength(0);
        expect(result.studentId).toBe('s1');
    });

    it.each([
        ['includeRubrics', 'rubrics'],
        ['includeStandards', 'standards'],
        ['includeLearningGoals', 'learningGoals'],
        ['includeCefr', 'cefr'],
        ['includeTestSummary', 'testSummary'],
    ] as const)('includes only the %s section when only that flag is set', (flag, expectedType) => {
        const student = makeStudent();
        const rubric = makeRubric();
        const sr = makeSr();
        const config: ReportCardConfig = { ...allOffConfig, [flag]: true };

        const result = buildReportCardData('s1', config, {
            student,
            className: 'Class A',
            entries: [{ sr, rubric, scale: null }],
            rubrics: [rubric],
            studentRubrics: [sr],
            selfAssessments: [],
        });

        expect(result.sections).toHaveLength(1);
        expect(result.sections[0].type).toBe(expectedType);
    });

    it('produces an empty rubrics section, not a crash, when the student has no graded entries', () => {
        const student = makeStudent();
        const result = buildReportCardData('s1', { ...allOffConfig, includeRubrics: true }, {
            student,
            className: 'Class A',
            entries: [],
            rubrics: [],
            studentRubrics: [],
            selfAssessments: [],
        });

        expect(result.sections).toHaveLength(1);
        expect(result.sections[0]).toEqual({ type: 'rubrics', entries: [] });
    });

    it('produces an empty learning goals section, not a crash, when the student has no standards-linked data', () => {
        const student = makeStudent();
        const rubric = makeRubric();
        const sr = makeSr();
        const result = buildReportCardData('s1', { ...allOffConfig, includeLearningGoals: true }, {
            student,
            className: 'Class A',
            entries: [{ sr, rubric, scale: null }],
            rubrics: [rubric],
            studentRubrics: [sr],
            selfAssessments: [],
        });

        expect(result.sections).toHaveLength(1);
        expect(result.sections[0]).toEqual({ type: 'learningGoals', goals: [] });
    });

    it('produces an empty CEFR overview, not a crash, when the rubric has no CEFR tagging', () => {
        const student = makeStudent();
        const rubric = makeRubric();
        const sr = makeSr();
        const result = buildReportCardData('s1', { ...allOffConfig, includeCefr: true }, {
            student,
            className: 'Class A',
            entries: [{ sr, rubric, scale: null }],
            rubrics: [rubric],
            studentRubrics: [sr],
            selfAssessments: [],
        });

        expect(result.sections).toHaveLength(1);
        const section = result.sections[0];
        expect(section.type).toBe('cefr');
        if (section.type === 'cefr') {
            expect(section.overview.cells).toHaveLength(0);
        }
    });

    it('produces an empty test summary without crashing when no tests are passed', () => {
        const student = makeStudent();
        const result = buildReportCardData('s1', { ...allOffConfig, includeTestSummary: true }, {
            student,
            className: 'Class A',
            entries: [],
            rubrics: [],
            studentRubrics: [],
            selfAssessments: [],
        });

        expect(result.sections).toEqual([
            { type: 'testSummary', overview: { studentId: 's1', questions: [], skills: [] } },
        ]);
    });

    it('merges strong/weak breakdowns across every test the student took', () => {
        const student = makeStudent();
        const test: Test = {
            id: 't1',
            name: 'Quiz 1',
            questions: [
                {
                    id: 'q1',
                    prompt: 'Pick one',
                    type: 'multiple-choice',
                    points: 2,
                    options: [
                        { id: 'a', text: 'Right', isCorrect: true },
                        { id: 'b', text: 'Wrong', isCorrect: false },
                    ],
                },
            ],
            requireSEB: false,
            shuffleQuestions: false,
            createdAt: '2024-01-01',
        };
        const studentTest: StudentTest = {
            id: 'st1',
            testId: 't1',
            studentId: 's1',
            answers: [{ questionId: 'q1', response: 'a' }],
            status: 'graded',
            startedAt: '2024-01-15',
            gradedAt: '2024-01-15',
        };

        const result = buildReportCardData('s1', { ...allOffConfig, includeTestSummary: true }, {
            student,
            className: 'Class A',
            entries: [],
            rubrics: [],
            studentRubrics: [],
            selfAssessments: [],
            tests: [test],
            studentTests: [studentTest],
        });

        expect(result.sections).toHaveLength(1);
        const section = result.sections[0];
        expect(section.type).toBe('testSummary');
        if (section.type === 'testSummary') {
            expect(section.overview.questions).toEqual([
                { questionId: 'q1', accuracyPct: 100, bucket: 'strong', sampleSize: 1 },
            ]);
        }
    });
});
