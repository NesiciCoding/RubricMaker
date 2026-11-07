import { describe, expect, it } from 'vitest';
import { typeTestDraft, typeDraftItem, type TypedItem } from './questionTypes';
import type { DraftItem, TestDraft } from './testStructure';

/** The real paper's wording, so the fixtures are the shapes a teacher actually has. */
function item(overrides: Partial<DraftItem> & { text: string }): DraftItem {
    return { label: 'Assignment 1 · 1', sectionIndex: 0, blanks: 0, ...overrides };
}

const gapsOf = (typed: TypedItem): string[][] =>
    [...typed.prompt.matchAll(/\{\{(.*?)\}\}/g)].map((match) => (match[1] ? match[1].split('|') : []));

describe('typeDraftItem', () => {
    it('reads a printed option pair as a choice and flags the key answer that is correct', () => {
        const typed = typeDraftItem(
            item({
                text: 'That book is not mine; it is _______.',
                blanks: 1,
                inlineOptions: ['her', 'hers'],
                answers: ['hers'],
                points: 1,
            })
        );
        expect(typed.type).toBe('multiple-choice');
        expect(typed.options).toEqual(['her', 'hers']);
        expect(typed.correctOptionIndex).toBe(1);
        expect(typed.prompt).toBe('That book is not mine; it is _______.');
        expect(typed.points).toBe(1);
        expect(typed.uncertain).toBeUndefined();
    });

    it('matches an option whatever its capitalisation and punctuation', () => {
        const typed = typeDraftItem(
            item({
                text: 'Is that worksheet _______?',
                blanks: 1,
                inlineOptions: ['Your', 'yours'],
                answers: ['Yours'],
            })
        );
        expect(typed.correctOptionIndex).toBe(1);
    });

    it('keeps the options but reports a key answer that matches none of them', () => {
        const typed = typeDraftItem(
            item({ text: 'The car is _______.', blanks: 1, inlineOptions: ['his', 'him'], answers: ['hers'] })
        );
        expect(typed.type).toBe('multiple-choice');
        expect(typed.correctOptionIndex).toBeUndefined();
        expect(typed.uncertain).toBe('option_answer_mismatch');
    });

    it('fills a single gap with every accepted alternative the key lists', () => {
        const typed = typeDraftItem(item({ text: '(-) They _____ busy.', blanks: 1, answers: ['are not', "aren't"] }));
        expect(typed.type).toBe('cloze');
        expect(typed.prompt).toBe("(-) They {{are not|aren't}} busy.");
        expect(typed.emptyGaps).toBe(0);
        expect(typed.uncertain).toBeUndefined();
    });

    it('puts one gap answer on each blank when the key splits them', () => {
        const typed = typeDraftItem(
            item({
                text: '(?) _____ you _____ a sister?',
                blanks: 2,
                gapAnswers: ['Do', 'have'],
                answers: ['Do have'],
            })
        );
        expect(gapsOf(typed)).toEqual([['Do'], ['have']]);
        expect(typed.prompt).toBe('(?) {{Do}} you {{have}} a sister?');
    });

    it('splits a single answer across the blanks only when the counts line up', () => {
        const typed = typeDraftItem(item({ text: '_____ you _____ any pens?', blanks: 2, answers: ['Do have'] }));
        expect(gapsOf(typed)).toEqual([['Do'], ['have']]);
        expect(typed.uncertain).toBeUndefined();
    });

    it('leaves the gaps empty and says so when the key covers fewer blanks than the paper prints', () => {
        const typed = typeDraftItem(
            item({ text: '(?) _____ Kate _____ 2 cats?', blanks: 2, gapAnswers: ['Does', 'have', 'extra'] })
        );
        expect(typed.type).toBe('cloze');
        expect(typed.emptyGaps).toBe(2);
        expect(typed.uncertain).toBe('gap_count_mismatch');
        expect(typed.prompt).toBe('(?) {{}} Kate {{}} 2 cats?');
    });

    it('keeps a blank unanswered when no key reached the item', () => {
        const typed = typeDraftItem(item({ text: 'She _____ tall.', blanks: 1 }));
        expect(typed.type).toBe('cloze');
        expect(typed.emptyGaps).toBe(1);
        expect(typed.uncertain).toBe('missing_gap_answer');
        expect(typed.prompt).toBe('She {{}} tall.');
    });

    it('reads a leading blank with a referent cue as a one-word answer, not a gap in a sentence', () => {
        const typed = typeDraftItem(
            item({ text: '_______ is amazing at drawing.', blanks: 1, cue: 'Anna', answers: ['She'] })
        );
        expect(typed.type).toBe('short-answer');
        expect(typed.expectedAnswers).toEqual(['She']);
        // The cue is part of what the student reads: it names the person the pronoun stands for.
        expect(typed.prompt).toBe('_______ is amazing at drawing. (Anna)');
    });

    it('capitalises a one-word answer to a prompt that opens with the blank', () => {
        const typed = typeDraftItem(
            item({ text: '_______ are almost at school.', blanks: 1, cue: 'Sarah and John', answers: ['they'] })
        );
        expect(typed.expectedAnswers).toEqual(['They']);
    });

    it('reads a bare prompt with a key answer as a short answer carrying every alternative', () => {
        const typed = typeDraftItem(item({ text: 'Snor', answers: ['moustache', 'mustache'] }));
        expect(typed.type).toBe('short-answer');
        expect(typed.expectedAnswers).toEqual(['moustache', 'mustache']);
    });

    it('asks for apostrophe and punctuation tolerance only when the answer needs it', () => {
        const contractions = typeDraftItem(item({ text: '_____ you _____ a sister?', answers: ["don't have"] }));
        expect(contractions.answerTolerance).toEqual({ contractions: true });

        const punctuation = typeDraftItem(item({ text: 'Antwoord', answers: ['Yes, I do.'] }));
        expect(punctuation.answerTolerance).toEqual({ punctuation: true });

        const plain = typeDraftItem(item({ text: 'Bald', answers: ['kaal'] }));
        expect(plain.answerTolerance).toBeUndefined();
    });

    it('reads a true/false key answer as a statement to judge, in either language', () => {
        const english = typeDraftItem(item({ text: 'The sun is a star.', answers: ['True'] }));
        expect(english.type).toBe('true-false');
        expect(english.correctBoolean).toBe(true);

        const dutch = typeDraftItem(item({ text: 'De zon is een ster.', answers: ['onwaar'] }));
        expect(dutch.type).toBe('true-false');
        expect(dutch.correctBoolean).toBe(false);
    });

    it('agrees with itself when the key lists both true and false', () => {
        const typed = typeDraftItem(item({ text: 'De zon is een ster.', answers: ['true', 'onwaar'] }));
        expect(typed.type).not.toBe('true-false');
    });

    it('grades a prose model answer itself rather than pretending to match it', () => {
        const typed = typeDraftItem(
            item({
                text: 'Pimple',
                answers: ['She has a pimple on her nose and she is not happy about it.'],
                points: 2,
            })
        );
        expect(typed.type).toBe('open');
        expect(typed.expectedAnswers).toHaveLength(1);
    });

    it('takes a key column that explains the marking as a note, not as an answer', () => {
        const typed = typeDraftItem(
            item({
                text: 'Pimple',
                points: 2,
                answers: ['1p voor het juist gebruiken van het woord in een zin en 1p voor de leestekens.'],
            })
        );
        expect(typed.type).toBe('open');
        expect(typed.expectedAnswers).toBeUndefined();
        expect(typed.keyNote).toBe('1p voor het juist gebruiken van het woord in een zin en 1p voor de leestekens.');
        expect(typed.uncertain).toBe('no_answer');
    });

    it('marks an item with no key answer at all as the teacher grading it', () => {
        const typed = typeDraftItem(item({ text: 'Children' }));
        expect(typed.type).toBe('open');
        expect(typed.uncertain).toBe('no_answer');
        expect(typed.expectedAnswers).toBeUndefined();
    });

    it('keeps the key’s grading note on the typed item', () => {
        const typed = typeDraftItem(
            item({ text: 'Sneakers', answers: ['sportschoenen'], keyNote: 'sneakers niet goedkeuren als vertaling' })
        );
        expect(typed.keyNote).toBe('sneakers niet goedkeuren als vertaling');
    });
});

