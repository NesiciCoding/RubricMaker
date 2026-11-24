import { describe, expect, it } from 'vitest';
import type { StudentTest, TestQuestion, TestSection } from '../types';
import { attemptDurationsMinutes, roughTestMinutes, testQualityChecks } from './testQualityChecks';

function question(overrides: Partial<TestQuestion> & Pick<TestQuestion, 'id' | 'type'>): TestQuestion {
    return { prompt: 'Prompt', points: 1, ...overrides } as TestQuestion;
}

const option = (id: string, text: string, isCorrect = false) => ({ id, text, isCorrect });
const words = (count: number) => Array.from({ length: count }, () => 'word').join(' ');
const manyQuestions = (count: number) =>
    Array.from({ length: count }, (_, index) => question({ id: `q${index}`, type: 'short-answer' }));

const attempt = (overrides: Partial<StudentTest> = {}): StudentTest =>
    ({
        id: 'a1',
        testId: 't1',
        studentId: 's1',
        answers: [],
        status: 'submitted',
        startedAt: '2024-01-01T10:00:00Z',
        submittedAt: '2024-01-01T10:30:00Z',
        ...overrides,
    }) as StudentTest;

describe('roughTestMinutes', () => {
    it('gives a minute per question', () => {
        expect(roughTestMinutes(manyQuestions(12))).toBe(12);
        expect(roughTestMinutes([])).toBe(1);
    });

    it('adds a minute per 120 words of passage', () => {
        const sections = [{ id: 's1', title: 'Reading', content: words(240) } as TestSection];
        expect(roughTestMinutes(manyQuestions(3), sections)).toBe(5);
        expect(
            roughTestMinutes(manyQuestions(3), [{ id: 's2', title: 'Short', content: words(30) } as TestSection])
        ).toBe(3);
    });
});

describe('attemptDurationsMinutes', () => {
    it('measures this test’s submitted sittings only', () => {
        expect(
            attemptDurationsMinutes(
                [
                    attempt(),
                    attempt({ id: 'a2', status: 'graded', submittedAt: '2024-01-01T10:45:00Z' }),
                    attempt({ id: 'a3', testId: 't2' }),
                    attempt({ id: 'a4', status: 'in_progress', submittedAt: undefined }),
                ],
                't1'
            )
        ).toEqual([30, 45]);
    });

    it('drops sittings that cannot be a real duration', () => {
        expect(
            attemptDurationsMinutes(
                [
                    attempt({ id: 'a1', startedAt: 'nonsense' }),
                    attempt({ id: 'a2', submittedAt: 'before' }),
                    attempt({ id: 'a3', submittedAt: '2024-01-01T09:59:00Z' }),
                    attempt({ id: 'a4', submittedAt: '2024-01-03T10:00:00Z' }),
                    attempt({ id: 'a5', submittedAt: '2024-01-01T10:00:30Z' }),
                ],
                't1'
            )
        ).toEqual([0.5]);
    });
});

describe('testQualityChecks', () => {
    it('compares the configured limit with the median real sitting', () => {
        const questions = manyQuestions(4);
        const [over] = testQualityChecks({ questions, durationMinutes: 20, attemptMinutes: [60, 31, 29] });
        expect(over).toEqual({
            id: 'time_over',
            questionIds: [],
            numbers: [],
            values: { minutes: 31, duration: 20 },
        });

        const [short] = testQualityChecks({ questions, durationMinutes: 20, attemptMinutes: [6, 4, 5] });
        expect(short).toEqual({
            id: 'time_short',
            questionIds: [],
            numbers: [],
            values: { minutes: 5, duration: 20 },
        });
    });

    it('says nothing when the sitting median is within 20% of the limit', () => {
        expect(
            testQualityChecks({ questions: manyQuestions(4), durationMinutes: 20, attemptMinutes: [17, 20, 23] })
        ).toEqual([]);
    });

    it('falls back to the rough estimate before the first sitting', () => {
        const [over] = testQualityChecks({ questions: manyQuestions(40), durationMinutes: 10 });
        expect(over.id).toBe('time_rough_over');
        expect(over.values).toEqual({ minutes: 40, duration: 10 });

        const [short] = testQualityChecks({ questions: manyQuestions(2), durationMinutes: 60 });
        expect(short.id).toBe('time_rough_short');
        expect(short.values).toEqual({ minutes: 2, duration: 60 });
    });

    it('has nothing to say about time without a limit or questions', () => {
        expect(testQualityChecks({ questions: manyQuestions(4), durationMinutes: 0 })).toEqual([]);
        expect(testQualityChecks({ questions: manyQuestions(4) })).toEqual([]);
        expect(testQualityChecks({ questions: [], durationMinutes: 30 })).toEqual([]);
        expect(testQualityChecks({ questions: [], durationMinutes: 30, attemptMinutes: [40] })).toEqual([]);
    });

    it('reports descriptors outside the target as one line', () => {
        const descriptor = (level: 'A2' | 'B1' | 'B2') => ({
            descriptorId: `d-${level}`,
            level,
            skill: 'reading' as const,
            descriptionEn: 'Can read',
            descriptionNl: 'Kan lezen',
        });
        const questions = [
            question({ id: 'q1', type: 'short-answer', linkedCefrDescriptors: [descriptor('A2')] }),
            question({ id: 'q2', type: 'short-answer', linkedCefrDescriptors: [descriptor('B2')] }),
            question({ id: 'q3', type: 'short-answer' }),
            question({ id: 'q4', type: 'short-answer', linkedCefrDescriptors: [descriptor('B1')] }),
        ];

        expect(testQualityChecks({ questions, cefrTargetLevel: 'B1' })).toEqual([
            {
                id: 'cefr_off_target',
                questionIds: ['q1', 'q2'],
                numbers: [],
                values: { count: 2, total: 4, target: 'B1' },
            },
        ]);
        expect(testQualityChecks({ questions: [questions[3]], cefrTargetLevel: 'B1' })).toEqual([]);
        expect(testQualityChecks({ questions })).toEqual([]);
    });

    it('flags a question that scores nothing', () => {
        const findings = testQualityChecks({
            questions: [
                question({ id: 'q1', type: 'short-answer', points: 0 }),
                question({ id: 'q2', type: 'short-answer', points: 2 }),
            ],
        });
        expect(findings).toEqual([{ id: 'no_points', questionIds: ['q1'], numbers: [1], values: { number: 1 } }]);
    });

    it('flags repeated option text, ignoring case and spacing', () => {
        const findings = testQualityChecks({
            questions: [
                question({
                    id: 'q1',
                    type: 'multiple-response',
                    options: [option('a', 'Same  answer', true), option('b', 'same answer'), option('c', 'other')],
                }),
            ],
        });
        expect(findings).toEqual([
            { id: 'duplicate_options', questionIds: ['q1'], numbers: [1], values: { number: 1 } },
        ]);
    });

    it('flags a single-choice question with no wrong option, but not select-all', () => {
        const allCorrect = [option('a', 'one', true), option('b', 'two', true)];
        expect(
            testQualityChecks({
                questions: [question({ id: 'q1', type: 'multiple-choice', options: allCorrect })],
            }).map((f) => f.id)
        ).toEqual(['no_distractor']);
        expect(
            testQualityChecks({
                questions: [question({ id: 'q1', type: 'multiple-response', options: allCorrect })],
            })
        ).toEqual([]);
    });
});
