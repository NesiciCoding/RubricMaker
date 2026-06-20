// CEFR levels follow the CEFR-J Grammar Profile conventions (see cefrjGrammar.ts).
// `detectShorthand` links an item to a rule in grammarChecker.ts for auto-detection.
import type { CefrLevel, GrammarCategory, GrammarItem } from '../types';

export const GRAMMAR_CATEGORIES: GrammarCategory[] = [
    {
        id: 'present-simple',
        labelEn: 'Present Simple',
        labelNl: 'Tegenwoordige tijd (Present Simple)',
        color: '#3b82f6',
        items: [
            {
                id: 'gr-present-simple-affirmative',
                level: 'A1',
                labelEn: 'Affirmative (I work, she works)',
                labelNl: 'Bevestigend (I work, she works)',
                examplesEn: ['I work', 'she works', 'they live'],
            },
            {
                id: 'gr-present-simple-negative',
                level: 'A1',
                labelEn: "Negative (don't / doesn't)",
                labelNl: "Ontkennend (don't / doesn't)",
                examplesEn: ["I don't work", "she doesn't live"],
            },
            {
                id: 'gr-present-simple-question',
                level: 'A1',
                labelEn: 'Questions (Do / Does …?)',
                labelNl: 'Vragend (Do / Does …?)',
                examplesEn: ['Do you work?', 'Does she live here?'],
            },
            {
                id: 'gr-present-simple-third-person',
                level: 'A1',
                labelEn: 'Third person -s',
                labelNl: 'Derde persoon -s',
                examplesEn: ['he plays', 'she watches'],
            },
        ],
    },
    {
        id: 'present-continuous',
        labelEn: 'Present Continuous',
        labelNl: 'Present Continuous',
        color: '#2563eb',
        items: [
            {
                id: 'gr-present-continuous-affirmative',
                level: 'A1',
                labelEn: 'Affirmative (am/is/are + -ing)',
                labelNl: 'Bevestigend (am/is/are + -ing)',
                examplesEn: ['I am working', 'they are playing'],
                detectShorthand: 'PRES.PROG',
            },
            {
                id: 'gr-present-continuous-vs-simple',
                level: 'A2',
                labelEn: 'Contrast with Present Simple',
                labelNl: 'Contrast met Present Simple',
            },
        ],
    },
    {
        id: 'past-simple',
        labelEn: 'Past Simple',
        labelNl: 'Verleden tijd (Past Simple)',
        color: '#8b5cf6',
        items: [
            {
                id: 'gr-past-simple-regular',
                level: 'A1',
                labelEn: 'Regular verbs (-ed)',
                labelNl: 'Regelmatige werkwoorden (-ed)',
                examplesEn: ['walked', 'played', 'looked'],
                detectShorthand: 'PAST.SIMPLE.REG',
            },
            {
                id: 'gr-past-simple-irregular',
                level: 'A2',
                labelEn: 'Irregular verbs',
                labelNl: 'Onregelmatige werkwoorden',
                examplesEn: ['went', 'saw', 'did', 'took'],
                detectShorthand: 'PAST.SIMPLE.IRREG',
            },
            {
                id: 'gr-past-simple-negative-question',
                level: 'A2',
                labelEn: 'Negatives & questions (did / didn’t)',
                labelNl: 'Ontkennend & vragend (did / didn’t)',
                examplesEn: ["I didn't go", 'Did you see it?'],
            },
        ],
    },
    {
        id: 'past-continuous',
        labelEn: 'Past Continuous',
        labelNl: 'Past Continuous',
        color: '#7c3aed',
        items: [
            {
                id: 'gr-past-continuous',
                level: 'A2',
                labelEn: 'Was/were + -ing',
                labelNl: 'Was/were + -ing',
                examplesEn: ['I was working', 'they were playing'],
                detectShorthand: 'TA.PASTPRG',
            },
        ],
    },
    {
        id: 'present-perfect',
        labelEn: 'Present Perfect',
        labelNl: 'Present Perfect',
        color: '#0ea5e9',
        items: [
            {
                id: 'gr-present-perfect-simple',
                level: 'B1',
                labelEn: 'Simple (have/has + past participle)',
                labelNl: 'Simpel (have/has + voltooid deelwoord)',
                examplesEn: ['I have finished', 'she has gone'],
                detectShorthand: 'TA.PRPF',
            },
            {
                id: 'gr-present-perfect-continuous',
                level: 'B1',
                labelEn: 'Continuous (have/has been + -ing)',
                labelNl: 'Continuous (have/has been + -ing)',
                examplesEn: ['I have been waiting'],
                detectShorthand: 'TA.PRPFPRG',
            },
        ],
    },
    {
        id: 'past-perfect',
        labelEn: 'Past Perfect',
        labelNl: 'Past Perfect',
        color: '#06b6d4',
        items: [
            {
                id: 'gr-past-perfect-simple',
                level: 'B1',
                labelEn: 'Simple (had + past participle)',
                labelNl: 'Simpel (had + voltooid deelwoord)',
                examplesEn: ['I had left', 'they had eaten'],
                detectShorthand: 'TA.PASTPF',
            },
            {
                id: 'gr-past-perfect-continuous',
                level: 'B2',
                labelEn: 'Continuous (had been + -ing)',
                labelNl: 'Continuous (had been + -ing)',
                examplesEn: ['I had been working'],
                detectShorthand: 'TA.PASTPFPRG',
            },
        ],
    },
    {
        id: 'future',
        labelEn: 'Future Forms',
        labelNl: 'Toekomende tijd',
        color: '#14b8a6',
        items: [
            {
                id: 'gr-future-will',
                level: 'A2',
                labelEn: 'Will + infinitive',
                labelNl: 'Will + infinitief',
                examplesEn: ['I will help', 'it will rain'],
                detectShorthand: 'FUT.WILL',
            },
            {
                id: 'gr-future-going-to',
                level: 'A2',
                labelEn: 'Going to',
                labelNl: 'Going to',
                examplesEn: ['I am going to study', 'she is going to leave'],
                detectShorthand: 'FUT.GOING',
            },
            {
                id: 'gr-future-continuous-perfect',
                level: 'B2',
                labelEn: 'Future continuous / perfect',
                labelNl: 'Future continuous / perfect',
                examplesEn: ['I will be working', 'I will have finished'],
            },
        ],
    },
    {
        id: 'modals',
        labelEn: 'Modal Verbs',
        labelNl: 'Modale werkwoorden',
        color: '#f97316',
        items: [
            {
                id: 'gr-modals-ability',
                level: 'A2',
                labelEn: 'Ability (can / could)',
                labelNl: 'Kunnen (can / could)',
                examplesEn: ['I can swim', 'she could read'],
                detectShorthand: 'MOD.CAN',
            },
            {
                id: 'gr-modals-obligation-advice',
                level: 'B1',
                labelEn: 'Obligation & advice (should / must / would / might)',
                labelNl: 'Verplichting & advies (should / must / would / might)',
                examplesEn: ['You should rest', 'I must go'],
                detectShorthand: 'MOD.SHOULD',
            },
            {
                id: 'gr-modals-deduction',
                level: 'B2',
                labelEn: 'Deduction (must have / can’t have)',
                labelNl: 'Conclusie (must have / can’t have)',
                examplesEn: ['She must have left', "It can't have been him"],
            },
        ],
    },
    {
        id: 'conditionals',
        labelEn: 'Conditionals',
        labelNl: 'Voorwaardelijke zinnen',
        color: '#eab308',
        items: [
            {
                id: 'gr-conditional-zero-first',
                level: 'B1',
                labelEn: 'Zero / first conditional',
                labelNl: 'Nulde / eerste conditional',
                examplesEn: ['If you heat ice, it melts', 'If it rains, I will stay'],
                detectShorthand: 'COND.ZERO_FIRST',
            },
            {
                id: 'gr-conditional-second',
                level: 'B1',
                labelEn: 'Second conditional',
                labelNl: 'Tweede conditional',
                examplesEn: ['If I were rich, I would travel'],
                detectShorthand: 'COND.SECOND',
            },
            {
                id: 'gr-conditional-third',
                level: 'B2',
                labelEn: 'Third conditional',
                labelNl: 'Derde conditional',
                examplesEn: ['If I had known, I would have come'],
                detectShorthand: 'COND.THIRD',
            },
        ],
    },
    {
        id: 'passive',
        labelEn: 'Passive Voice',
        labelNl: 'Lijdende vorm',
        color: '#ef4444',
        items: [
            {
                id: 'gr-passive',
                level: 'B1',
                labelEn: 'Be + past participle',
                labelNl: 'Be + voltooid deelwoord',
                examplesEn: ['The book was written', 'It is made by hand'],
                detectShorthand: 'PASS',
            },
        ],
    },
    {
        id: 'reported-speech',
        labelEn: 'Reported Speech',
        labelNl: 'Indirecte rede',
        color: '#ec4899',
        items: [
            {
                id: 'gr-reported-speech',
                level: 'B1',
                labelEn: 'Reporting verbs + that-clause',
                labelNl: 'Rapporterende werkwoorden + that-zin',
                examplesEn: ['She said that she was tired', 'He told me he would call'],
                detectShorthand: 'REP.SPEECH',
            },
        ],
    },
    {
        id: 'relative-clauses',
        labelEn: 'Relative Clauses',
        labelNl: 'Betrekkelijke bijzinnen',
        color: '#22c55e',
        items: [
            {
                id: 'gr-relative-clause',
                level: 'B1',
                labelEn: 'Relative pronouns (who / which / that / whose)',
                labelNl: 'Betrekkelijke voornaamwoorden (who / which / that / whose)',
                examplesEn: ['the man who called', 'the book that I read'],
                detectShorthand: 'REL.CLAUSE',
            },
        ],
    },
    {
        id: 'clauses',
        labelEn: 'Linking & Subordinate Clauses',
        labelNl: 'Verbindende & bijzinnen',
        color: '#10b981',
        items: [
            {
                id: 'gr-clause-cause-result',
                level: 'B1',
                labelEn: 'Cause / result (because / therefore)',
                labelNl: 'Oorzaak / gevolg (because / therefore)',
                examplesEn: ['I stayed because it rained', 'It was late; therefore we left'],
                detectShorthand: 'CAUS.CLAUSE',
            },
            {
                id: 'gr-clause-concession',
                level: 'B2',
                labelEn: 'Concession (although / despite / whereas)',
                labelNl: 'Toegeving (although / despite / whereas)',
                examplesEn: ['Although it was hard, she finished'],
                detectShorthand: 'CONC.CLAUSE',
            },
            {
                id: 'gr-cleft',
                level: 'B2',
                labelEn: 'Cleft sentences (It was … that …)',
                labelNl: 'Cleft-zinnen (It was … that …)',
                examplesEn: ['It was John that broke it'],
                detectShorthand: 'CLEFT',
            },
        ],
    },
    {
        id: 'verb-patterns',
        labelEn: 'Verb Patterns',
        labelNl: 'Werkwoordpatronen',
        color: '#a855f7',
        items: [
            {
                id: 'gr-infinitive-clause',
                level: 'B1',
                labelEn: 'Verb + to-infinitive',
                labelNl: 'Werkwoord + to-infinitief',
                examplesEn: ['I want to go', 'she decided to stay'],
                detectShorthand: 'INF.CLAUSE',
            },
            {
                id: 'gr-gerund',
                level: 'B1',
                labelEn: 'Gerund (verb + -ing)',
                labelNl: 'Gerundium (werkwoord + -ing)',
                examplesEn: ['I enjoy reading', 'they avoid eating late'],
            },
        ],
    },
    {
        id: 'comparatives',
        labelEn: 'Comparatives & Superlatives',
        labelNl: 'Vergrotende & overtreffende trap',
        color: '#84cc16',
        items: [
            {
                id: 'gr-comparative',
                level: 'A2',
                labelEn: 'Comparative (-er / more)',
                labelNl: 'Vergrotende trap (-er / more)',
                examplesEn: ['bigger', 'more interesting'],
                detectShorthand: 'COMP.ADJ',
            },
            {
                id: 'gr-superlative',
                level: 'A2',
                labelEn: 'Superlative (-est / most)',
                labelNl: 'Overtreffende trap (-est / most)',
                examplesEn: ['the biggest', 'the most interesting'],
                detectShorthand: 'SUP.ADJ',
            },
        ],
    },
    {
        id: 'articles-determiners',
        labelEn: 'Articles & Determiners',
        labelNl: 'Lidwoorden & determinatoren',
        color: '#64748b',
        items: [
            {
                id: 'gr-articles-indefinite',
                level: 'A1',
                labelEn: 'Indefinite article (a / an)',
                labelNl: 'Onbepaald lidwoord (a / an)',
                examplesEn: ['a dog', 'an apple'],
                detectShorthand: 'ART.INDEF',
            },
            {
                id: 'gr-articles-definite',
                level: 'A1',
                labelEn: 'Definite article (the)',
                labelNl: 'Bepaald lidwoord (the)',
                examplesEn: ['the sun', 'the book'],
            },
            {
                id: 'gr-quantifiers',
                level: 'A2',
                labelEn: 'Quantifiers (some / any / much / many)',
                labelNl: 'Hoeveelheidswoorden (some / any / much / many)',
                examplesEn: ['some water', 'many books', 'any ideas'],
            },
        ],
    },
    {
        id: 'nouns',
        labelEn: 'Nouns & Plurals',
        labelNl: 'Zelfstandige naamwoorden & meervoud',
        color: '#94a3b8',
        items: [
            {
                id: 'gr-plurals-regular',
                level: 'A1',
                labelEn: 'Regular plurals (-s / -es)',
                labelNl: 'Regelmatig meervoud (-s / -es)',
                examplesEn: ['cats', 'boxes'],
            },
            {
                id: 'gr-plurals-irregular',
                level: 'A2',
                labelEn: 'Irregular plurals',
                labelNl: 'Onregelmatig meervoud',
                examplesEn: ['children', 'men', 'feet'],
            },
            {
                id: 'gr-possessive',
                level: 'A2',
                labelEn: 'Possessive (’s / of)',
                labelNl: 'Bezit (’s / of)',
                examplesEn: ["the dog's tail", 'the leg of the table'],
            },
        ],
    },
    {
        id: 'pronouns',
        labelEn: 'Pronouns',
        labelNl: 'Voornaamwoorden',
        color: '#6366f1',
        items: [
            {
                id: 'gr-pronouns-personal',
                level: 'A1',
                labelEn: 'Personal & object pronouns',
                labelNl: 'Persoonlijke & lijdend-voorwerp voornaamwoorden',
                examplesEn: ['I / me', 'he / him', 'they / them'],
            },
            {
                id: 'gr-pronouns-possessive',
                level: 'A2',
                labelEn: 'Possessive pronouns & adjectives',
                labelNl: 'Bezittelijke voornaamwoorden',
                examplesEn: ['my / mine', 'her / hers'],
            },
            {
                id: 'gr-pronouns-relative',
                level: 'B1',
                labelEn: 'Reflexive pronouns',
                labelNl: 'Wederkerende voornaamwoorden',
                examplesEn: ['myself', 'themselves'],
            },
        ],
    },
    {
        id: 'adjectives-adverbs',
        labelEn: 'Adjectives & Adverbs',
        labelNl: 'Bijvoeglijke & bijwoorden',
        color: '#f59e0b',
        items: [
            {
                id: 'gr-adjective-order',
                level: 'B1',
                labelEn: 'Adjective order',
                labelNl: 'Volgorde van bijvoeglijke naamwoorden',
                examplesEn: ['a big red ball'],
            },
            {
                id: 'gr-adverbs-manner',
                level: 'A2',
                labelEn: 'Adverbs of manner (-ly)',
                labelNl: 'Bijwoorden van wijze (-ly)',
                examplesEn: ['quickly', 'carefully'],
            },
        ],
    },
    {
        id: 'prepositions',
        labelEn: 'Prepositions',
        labelNl: 'Voorzetsels',
        color: '#0d9488',
        items: [
            {
                id: 'gr-prepositions-time-place',
                level: 'A1',
                labelEn: 'Prepositions of time & place (in / on / at)',
                labelNl: 'Voorzetsels van tijd & plaats (in / on / at)',
                examplesEn: ['in May', 'on Monday', 'at home'],
            },
            {
                id: 'gr-prepositions-movement',
                level: 'A2',
                labelEn: 'Prepositions of movement',
                labelNl: 'Voorzetsels van beweging',
                examplesEn: ['into', 'across', 'towards'],
            },
        ],
    },
    {
        id: 'questions-negation',
        labelEn: 'Questions & Negation',
        labelNl: 'Vragen & ontkenning',
        color: '#d946ef',
        items: [
            {
                id: 'gr-wh-questions',
                level: 'A1',
                labelEn: 'Wh- questions',
                labelNl: 'Wh-vragen',
                examplesEn: ['What is this?', 'Where do you live?'],
            },
            {
                id: 'gr-question-tags',
                level: 'B1',
                labelEn: 'Question tags',
                labelNl: 'Question tags',
                examplesEn: ["It's cold, isn't it?", "You like it, don't you?"],
            },
        ],
    },
];

export function getGrammarItems(filters?: { level?: CefrLevel }): GrammarItem[] {
    const all = GRAMMAR_CATEGORIES.flatMap((c) => c.items);
    if (!filters?.level) return all;
    return all.filter((item) => item.level === filters.level);
}

export function getGrammarItemById(id: string): GrammarItem | undefined {
    for (const category of GRAMMAR_CATEGORIES) {
        const found = category.items.find((item) => item.id === id);
        if (found) return found;
    }
    return undefined;
}
