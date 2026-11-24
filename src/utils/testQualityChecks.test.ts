import { describe, expect, it } from 'vitest';
import type { TestQuestion } from '../types';
import { estimateTestMinutes, testQualityChecks } from './testQualityChecks';

function question(overrides: Partial<TestQuestion> & Pick<TestQuestion, 'id' | 'type'>): TestQuestion {
    return { prompt: 'Prompt', points: 1, ...overrides } as TestQuestion;
}

const option = (id: string, text: string, isCorrect = false) => ({ id, text, isCorrect });

describe('estimateTestMinutes', () => {
    it('adds fixed answering time to the reading time', () => {
        // 120 words read at 120 wpm is one minute; a true/false item adds 15 seconds.
        const words = Array.from({ length: 120 }, () => 'word').join(' ');
        expect(estimateTestMinutes([question({ id: 'q1', type: 'true-false', prompt: words })])).toBe(1);
        expect(
            estimateTestMinutes([
                question({ id: 'q1', type: 'true-false', prompt: words }),
                question({ id: 'q2', type: 'true-false', prompt: '' }),
            ])
        ).toBe(2);
    });

    it('counts a section passage once and option text too', () => {
        const questions = [
            question({
                id: 'q1',
                type: 'multiple-choice',
                prompt: 'Choose',
                options: [option('a', 'alpha'), option('b', 'beta')],
            }),
            question({ id: 'q2', type: 'multiple-choice', prompt: 'Choose' }),
        ];
        const withoutOptions = estimateTestMinutes([question({ id: 'q3', type: 'multiple-choice', prompt: 'Choose' })]);
        const withOptions = estimateTestMinutes([questions[0]]);
        expect(withOptions).toBe(withoutOptions);
        expect(estimateTestMinutes(questions, [{ id: 's1', title: 'Reading', content: 'passage text' }])).toBe(
            estimateTestMinutes(questions)
        );
    });
});

describe('testQualityChecks', () => {
    it('flags a test that cannot fit its time limit, and one that ends early', () => {
        const long = Array.from({ length: 6 }, (_, i) =>
            question({ id: `q${i}`, type: 'open', prompt: Array.from({ length: 100 }, () => 'word').join(' ') })
        );
        const [over] = testQualityChecks({ questions: long, durationMinutes: 5 });
        expect(over.id).toBe('time_over');
        expect(over.values).toEqual({ estimated: expect.any(Number), duration: 5 });

        const [short] = testQualityChecks({
            questions: [question({ id: 'q1', type: 'true-false', prompt: 'One short statement' })],
            durationMinutes: 60,
        });
        expect(short.id).toBe('time_short');
    });

    it('says nothing about time when the estimate is within 20% of the limit', () => {
        const words = Array.from({ length: 120 }, () => 'word').join(' ');
        const questions = [question({ id: 'q1', type: 'true-false', prompt: words })];
        expect(testQualityChecks({ questions, durationMinutes: 1 })).toEqual([]);
        expect(testQualityChecks({ questions, durationMinutes: 0 })).toEqual([]);
        expect(testQualityChecks({ questions: [] })).toEqual([]);
    });

    it('compares linked CEFR descriptors with the test target', () => {
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
        ];

        const findings = testQualityChecks({ questions, cefrTargetLevel: 'B1' });
        expect(findings).toEqual([
            { id: 'cefr_below', questionIds: ['q1'], numbers: [1], values: { number: 1, level: 'A2', target: 'B1' } },
            { id: 'cefr_above', questionIds: ['q2'], numbers: [2], values: { number: 2, level: 'B2', target: 'B1' } },
        ]);
        expect(testQualityChecks({ questions })).toEqual([]);
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
        expect(findings.map((f) => f.id)).toEqual(['duplicate_options']);
        expect(findings[0].questionIds).toEqual(['q1']);
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

    it('flags true/false items that state the same thing', () => {
        const findings = testQualityChecks({
            questions: [
                question({ id: 'q1', type: 'true-false', prompt: 'The sun is a star.' }),
                question({ id: 'q2', type: 'short-answer', prompt: 'Unrelated' }),
                question({ id: 'q3', type: 'true-false', prompt: 'the SUN is a   star.' }),
            ],
        });
        expect(findings).toEqual([
            { id: 'twin_true_false', questionIds: ['q1', 'q3'], numbers: [1, 3], values: { numbers: '1, 3' } },
        ]);
    });

    it('flags a stimulus repeated on the next question only', () => {
        const image = 'data:image/png;base64,abc';
        const findings = testQualityChecks({
            questions: [
                question({ id: 'q1', type: 'short-answer', imageUrl: image }),
                question({ id: 'q2', type: 'short-answer', imageUrl: image }),
                question({ id: 'q3', type: 'short-answer' }),
                question({ id: 'q4', type: 'short-answer', imageUrl: image }),
            ],
        });
        expect(findings).toEqual([
            { id: 'repeated_stimulus', questionIds: ['q2'], numbers: [2], values: { number: 2 } },
        ]);
    });
});
