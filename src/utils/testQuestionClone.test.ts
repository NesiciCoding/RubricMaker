import { describe, it, expect } from 'vitest';
import { cloneQuestionWithFreshIds, cloneBankItemIntoTest } from './testQuestionClone';
import type { TestQuestion, QuestionBankItem } from '../types';

describe('cloneQuestionWithFreshIds', () => {
    const base: TestQuestion = {
        id: 'q1',
        prompt: 'Pick one',
        type: 'multiple-choice',
        points: 1,
        sectionId: 's1',
        options: [
            { id: 'o1', text: 'A', isCorrect: true },
            { id: 'o2', text: 'B', isCorrect: false },
        ],
    };

    it('regenerates the question id and strips sectionId', () => {
        const clone = cloneQuestionWithFreshIds(base);
        expect(clone.id).not.toBe(base.id);
        expect(clone.sectionId).toBeUndefined();
    });

    it('regenerates option ids without changing their content', () => {
        const clone = cloneQuestionWithFreshIds(base);
        expect(clone.options).toHaveLength(2);
        expect(clone.options![0].id).not.toBe('o1');
        expect(clone.options![0].text).toBe('A');
        expect(clone.options![0].isCorrect).toBe(true);
        // Two clones of the same bank item must not collide with each other.
        const clone2 = cloneQuestionWithFreshIds(base);
        expect(clone.options![0].id).not.toBe(clone2.options![0].id);
    });

    it('remaps categorize item categoryId references to the new category ids', () => {
        const categorize: TestQuestion = {
            id: 'q2',
            prompt: 'Sort these',
            type: 'categorize',
            points: 2,
            categories: [
                { id: 'catA', label: 'Animals' },
                { id: 'catB', label: 'Plants' },
            ],
            categorizeItems: [
                { id: 'i1', text: 'Dog', categoryId: 'catA' },
                { id: 'i2', text: 'Tree', categoryId: 'catB' },
            ],
        };
        const clone = cloneQuestionWithFreshIds(categorize);
        const newCatAId = clone.categories![0].id;
        const newCatBId = clone.categories![1].id;
        expect(newCatAId).not.toBe('catA');
        expect(clone.categorizeItems![0].categoryId).toBe(newCatAId);
        expect(clone.categorizeItems![1].categoryId).toBe(newCatBId);
    });
});

describe('cloneBankItemIntoTest', () => {
    it('clones a plain question item into a single freshly-id\'d TestQuestion with no section', () => {
        const item: QuestionBankItem = {
            id: 'bank1',
            question: { id: 'q1', prompt: 'Pick one', type: 'multiple-choice', points: 1 },
            tags: [],
            createdAt: '2026-01-01T00:00:00.000Z',
        };
        const { questions, section } = cloneBankItemIntoTest(item);
        expect(section).toBeUndefined();
        expect(questions).toHaveLength(1);
        expect(questions[0].id).not.toBe('q1');
        expect(questions[0].prompt).toBe('Pick one');
        expect(questions[0].sectionId).toBeUndefined();
    });

    it('clones a section bundle into a fresh TestSection plus its questions, all sharing the new sectionId', () => {
        const item: QuestionBankItem = {
            id: 'bank2',
            kind: 'section',
            cefrLevel: 'A1',
            section: {
                title: 'Tekst 1',
                content: '<p>passage</p>',
                audioUrl: 'https://example.com/clip.mp3',
                questions: [
                    { id: 'q1', prompt: 'Who?', type: 'short-answer', points: 1, expectedAnswers: ['Alex'] },
                    { id: 'q2', prompt: 'Where?', type: 'short-answer', points: 1, expectedAnswers: ['NYC'] },
                ],
            },
            tags: [],
            createdAt: '2026-01-01T00:00:00.000Z',
        };
        const { questions, section } = cloneBankItemIntoTest(item);
        expect(section).toBeDefined();
        expect(section!.title).toBe('Tekst 1');
        expect(section!.content).toBe('<p>passage</p>');
        expect(section!.audioUrl).toBe('https://example.com/clip.mp3');
        expect(section!.cefrLevel).toBe('A1');
        expect(questions).toHaveLength(2);
        expect(questions[0].id).not.toBe('q1');
        expect(questions[1].id).not.toBe('q2');
        expect(questions[0].sectionId).toBe(section!.id);
        expect(questions[1].sectionId).toBe(section!.id);
    });

    it('produces a different section id on each call so re-inserting the same bundle never collides', () => {
        const item: QuestionBankItem = {
            id: 'bank3',
            kind: 'section',
            section: { title: 'T', questions: [{ id: 'q1', prompt: 'Q', type: 'open', points: 1 }] },
            tags: [],
            createdAt: '2026-01-01T00:00:00.000Z',
        };
        const first = cloneBankItemIntoTest(item);
        const second = cloneBankItemIntoTest(item);
        expect(first.section!.id).not.toBe(second.section!.id);
        expect(first.questions[0].id).not.toBe(second.questions[0].id);
    });
});