function draft(overrides: Partial<TestDraft> = {}): TestDraft {
    return {
        title: 'Vocabulary and grammar test',
        sections: [{ title: 'Assignment 1', page: 1 }],
        items: [],
        warnings: [],
        confidence: 'high',
        ...overrides,
    };
}

describe('typeTestDraft', () => {
    it('types every item and keeps its section', () => {
        const typed = typeTestDraft(
            draft({
                items: [
                    item({ text: 'She _____ tall.', blanks: 1, answers: ['is'], sectionIndex: 0 }),
                    item({ text: 'Snor', answers: ['moustache'], sectionIndex: 0 }),
                ],
            })
        );
        expect(typed.items.map((typedItem) => typedItem.type)).toEqual(['cloze', 'short-answer']);
        expect(typed.items.every((typedItem) => typedItem.sectionIndex === 0)).toBe(true);
    });

    it('reports a guessed type against the item a teacher can find on paper', () => {
        const typed = typeTestDraft(draft({ items: [item({ text: 'Pimple', label: 'Assignment 8 · 1' })] }));
        expect(typed.warnings).toContainEqual({
            key: 'importTest.warn_type_uncertain',
            params: { item: 'Assignment 8 · 1', type: 'open' },
        });
    });

    it('counts the gaps a key could not fill', () => {
        const typed = typeTestDraft(
            draft({
                items: [item({ text: '(?) _____ Kate _____ 2 cats?', blanks: 2, gapAnswers: ['Does', 'have', 'x'] })],
            })
        );
        expect(typed.warnings).toContainEqual({
            key: 'importTest.warn_gap_count_mismatch',
            params: { item: 'Assignment 1 · 1', blanks: 2, filled: 0 },
        });
    });

    it('keeps the warnings the detector already raised', () => {
        const typed = typeTestDraft(
            draft({
                items: [item({ text: 'She _____ _____.', blanks: 2, answers: ['is'] })],
                warnings: [{ key: 'importTest.warn_no_sections' }],
            })
        );
        expect(typed.warnings[0]).toEqual({ key: 'importTest.warn_no_sections' });
        expect(typed.warnings.some((warning) => warning.key === 'importTest.warn_type_uncertain')).toBe(true);
    });

    it('does not warn about a draft it typed cleanly', () => {
        const typed = typeTestDraft(draft({ items: [item({ text: 'She _____ tall.', blanks: 1, answers: ['is'] })] }));
        expect(typed.warnings).toEqual([]);
    });

    it('repairs systematically broken ligatures across prompts and headings', () => {
        const broken = 'Gramma6ca and alOjd beva.en HeeD';
        const typed = typeTestDraft(
            draft({
                title: broken,
                sections: [{ title: broken, instruction: broken, page: 1 }],
                items: [item({ text: `${broken} _____ tall.`, blanks: 1, answers: ['is'] })],
            })
        );
        expect(typed.warnings).toContainEqual({ key: 'importTest.warn_ligatures' });
        expect(typed.title).toBe('Grammatica and altijd bevatten Heeft');
        expect(typed.sections[0].title).toBe('Grammatica and altijd bevatten Heeft');
        expect(typed.sections[0].instruction).toBe('Grammatica and altijd bevatten Heeft');
        expect(typed.items[0].prompt.startsWith('Grammatica and altijd bevatten Heeft')).toBe(true);
    });

    it('leaves a document alone when the damage is too rare to be systematic', () => {
        const typed = typeTestDraft(draft({ items: [item({ text: 'HeeD _____ tall.', blanks: 1, answers: ['is'] })] }));
        expect(typed.warnings).toEqual([]);
        expect(typed.items[0].prompt).toBe('HeeD {{is}} tall.');
    });
});
