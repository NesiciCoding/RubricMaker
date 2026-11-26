import { describe, expect, it } from 'vitest';
import type { LinkedFrameworkDescriptor, TestQuestion } from '../types';
import { convertQuestionType } from './questionTypeConvert';
import { DEFAULT_MAX_RECORDING_SECONDS } from './questionTypeDefaults';

const question = (patch: Partial<TestQuestion>) =>
    ({ id: 'q1', prompt: '<p>Prompt</p>', type: 'open', points: 2, ...patch }) as TestQuestion;

const grammarChip: LinkedFrameworkDescriptor = {
    descriptorId: 'gr-mech-end-punctuation',
    framework: 'grammar',
    categoryId: 'mechanics',
    categoryLabelEn: 'Mechanics',
    categoryLabelNl: 'Mechanica',
    categoryColor: '#ffffff',
    descriptionEn: 'Uses end punctuation correctly',
    descriptionNl: 'Gebruikt eindpunctuatie correct',
};
const bloomChip: LinkedFrameworkDescriptor = {
    ...grammarChip,
    descriptorId: 'bloom-apply',
    framework: 'blooms',
};

describe('convertQuestionType', () => {
    it('leaves a question of the same type untouched', () => {
        const q = question({ type: 'matching', matchingPairs: [{ id: 'p1', left: 'a', right: 'b' }] });
        expect(convertQuestionType(q, 'matching')).toEqual({ question: q, dropped: [] });
    });

    it('removes the payloads of the type being left', () => {
        const q = question({
            type: 'matching',
            matchingPairs: [{ id: 'p1', left: 'a', right: 'b' }],
            matchingDistractors: ['spare'],
        });
        const { question: converted, dropped } = convertQuestionType(q, 'ordering');
        expect(converted.type).toBe('ordering');
        expect(converted.matchingPairs).toBeUndefined();
        expect(converted.matchingDistractors).toBeUndefined();
        expect(converted.orderItems).toHaveLength(2);
        expect(dropped).toEqual(['matchingPairs', 'matchingDistractors']);
    });

    it('reports only fields that actually held authored content', () => {
        const empty = convertQuestionType(question({ type: 'cloze', gapWeights: [] }), 'open');
        expect(empty.dropped).toEqual([]);

        const authored = convertQuestionType(
            question({ type: 'cloze', gapWeights: [1, 2], clozeIntro: '<p>Intro</p>' }),
            'open'
        );
        expect(authored.dropped).toEqual(['clozeIntro', 'gapWeights']);
        expect(authored.question.clozeIntro).toBeUndefined();
        expect(authored.question.gapWeights).toBeUndefined();
    });

    it('keeps everything that describes the question rather than its answer format', () => {
        const q = question({
            type: 'open',
            imageUrl: 'https://example.test/item.png',
            audioUrl: 'https://example.test/item.mp3',
            hint: 'Read twice',
            explanation: 'Because',
            sectionId: 's1',
            contentLanguage: 'nl',
            rubricId: 'r1',
            partialCredit: false,
            maxPlays: 2,
            spokenText: 'Spoken',
            transcript: 'Transcript',
            linkedStandards: [
                {
                    guid: 'g1',
                    description: 'A standard',
                    standardSetTitle: 'Set',
                    jurisdictionTitle: 'NL',
                },
            ],
        });
        const { question: converted } = convertQuestionType(q, 'multiple-choice');
        expect(converted).toMatchObject({
            prompt: q.prompt,
            points: 2,
            imageUrl: q.imageUrl,
            audioUrl: q.audioUrl,
            hint: 'Read twice',
            explanation: 'Because',
            sectionId: 's1',
            contentLanguage: 'nl',
            rubricId: 'r1',
            partialCredit: false,
            maxPlays: 2,
            spokenText: 'Spoken',
            transcript: 'Transcript',
            linkedStandards: q.linkedStandards,
        });
    });

    it('gives the target type the answer shape it needs to open on', () => {
        const audio = convertQuestionType(question({ type: 'open' }), 'audio-response');
        expect(audio.question.maxRecordingSeconds).toBe(DEFAULT_MAX_RECORDING_SECONDS);

        const matrix = convertQuestionType(question({ type: 'open' }), 'matrix');
        expect(matrix.question.matrixColumns).toHaveLength(2);
        expect(matrix.question.matrixRows).toHaveLength(2);
        expect(matrix.question.matrixRows?.[0].correctColumnId).toBe(matrix.question.matrixColumns?.[0].id);

        const choice = convertQuestionType(question({ type: 'open' }), 'multiple-choice');
        expect(choice.question.options).toHaveLength(2);
        expect(choice.question.options?.[0].isCorrect).toBe(true);
    });

    it('shares options between multiple-choice and multiple-response', () => {
        const q = question({
            type: 'multiple-response',
            options: [
                { id: 'a', text: 'A', isCorrect: true },
                { id: 'b', text: 'B', isCorrect: true },
            ],
            shuffleOptions: true,
        });
        const { question: converted, dropped } = convertQuestionType(q, 'multiple-choice');
        expect(dropped).toEqual([]);
        expect(converted.options).toHaveLength(2);
        expect(converted.shuffleOptions).toBe(true);
        expect(converted.options?.filter((option) => option.isCorrect)).toHaveLength(1);
        expect(converted.options?.[0].isCorrect).toBe(true);
    });

    it('clears grammar chips on a type that cannot drill them', () => {
        const q = question({ type: 'cloze', frameworkDescriptors: [grammarChip, bloomChip] });
        const { question: converted } = convertQuestionType(q, 'open');
        expect(converted.frameworkDescriptors).toEqual([bloomChip]);
        expect(converted.linkedGrammarItemIds).toBeUndefined();
        expect(converted.linkedGrammarItemId).toBeUndefined();
    });

    it('keeps grammar chips where they still apply', () => {
        const q = question({ type: 'cloze', frameworkDescriptors: [grammarChip, bloomChip] });
        const { question: converted } = convertQuestionType(q, 'matching');
        expect(converted.frameworkDescriptors).toEqual([grammarChip, bloomChip]);
        expect(converted.linkedGrammarItemIds).toEqual([grammarChip.descriptorId]);
        expect(converted.linkedGrammarItemId).toBe(grammarChip.descriptorId);
    });
});
