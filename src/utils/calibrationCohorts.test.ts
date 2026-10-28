import { describe, it, expect } from 'vitest';
import { buildCalibrationCohorts, buildCefrExpectations, cohortForStudent } from './calibrationCohorts';
import { MIN_CEFR_CALIBRATION_STUDENTS } from './cefrExpectationCalibration';
import { DEFAULT_FORMAT } from '../types';
import type {
    Class,
    FlashcardAssignment,
    FlashcardDeck,
    FlashcardReview,
    Rubric,
    Student,
    StudentRubric,
    StudentTest,
    Test,
} from '../types';

const GRAMMAR_ITEM_ID = 'gr-present-simple-affirmative';

const classes: Class[] = [
    { id: 'c-havo', name: 'HAVO 2A', year: 'jaar-2', voTrack: 'havo' },
    { id: 'c-vwo', name: 'VWO 1B', year: 'jaar-1', voTrack: 'vwo' },
    { id: 'c-noyear', name: 'No Year' },
];

// `classId: ''` is the store's "no class" shape and is skipped by the cohort grouping.
const student = (id: string, classId = ''): Student => ({ id, name: id, classId });

const students: Student[] = [
    student('s1', 'c-havo'),
    student('s2', 'c-havo'),
    student('s3', 'c-vwo'),
    student('s4', 'c-noyear'),
    student('s5'),
];

// ── Grammar evidence for one student: all three streams on a single item ──────

const test: Test = {
    id: 't1',
    name: 'Grammar test',
    questions: [
        { id: 'q1', prompt: 'She ___ here.', type: 'cloze', points: 1, linkedGrammarItemId: GRAMMAR_ITEM_ID },
        { id: 'q2', prompt: 'They ___ here.', type: 'cloze', points: 1, linkedGrammarItemId: GRAMMAR_ITEM_ID },
    ],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
};

function studentTests(studentId: string): StudentTest[] {
    return [
        {
            id: `st-${studentId}`,
            testId: 't1',
            studentId,
            answers: [
                { questionId: 'q1', response: '"works"', pointsEarned: 1 },
                { questionId: 'q2', response: '"work"', pointsEarned: 1 },
            ],
            status: 'graded',
            startedAt: '2026-01-01T00:00:00.000Z',
        },
    ];
}

