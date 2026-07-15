import { describe, it, expect } from 'vitest';
import { getStudentMasteryProfile, withEvidenceOnly } from './masteryProfileAggregator';
import { DEFAULT_FORMAT } from '../types';
import type {
    Test,
    StudentTest,
    Rubric,
    StudentRubric,
    FlashcardDeck,
    FlashcardAssignment,
    FlashcardReview,
} from '../types';

const GRAMMAR_ITEM_ID = 'gr-present-simple-affirmative';

const emptyDeps = {
    tests: [] as Test[],
    studentTests: [] as StudentTest[],
    rubrics: [] as Rubric[],
    studentRubrics: [] as StudentRubric[],
    flashcardDecks: [] as FlashcardDeck[],
    flashcardAssignments: [] as FlashcardAssignment[],
    flashcardReviews: [] as FlashcardReview[],
};

describe('getStudentMasteryProfile', () => {
    it('returns one row per known grammar item, all evidence null, when nothing is linked', () => {
        const rows = getStudentMasteryProfile('s1', emptyDeps);
        expect(rows.length).toBeGreaterThan(10);
        expect(rows.every((r) => r.test === null && r.flashcards === null && r.writing === null)).toBe(true);
        expect(withEvidenceOnly(rows)).toHaveLength(0);
    });

    it('computes test accuracy from linked questions across multiple attempts', () => {
        const test: Test = {
            id: 't1',
            name: 'Grammar test',
            questions: [
                {
                    id: 'q1',
                    prompt: 'She ___ (work) here.',
                    type: 'cloze',
                    points: 1,
                    linkedGrammarItemId: GRAMMAR_ITEM_ID,
                },
            ],
            requireSEB: false,
            shuffleQuestions: false,
            createdAt: '2026-01-01T00:00:00.000Z',
        };
        const studentTests: StudentTest[] = [
            {
                id: 'st1',
                testId: 't1',
                studentId: 's1',
                answers: [{ questionId: 'q1', response: JSON.stringify({ '0': 'works' }), pointsEarned: 1 }],
                status: 'graded',
                startedAt: '2026-01-01T00:00:00.000Z',
            },
            {
                id: 'st2',
                testId: 't1',
                studentId: 's1',
                answers: [{ questionId: 'q1', response: JSON.stringify({ '0': 'work' }), pointsEarned: 0 }],
                status: 'graded',
                startedAt: '2026-01-02T00:00:00.000Z',
            },
        ];
        const rows = getStudentMasteryProfile('s1', { ...emptyDeps, tests: [test], studentTests });
        const row = rows.find((r) => r.itemId === GRAMMAR_ITEM_ID)!;
        expect(row.test).toEqual({ attempts: 2, correctAttempts: 1, accuracyPct: 50 });
    });

    it('ignores answers for a different student', () => {
        const test: Test = {
            id: 't1',
            name: 'Grammar test',
            questions: [{ id: 'q1', prompt: '...', type: 'cloze', points: 1, linkedGrammarItemId: GRAMMAR_ITEM_ID }],
            requireSEB: false,
            shuffleQuestions: false,
            createdAt: '2026-01-01T00:00:00.000Z',
        };
        const studentTests: StudentTest[] = [
            {
                id: 'st1',
                testId: 't1',
                studentId: 'other-student',
                answers: [{ questionId: 'q1', response: 'x', pointsEarned: 1 }],
                status: 'graded',
                startedAt: '2026-01-01T00:00:00.000Z',
            },
        ];
        const rows = getStudentMasteryProfile('s1', { ...emptyDeps, tests: [test], studentTests });
        expect(rows.find((r) => r.itemId === GRAMMAR_ITEM_ID)!.test).toBeNull();
    });

    it('ignores a StudentTest that is still in progress (not yet submitted)', () => {
        const test: Test = {
            id: 't1',
            name: 'Grammar test',
            questions: [{ id: 'q1', prompt: '...', type: 'cloze', points: 1, linkedGrammarItemId: GRAMMAR_ITEM_ID }],
            requireSEB: false,
            shuffleQuestions: false,
            createdAt: '2026-01-01T00:00:00.000Z',
        };
        const studentTests: StudentTest[] = [
            {
                id: 'st1',
                testId: 't1',
                studentId: 's1',
                answers: [{ questionId: 'q1', response: 'x', pointsEarned: 1 }],
                status: 'in_progress',
                startedAt: '2026-01-01T00:00:00.000Z',
            },
        ];
        const rows = getStudentMasteryProfile('s1', { ...emptyDeps, tests: [test], studentTests });
        expect(rows.find((r) => r.itemId === GRAMMAR_ITEM_ID)!.test).toBeNull();
    });

    it('computes flashcard stage counts for assigned decks only', () => {
        const deck: FlashcardDeck = {
            id: 'd1',
            name: 'Grammar deck',
            cards: [
                { id: 'c1', front: 'She ___ (work)', back: 'works', linkedGrammarItemId: GRAMMAR_ITEM_ID },
                { id: 'c2', front: 'They ___ (work)', back: 'work', linkedGrammarItemId: GRAMMAR_ITEM_ID },
            ],
            createdAt: '2026-01-01T00:00:00.000Z',
            deckKind: 'grammar',
        };
        const assignments: FlashcardAssignment[] = [
            {
                deckId: 'd1',
                studentId: 's1',
                deckName: 'Grammar deck',
                cardCount: 2,
                createdAt: '2026-01-01T00:00:00.000Z',
            },
        ];
        const reviews: FlashcardReview[] = [
            {
                id: 'd1:s1',
                deckId: 'd1',
                studentId: 's1',
                updatedAt: '2026-01-01T00:00:00.000Z',
                cardStates: {
                    c1: {
                        due: '2099-01-01T00:00:00.000Z',
                        stability: 40,
                        difficulty: 3,
                        elapsed_days: 10,
                        scheduled_days: 30,
                        learning_steps: 0,
                        reps: 5,
                        lapses: 0,
                        state: 2, // Review
                        last_review: '2026-01-01T00:00:00.000Z',
                    },
                },
            },
        ];
        const rows = getStudentMasteryProfile('s1', {
            ...emptyDeps,
            flashcardDecks: [deck],
            flashcardAssignments: assignments,
            flashcardReviews: reviews,
        });
        const row = rows.find((r) => r.itemId === GRAMMAR_ITEM_ID)!;
        expect(row.flashcards).toEqual({
            cardCount: 2,
            newCount: 1, // c2 has no state
            learningCount: 0,
            reviewCount: 0,
            masteredCount: 1, // c1: Review state + stability >= threshold
            dueCount: 0,
        });
    });

    it('excludes flashcard decks not assigned to the student', () => {
        const deck: FlashcardDeck = {
            id: 'd1',
            name: 'Grammar deck',
            cards: [{ id: 'c1', front: 'x', back: 'y', linkedGrammarItemId: GRAMMAR_ITEM_ID }],
            createdAt: '2026-01-01T00:00:00.000Z',
        };
        const rows = getStudentMasteryProfile('s1', { ...emptyDeps, flashcardDecks: [deck] });
        expect(rows.find((r) => r.itemId === GRAMMAR_ITEM_ID)!.flashcards).toBeNull();
    });

    it('averages writing evidence across graded rubric criteria tagged with the grammar item', () => {
        const rubric: Rubric = {
            id: 'r1',
            name: 'Essay rubric',
            subject: 'English',
            description: '',
            criteria: [
                {
                    id: 'c1',
                    title: 'Grammar accuracy',
                    description: '',
                    weight: 100,
                    levels: [
                        { id: 'l1', label: 'Good', minPoints: 4, maxPoints: 4, description: '', subItems: [] },
                        { id: 'l2', label: 'Weak', minPoints: 2, maxPoints: 2, description: '', subItems: [] },
                    ],
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
        const studentRubrics: StudentRubric[] = [
            {
                id: 'sr1',
                rubricId: 'r1',
                studentId: 's1',
                entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' }],
                overallComment: '',
                gradedAt: '2026-01-01T00:00:00.000Z',
                isPeerReview: false,
            },
            {
                id: 'sr2',
                rubricId: 'r1',
                studentId: 's1',
                entries: [{ criterionId: 'c1', levelId: 'l2', checkedSubItems: [], comment: '' }],
                overallComment: '',
                gradedAt: '2026-01-02T00:00:00.000Z',
                isPeerReview: false,
            },
        ];
        const rows = getStudentMasteryProfile('s1', { ...emptyDeps, rubrics: [rubric], studentRubrics });
        const row = rows.find((r) => r.itemId === GRAMMAR_ITEM_ID)!;
        // l1 = 4/4 = 100%, l2 = 2/4 = 50% -> avg 75%
        expect(row.writing).toEqual({ instances: 2, avgPct: 75 });
    });

    it('ignores ungraded and peer-review StudentRubric rows', () => {
        const rubric: Rubric = {
            id: 'r1',
            name: 'Essay rubric',
            subject: 'English',
            description: '',
            criteria: [
                {
                    id: 'c1',
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
        const studentRubrics: StudentRubric[] = [
            {
                id: 'sr-ungraded',
                rubricId: 'r1',
                studentId: 's1',
                entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' }],
                overallComment: '',
                isPeerReview: false,
                // no gradedAt
            },
            {
                id: 'sr-peer',
                rubricId: 'r1',
                studentId: 's1',
                entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' }],
                overallComment: '',
                gradedAt: '2026-01-01T00:00:00.000Z',
                isPeerReview: true,
            },
        ];
        const rows = getStudentMasteryProfile('s1', { ...emptyDeps, rubrics: [rubric], studentRubrics });
        expect(rows.find((r) => r.itemId === GRAMMAR_ITEM_ID)!.writing).toBeNull();
    });
});

describe('withEvidenceOnly', () => {
    it('keeps only rows with at least one non-null evidence stream', () => {
        const rows = getStudentMasteryProfile('s1', emptyDeps);
        const withOne = rows.map((r, i) =>
            i === 0 ? { ...r, test: { attempts: 1, correctAttempts: 1, accuracyPct: 100 } } : r
        );
        expect(withEvidenceOnly(withOne)).toHaveLength(1);
    });
});
