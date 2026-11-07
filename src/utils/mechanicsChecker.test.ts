import { describe, it, expect } from 'vitest';
import { MECHANICS_RULES, detectMechanics, isMechanicsShorthand } from './mechanicsChecker';

const run = (shorthand: string, text: string) => MECHANICS_RULES[shorthand](text);

describe('mechanicsChecker', () => {
    describe('capital at sentence start', () => {
        it('counts capitalised and lowercase sentence starts', () => {
            expect(run('MECH.CAP.START', 'We went home. it was late! Was it fun? yes.')).toEqual({
                uses: 2,
                mistakes: 2,
            });
        });

        it('does not split after abbreviations or initials', () => {
            expect(run('MECH.CAP.START', 'We need fruit, e.g. apples. J. K. Rowling wrote it.')).toEqual({
                uses: 2,
                mistakes: 0,
            });
        });

        it('treats a single newline as a line wrap and a blank line as a new paragraph', () => {
            expect(run('MECH.CAP.START', 'My holiday was\nvery nice.\n\nthe weather was good.')).toEqual({
                uses: 1,
                mistakes: 1,
            });
        });

        it('skips numbers, brand names and links', () => {
            expect(run('MECH.CAP.START', '3 dogs ran. iPhones are expensive. www.example.com is down.')).toEqual({
                uses: 0,
                mistakes: 0,
            });
        });

        it('looks past opening quotes', () => {
            expect(run('MECH.CAP.START', '"hello," she said.')).toEqual({ uses: 0, mistakes: 1 });
        });

        it('does not flag a speech tag after a quoted question or a continuation after an ellipsis', () => {
            expect(run('MECH.CAP.START', '"Where are you?" she asked.')).toEqual({ uses: 1, mistakes: 0 });
            expect(run('MECH.CAP.START', 'I thought... maybe not. Then I left… and it rained.')).toEqual({
                uses: 2,
                mistakes: 0,
            });
            // Without a closing quote, "?" still ends the sentence.
            expect(run('MECH.CAP.START', 'Where are you? i am here.')).toEqual({ uses: 1, mistakes: 1 });
        });
    });

    describe('capital I', () => {
        it('flags a lowercase pronoun but not i.e. or (i)', () => {
            expect(run('MECH.CAP.I', "I think i'm right, i.e. correct. (i) First point. I've won.")).toEqual({
                uses: 2,
                mistakes: 1,
            });
        });
    });

    describe('capitals for days, months, languages and countries', () => {
        it('counts both forms and leaves ambiguous words alone', () => {
            expect(
                run('MECH.CAP.PROPER', 'On monday in January we spoke english in Spain. I may march in may.')
            ).toEqual({ uses: 2, mistakes: 2 });
        });
    });

    describe('end punctuation', () => {
        it('flags a paragraph whose last sentence has no end mark', () => {
            expect(
                run('MECH.END', 'I like my school a lot. My teacher is always very kind\n\nWe play football every day.')
            ).toEqual({ uses: 2, mistakes: 1 });
        });

        it('ignores titles, short list items and lines ending in a colon', () => {
            const text =
                'My summer holiday in Spain\n\nThese are the things I packed for the trip:\n\napples\n\nWe had fun.';
            expect(run('MECH.END', text)).toEqual({ uses: 1, mistakes: 0 });
        });
    });

    describe('question mark', () => {
        it('flags questions that end in a full stop', () => {
            const text = 'Where do you live. Can you help me? Do it now. When I was young, I lived here.';
            expect(run('MECH.QMARK', text)).toEqual({ uses: 1, mistakes: 1 });
        });

        it("recognises negative inversions such as Don't you", () => {
            expect(run('MECH.QMARK', "Don't you like it. Isn't it great?")).toEqual({ uses: 1, mistakes: 1 });
        });

        it('does not treat pseudo-clefts or conditional inversion as questions', () => {
            const text =
                'What is more, we left early. What is important is that we try. Had he known, he would have come. Were I rich, I would travel. Should you need help, call us.';
            expect(run('MECH.QMARK', text)).toEqual({ uses: 0, mistakes: 0 });
        });
    });

    describe('spacing around punctuation', () => {
        it('flags a space before a mark and a missing space after one', () => {
            expect(run('MECH.SPACE', 'Hello , world.It is late,very late !')).toEqual({ uses: 0, mistakes: 4 });
        });

        it('accepts numbers, ellipses and abbreviations', () => {
            expect(run('MECH.SPACE', 'It cost 1,000 euros at 10:30... The U.S.Army came, e.g.The end.')).toEqual({
                uses: 2,
                mistakes: 0,
            });
        });
    });

    describe('apostrophes in contractions', () => {
        it('counts contractions and flags missing apostrophes, not real words', () => {
            const text = "I don't know. Its true that im tired and dont care. We'll see. Well, I wont go.";
            expect(run('MECH.APOS.CONTR', text)).toEqual({ uses: 2, mistakes: 2 });
        });
    });

    describe('comma after an opening linker', () => {
        it('counts linkers with and without a comma', () => {
            const text =
                'However, it rained. For example we stayed in. In addition to that, we read. As a result of this we slept. Finally!';
            expect(run('MECH.COMMA.LINKER', text)).toEqual({ uses: 1, mistakes: 1 });
        });

        it('ignores however as a degree or manner word, and of course', () => {
            const text =
                'However hard I try, I fail. However you look at it, it is wrong. Of course I will. However I disagree.';
            expect(run('MECH.COMMA.LINKER', text)).toEqual({ uses: 0, mistakes: 1 });
        });
    });

    it('detects only the requested, known shorthands', () => {
        expect(detectMechanics('i went home', ['MECH.CAP.I', 'PASS', 'NOPE'])).toEqual({
            'MECH.CAP.I': { uses: 0, mistakes: 1 },
        });
        expect(isMechanicsShorthand('MECH.END')).toBe(true);
        expect(isMechanicsShorthand('toString')).toBe(false);
    });
});