const deck: FlashcardDeck = {
    id: 'd1',
    name: 'Grammar deck',
    cards: [
        { id: 'c1', front: 'a', back: 'b', linkedGrammarItemId: GRAMMAR_ITEM_ID },
        { id: 'c2', front: 'c', back: 'd', linkedGrammarItemId: GRAMMAR_ITEM_ID },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
};

function assignments(studentId: string): FlashcardAssignment[] {
    return [
        {
            deckId: 'd1',
            studentId,
            deckName: 'Grammar deck',
            cardCount: 2,
            createdAt: '2026-01-01T00:00:00.000Z',
        },
    ];
}

const masteredState = {
    cardId: 'c1',
    due: '2026-06-01T00:00:00.000Z',
    stability: 40,
    difficulty: 3,
    elapsed_days: 10,
    scheduled_days: 30,
    learning_steps: 0,
    reps: 5,
    lapses: 0,
    state: 2,
    last_review: '2026-01-01T00:00:00.000Z',
};

function reviews(studentId: string): FlashcardReview[] {
    return [
        {
            id: `fr-${studentId}`,
            deckId: 'd1',
            studentId,
            cardStates: { c1: masteredState } as never,
            updatedAt: '2026-01-01T00:00:00.000Z',
        } as FlashcardReview,
    ];
}

const rubric: Rubric = {
    id: 'r1',
    name: 'Essay rubric',
    subject: 'English',
    description: '',
    criteria: [
        {
            id: 'crit1',
            title: 'Grammar accuracy',
            description: '',
            weight: 100,
            levels: [{ id: 'l1', label: 'Good', minPoints: 4, maxPoints: 4, description: '', subItems: [] }],
            frameworkDescriptors: [
                {
                    descriptorId: GRAMMAR_ITEM_ID,
                    framework: 'grammar',
                    categoryId: 'present-simple',
                    categoryLabelEn: 'Present Simple',
                    categoryLabelNl: 'Tegenwoordige tijd',
                    categoryColor: '#3b82f6',
                    descriptionEn: 'Affirmative',
                    descriptionNl: 'Bevestigend',
                },
            ],
        },
    ],
    gradeScaleId: 'none',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    totalMaxPoints: 4,
    scoringMode: 'weighted-percentage',
};

function studentRubrics(studentId: string): StudentRubric[] {
    return [
        {
            id: `sr-${studentId}`,
            rubricId: 'r1',
            studentId,
            entries: [{ criterionId: 'crit1', levelId: 'l1', checkedSubItems: [], comment: '' }],
            overallComment: '',
            gradedAt: '2026-01-01T00:00:00.000Z',
            isPeerReview: false,
        },
    ];
}

/** Full input where only the given student ids carry grammar evidence. */
function input(withEvidence: string[]) {
    return {
        students,
        classes,
        tests: [test],
        studentTests: withEvidence.flatMap(studentTests),
        rubrics: [rubric],
        studentRubrics: withEvidence.flatMap(studentRubrics),
        flashcardDecks: [deck],
        flashcardAssignments: withEvidence.flatMap(assignments),
        flashcardReviews: withEvidence.flatMap(reviews),
        selfAssessments: [],
    };
}

describe('buildCalibrationCohorts — grouping', () => {
    it('groups students by (year, track), skipping classes without a year', () => {
        const cohorts = buildCalibrationCohorts(input([]));
        expect(cohorts.map((c) => c.key)).toEqual(['jaar-1|vwo', 'jaar-2|havo']);
        expect(cohorts.map((c) => c.studentCount)).toEqual([1, 2]);
        expect(cohorts[1].classNames).toEqual(['HAVO 2A']);
        expect(cohorts.every((c) => c.grammar.source === 'standard')).toBe(true);
    });

    it('orders cohorts by school year, then track', () => {
        const cohorts = buildCalibrationCohorts(input([]));
        expect(cohorts[0].year).toBe('jaar-1');
        expect(cohorts[1].year).toBe('jaar-2');
    });

    it('builds only the requested cohort', () => {
        const cohorts = buildCalibrationCohorts(input([]), { only: { year: 'jaar-2', voTrack: 'havo' } });
        expect(cohorts).toHaveLength(1);
        expect(cohorts[0].key).toBe('jaar-2|havo');
    });

    it('is deterministic — input order cannot change the output', () => {
        const forward = buildCalibrationCohorts(input(['s2']));
        const reversed = buildCalibrationCohorts({
            ...input(['s2']),
            students: [...students].reverse(),
        });
        expect(reversed).toEqual(forward);
        expect(buildCalibrationCohorts(input(['s2']))).toEqual(forward);
    });

    it('caps the students read per cohort without changing the reported size', () => {
        // s2 carries the only three-stream evidence and sorts after s1.
        const capped = buildCalibrationCohorts(input(['s2']), { limitPerCohort: 1 });
        const havo = capped.find((c) => c.key === 'jaar-2|havo')!;
        expect(havo.studentCount).toBe(2);
        expect(havo.grammar.sampleCount).toBe(0);

        const full = buildCalibrationCohorts(input(['s2']));
        expect(full.find((c) => c.key === 'jaar-2|havo')!.grammar.sampleCount).toBe(1);
    });
});

describe('cohortForStudent', () => {
    it('finds the cohort of a student with a year-bearing class', () => {
        const cohorts = buildCalibrationCohorts(input([]));
        expect(cohortForStudent(cohorts, students[0], classes)?.key).toBe('jaar-2|havo');
        expect(cohortForStudent(cohorts, students[2], classes)?.key).toBe('jaar-1|vwo');
    });

    it('has no cohort without a class, a year, or a student', () => {
        const cohorts = buildCalibrationCohorts(input([]));
        expect(cohortForStudent(cohorts, students[3], classes)).toBeUndefined();
        expect(cohortForStudent(cohorts, students[4], classes)).toBeUndefined();
        expect(cohortForStudent(cohorts, undefined, classes)).toBeUndefined();
    });
});

describe('buildCefrExpectations — CEFR-only path', () => {
    it('builds per-cohort expectations without needing flashcard data', () => {
        const cohorts = buildCefrExpectations({
            students,
            classes,
            tests: [],
            studentTests: [],
            rubrics: [],
            studentRubrics: [],
            selfAssessments: [],
        });
        expect(cohorts.map((c) => c.key)).toEqual(['jaar-1|vwo', 'jaar-2|havo']);
        const havo = cohorts[1];
        expect(havo.cefr).toHaveLength(5);
        // No graded CEFR evidence in this fixture, so the curriculum band applies everywhere.
        expect(havo.cefr.every((c) => c.source === 'curriculum' && c.studentCount === 0)).toBe(true);
        expect(MIN_CEFR_CALIBRATION_STUDENTS).toBeGreaterThan(0);
    });

    it('honours the only filter', () => {
        const cohorts = buildCefrExpectations(
            {
                students,
                classes,
                tests: [],
                studentTests: [],
                rubrics: [],
                studentRubrics: [],
                selfAssessments: [],
            },
            { only: { year: 'jaar-1', voTrack: 'vwo' } }
        );
        expect(cohorts.map((c) => c.key)).toEqual(['jaar-1|vwo']);
    });
});
