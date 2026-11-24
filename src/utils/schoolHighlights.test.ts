import { describe, expect, it } from 'vitest';
import { buildSchoolHighlightsSnapshot, MAX_SNAPSHOT_STUDENTS } from './schoolHighlights';
import type { SchoolHighlightsInput } from './schoolHighlights';
import { DEFAULT_FORMAT } from '../types';
import type {
    Class,
    FlashcardAssignment,
    FlashcardDeck,
    Rubric,
    Student,
    StudentRubric,
    StudentTest,
    Test,
} from '../types';

const GRAMMAR_ITEM_ID = 'gr-present-simple-affirmative';

const classes: Class[] = [{ id: 'c1', name: 'HAVO 2A', year: 'jaar-2', voTrack: 'havo' }];

const student = (id: string, extra: Partial<Student> = {}): Student => ({
    id,
    name: `Secret Name ${id}`,
    email: `${id}@example.test`,
    classId: 'c1',
    ...extra,
});

const test: Test = {
    id: 't1',
    name: 'Grammar test',
    questions: [{ id: 'q1', prompt: 'She ___ here.', type: 'cloze', points: 1, linkedGrammarItemId: GRAMMAR_ITEM_ID }],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
};

const attempt = (studentId: string, earned: number): StudentTest => ({
    id: `st-${studentId}`,
    testId: 't1',
    studentId,
    answers: [{ questionId: 'q1', response: '"works"', pointsEarned: earned }],
    status: 'graded',
    startedAt: '2026-01-01T00:00:00.000Z',
});

const deck: FlashcardDeck = {
    id: 'd1',
    name: 'Deck',
    cards: [{ id: 'c1', front: 'a', back: 'b', linkedGrammarItemId: GRAMMAR_ITEM_ID }],
    createdAt: '2026-01-01T00:00:00.000Z',
};

const assignment = (studentId: string): FlashcardAssignment => ({
    deckId: 'd1',
    studentId,
    deckName: 'Deck',
    cardCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
});

function input(over: Partial<SchoolHighlightsInput> = {}): SchoolHighlightsInput {
    return {
        students: [],
        classes,
        tests: [],
        studentTests: [],
        rubrics: [],
        studentRubrics: [],
        flashcardDecks: [],
        flashcardAssignments: [],
        flashcardReviews: [],
        selfAssessments: [],
        ...over,
    };
}

describe('buildSchoolHighlightsSnapshot', () => {
    it('returns zeroed level counts when there is nothing to count', () => {
        const snapshot = buildSchoolHighlightsSnapshot(input());
        expect(snapshot.studentCount).toBe(0);
        expect(snapshot.cefr.overall).toEqual({ A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 });
        expect(snapshot.cefr.skills).toEqual({});
        expect(snapshot.grammar).toEqual([]);
    });

    it('skips archived and anonymized students', () => {
        const snapshot = buildSchoolHighlightsSnapshot(
            input({
                students: [
                    student('s1'),
                    student('s2', { archivedAt: '2026-01-01T00:00:00.000Z' }),
                    student('s3', { anonymizedAt: '2026-01-01T00:00:00.000Z' }),
                ],
            })
        );
        expect(snapshot.studentCount).toBe(1);
    });

    it('caps the students it reads, keeping a stable id-sorted slice', () => {
        const many = Array.from({ length: MAX_SNAPSHOT_STUDENTS + 25 }, (_, i) =>
            student(`s${String(i).padStart(4, '0')}`)
        );
        expect(buildSchoolHighlightsSnapshot(input({ students: many })).studentCount).toBe(MAX_SNAPSHOT_STUDENTS);
    });

    it('sums grammar scores per item across students', () => {
        const snapshot = buildSchoolHighlightsSnapshot(
            input({
                students: [student('s1'), student('s2'), student('s3')],
                tests: [test],
                studentTests: [attempt('s1', 1), attempt('s2', 0)],
                flashcardDecks: [deck],
                flashcardAssignments: [assignment('s3')],
            })
        );
        const item = snapshot.grammar.find((g) => g.id === GRAMMAR_ITEM_ID);
        expect(item).toBeDefined();
        expect(item?.n).toBe(3);
        expect(item?.sum).toBe(100);
        expect(item?.lv).toBeTruthy();
    });

    it('never carries a student id, name or email', () => {
        const snapshot = buildSchoolHighlightsSnapshot(
            input({
                students: [student('s1'), student('s2')],
                tests: [test],
                studentTests: [attempt('s1', 1), attempt('s2', 1)],
            })
        );
        const json = JSON.stringify(snapshot);
        expect(json).not.toContain('Secret Name');
        expect(json).not.toContain('example.test');
        expect(json).not.toContain('"s1"');
        expect(json).not.toContain('c1');
    });

    it('counts a live grade towards grammar evidence and ignores a soft-deleted one', () => {
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
        const grade = (id: string, over: Partial<StudentRubric> = {}): StudentRubric => ({
            id,
            rubricId: 'r1',
            studentId: 's1',
            entries: [{ criterionId: 'crit1', levelId: 'l1', checkedSubItems: [], comment: '' }],
            overallComment: '',
            gradedAt: '2026-01-01T00:00:00.000Z',
            isPeerReview: false,
            ...over,
        });
        const snapshotFor = (studentRubrics: StudentRubric[]) =>
            buildSchoolHighlightsSnapshot(input({ students: [student('s1')], rubrics: [rubric], studentRubrics }));

        const live = snapshotFor([grade('live')]);
        expect(live.grammar.find((g) => g.id === GRAMMAR_ITEM_ID)?.n).toBe(1);

        const deleted = snapshotFor([grade('gone', { deletedAt: '2026-02-01T00:00:00.000Z' })]);
        expect(deleted.grammar).toEqual([]);

        const both = snapshotFor([
            grade('live'),
            grade('gone', { deletedAt: '2026-02-01T00:00:00.000Z', rubricId: 'r1' }),
        ]);
        expect(both).toEqual(live);
    });
});
