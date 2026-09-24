// CEFR levels follow the CEFR-J Grammar Profile conventions (see cefrjGrammar.ts).
// `detectShorthand` links an item to a rule in grammarChecker.ts for auto-detection.
import type { CefrLevel, GrammarCategory, GrammarItem, LinkedFrameworkDescriptor } from '../types';

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
                id: 'gr-present-continuous-negative-question',
                level: 'A2',
                labelEn: "Negative & questions (isn't/aren't … / Is/Are … -ing?)",
                labelNl: "Ontkennend & vragend (isn't/aren't … / Is/Are … -ing?)",
                examplesEn: ["I'm not working", 'Is she working?'],
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
                id: 'gr-past-simple-negative',
                level: 'A2',
                labelEn: "Negative (didn't)",
                labelNl: "Ontkennend (didn't)",
                examplesEn: ["I didn't go", "She didn't see it"],
            },
            {
                id: 'gr-past-simple-question',
                level: 'A2',
                labelEn: 'Questions (Did …?)',
                labelNl: 'Vragend (Did …?)',
                examplesEn: ['Did you see it?', 'Did she call?'],
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
            {
                id: 'gr-past-continuous-negative-question',
                level: 'B1',
                labelEn: "Negative & questions (wasn't/weren't … / Was/Were … -ing?)",
                labelNl: "Ontkennend & vragend (wasn't/weren't … / Was/Were … -ing?)",
                examplesEn: ["I wasn't working", 'Were they playing?'],
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
            {
                id: 'gr-present-perfect-simple-negative-question',
                level: 'B1',
                labelEn: "Simple negative & questions (haven't/hasn't … / Have/Has … ?)",
                labelNl: "Simpel ontkennend & vragend (haven't/hasn't … / Have/Has … ?)",
                examplesEn: ["I haven't finished", 'Has she gone?'],
            },
            {
                id: 'gr-present-perfect-continuous-negative-question',
                level: 'B1',
                labelEn: "Continuous negative & questions (haven't/hasn't been … -ing / Have/Has … been -ing?)",
                labelNl: "Continuous ontkennend & vragend (haven't/hasn't been … -ing / Have/Has … been -ing?)",
                examplesEn: ["I haven't been waiting", 'Has she been working?'],
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
            {
                id: 'gr-past-perfect-simple-negative-question',
                level: 'B2',
                labelEn: "Simple negative & questions (hadn't … / Had … ?)",
                labelNl: "Simpel ontkennend & vragend (hadn't … / Had … ?)",
                examplesEn: ["I hadn't left", 'Had she eaten?'],
            },
            {
                id: 'gr-past-perfect-continuous-negative-question',
                level: 'B2',
                labelEn: "Continuous negative & questions (hadn't been … -ing / Had … been -ing?)",
                labelNl: "Continuous ontkennend & vragend (hadn't been … -ing / Had … been -ing?)",
                examplesEn: ["I hadn't been working", 'Had they been waiting?'],
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
                id: 'gr-future-will-negative-question',
                level: 'A2',
                labelEn: "Will: negative & questions (won't … / Will … ?)",
                labelNl: "Will: ontkennend & vragend (won't … / Will … ?)",
                examplesEn: ["I won't help", 'Will it rain?'],
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
                id: 'gr-future-going-to-negative-question',
                level: 'A2',
                labelEn: "Going to: negative & questions (isn't/aren't going to … / Is/Are … going to … ?)",
                labelNl: "Going to: ontkennend & vragend (isn't/aren't going to … / Is/Are … going to … ?)",
                examplesEn: ["I'm not going to study", 'Is she going to leave?'],
            },
            {
                id: 'gr-future-continuous',
                level: 'B2',
                labelEn: 'Future continuous (will be + -ing)',
                labelNl: 'Future continuous (will be + -ing)',
                examplesEn: ['I will be working'],
            },
            {
                id: 'gr-future-continuous-negative-question',
                level: 'B2',
                labelEn: "Future continuous: negative & questions (won't be … -ing / Will … be … -ing?)",
                labelNl: "Future continuous: ontkennend & vragend (won't be … -ing / Will … be … -ing?)",
                examplesEn: ["I won't be working", 'Will you be waiting?'],
            },
            {
                id: 'gr-future-perfect',
                level: 'B2',
                labelEn: 'Future perfect (will have + past participle)',
                labelNl: 'Future perfect (will have + voltooid deelwoord)',
                examplesEn: ['I will have finished'],
            },
            {
                id: 'gr-future-perfect-negative-question',
                level: 'B2',
                labelEn: "Future perfect: negative & questions (won't have … / Will … have … ?)",
                labelNl: "Future perfect: ontkennend & vragend (won't have … / Will … have … ?)",
                examplesEn: ["I won't have finished", 'Will you have finished?'],
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
            {
                id: 'gr-modals-possibility',
                level: 'B1',
                labelEn: 'Possibility (may / might / could)',
                labelNl: 'Mogelijkheid (may / might / could)',
                examplesEn: ['It may rain', 'She might be at home'],
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
                // detectShorthand shared: the regex can't tell zero and first conditional apart.
                id: 'gr-conditional-zero',
                level: 'A2',
                labelEn: 'Zero conditional (if + present, present)',
                labelNl: 'Nulde conditional (if + present, present)',
                examplesEn: ['If you heat ice, it melts'],
                detectShorthand: 'COND.ZERO_FIRST',
            },
            {
                id: 'gr-conditional-first',
                level: 'B1',
                labelEn: 'First conditional (if + present, will)',
                labelNl: 'Eerste conditional (if + present, will)',
                examplesEn: ['If it rains, I will stay'],
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
            {
                id: 'gr-wish-if-only',
                level: 'B2',
                labelEn: 'Wish / if only + past (present) or past perfect (past)',
                labelNl: 'Wish / if only + past (heden) of past perfect (verleden)',
                examplesEn: ['I wish I were taller', 'If only I had studied'],
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
            {
                id: 'gr-passive-continuous',
                level: 'B2',
                labelEn: 'Continuous passive (is/are/was/were being + past participle)',
                labelNl: 'Continuous lijdende vorm (is/are/was/were being + voltooid deelwoord)',
                examplesEn: ['The house is being built', 'The road was being repaired'],
            },
            {
                id: 'gr-passive-perfect',
                level: 'B2',
                labelEn: 'Perfect passive (has/have/had been + past participle)',
                labelNl: 'Perfect lijdende vorm (has/have/had been + voltooid deelwoord)',
                examplesEn: ['The letter has been sent', 'The work had been finished'],
            },
            {
                id: 'gr-passive-modal',
                level: 'B2',
                labelEn: 'Modal passive (modal + be + past participle)',
                labelNl: 'Modale lijdende vorm (modal + be + voltooid deelwoord)',
                examplesEn: ['It can be done', 'The form must be signed'],
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
            {
                id: 'gr-reported-speech-questions',
                level: 'B1',
                labelEn: 'Reported questions (asked if/whether … / asked where …)',
                labelNl: 'Indirecte vragen (asked if/whether … / asked where …)',
                examplesEn: ['He asked if I was ready', 'She asked where I lived'],
            },
            {
                id: 'gr-reported-speech-commands',
                level: 'B1',
                labelEn: 'Reported commands & requests (told/asked + to-infinitive)',
                labelNl: 'Indirecte bevelen & verzoeken (told/asked + to-infinitief)',
                examplesEn: ['She told me to sit down', 'He asked her not to leave'],
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
            {
                id: 'gr-relative-clause-defining-nondefining',
                level: 'B2',
                labelEn: 'Defining vs. non-defining relative clauses (commas)',
                labelNl: 'Bepalende vs. niet-bepalende bijzinnen (komma’s)',
                examplesEn: [
                    'The woman who lives next door is a doctor',
                    'My brother, who lives in Spain, is visiting',
                ],
            },
            {
                id: 'gr-relative-clause-omission',
                level: 'B2',
                labelEn: 'Omitting the relative pronoun (object relative clauses)',
                labelNl: 'Weglaten van het betrekkelijk voornaamwoord (lijdend-voorwerp bijzinnen)',
                examplesEn: ['the book I read', 'the man I met'],
            },
            {
                id: 'gr-relative-clause-where-when',
                level: 'B1',
                labelEn: 'Relative adverbs (where / when / why)',
                labelNl: 'Betrekkelijke bijwoorden (where / when / why)',
                examplesEn: ['the city where I was born', 'the day when we met'],
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
            {
                id: 'gr-conjunctions-coordinating',
                level: 'A1',
                labelEn: 'Coordinating conjunctions (and / but / or / so)',
                labelNl: 'Nevenschikkende voegwoorden (and / but / or / so)',
                examplesEn: ['I like tea and coffee', 'It was late, so we left'],
            },
            {
                id: 'gr-embedded-questions',
                level: 'B2',
                labelEn: 'Embedded / indirect questions (I wonder if / Do you know what …)',
                labelNl: 'Ingebedde / indirecte vragen (I wonder if / Do you know what …)',
                examplesEn: ['I wonder if she called', 'Do you know what time it is?'],
            },
            {
                id: 'gr-clause-time',
                level: 'B1',
                labelEn: 'Time clauses (when / while / before / after / until / as soon as)',
                labelNl: 'Tijdsbijzinnen (when / while / before / after / until / as soon as)',
                examplesEn: ['I will call you when I arrive', 'Wait until it stops raining'],
            },
            {
                id: 'gr-clause-purpose',
                level: 'B1',
                labelEn: 'Purpose clauses (to / in order to / so that)',
                labelNl: 'Doelbijzinnen (to / in order to / so that)',
                examplesEn: ['She left early to catch the train', 'He saved money so that he could travel'],
            },
            {
                id: 'gr-clause-result',
                level: 'B2',
                labelEn: 'Result clauses (so … that / such … that)',
                labelNl: 'Gevolgbijzinnen (so … that / such … that)',
                examplesEn: ['It was so cold that we stayed in', 'It was such a good film that we watched it twice'],
            },
            {
                id: 'gr-inversion',
                level: 'C1',
                labelEn: 'Inversion after negative adverbials (Never have I … / Hardly had she …)',
                labelNl: 'Inversie na negatieve bijwoorden (Never have I … / Hardly had she …)',
                examplesEn: ['Never have I seen such a mess', 'Hardly had she left when it started raining'],
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
            {
                id: 'gr-gerund-vs-infinitive',
                level: 'B2',
                labelEn: 'Gerund vs. to-infinitive (verbs that change meaning: stop, remember, try)',
                labelNl: 'Gerundium vs. to-infinitief (werkwoorden die van betekenis veranderen: stop, remember, try)',
                examplesEn: ['I stopped to smoke', 'I stopped smoking'],
            },
            {
                id: 'gr-causative',
                level: 'B2',
                labelEn: 'Causative (have / get something done)',
                labelNl: 'Causatief (have / get something done)',
                examplesEn: ['I had my hair cut', 'She got her car fixed'],
            },
            {
                id: 'gr-causative-make-let-have',
                level: 'B1',
                labelEn: 'Make / let / have + person + bare infinitive',
                labelNl: 'Make / let / have + persoon + kale infinitief',
                examplesEn: ['She made him apologize', 'They let us leave early'],
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
            {
                id: 'gr-comparison-equality',
                level: 'A2',
                labelEn: 'Comparison of equality (as … as / not as … as)',
                labelNl: 'Vergelijking van gelijkheid (as … as / not as … as)',
                examplesEn: ['She is as tall as her brother', "It isn't as easy as it looks"],
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
            {
                id: 'gr-quantifiers-all-every-each',
                level: 'A2',
                labelEn: 'All / every / each',
                labelNl: 'All / every / each',
                examplesEn: ['All students passed', 'Every student passed', 'Each student got a book'],
            },
            {
                id: 'gr-existential-there',
                level: 'A1',
                labelEn: 'There is / there are',
                labelNl: 'There is / there are',
                examplesEn: ['There is a cat on the roof', 'There are two books on the table'],
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
                id: 'gr-countable-uncountable',
                level: 'A2',
                labelEn: 'Countable & uncountable nouns',
                labelNl: 'Telbare & ontelbare zelfstandige naamwoorden',
                examplesEn: ['one apple, two apples', 'some water, some information'],
            },
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
            {
                id: 'gr-pronouns-indefinite',
                level: 'A2',
                labelEn: 'Indefinite pronouns (someone / anything / nobody / everyone)',
                labelNl: 'Onbepaalde voornaamwoorden (someone / anything / nobody / everyone)',
                examplesEn: ['Someone called', "There's nothing to do", 'Everyone agreed'],
            },
            {
                id: 'gr-pronouns-reciprocal',
                level: 'A2',
                labelEn: 'Reciprocal pronouns (each other / one another)',
                labelNl: 'Wederkerige voornaamwoorden (each other / one another)',
                examplesEn: ['They helped each other', 'We should trust one another'],
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
            {
                id: 'gr-participle-adjectives',
                level: 'B1',
                labelEn: '-ed / -ing adjectives (bored / boring)',
                labelNl: '-ed / -ing bijvoeglijke naamwoorden (bored / boring)',
                examplesEn: ['I was bored', 'The film was boring'],
            },
            {
                id: 'gr-too-enough',
                level: 'B1',
                labelEn: 'Too / enough + infinitive',
                labelNl: 'Too / enough + infinitief',
                examplesEn: ['too tired to walk', 'old enough to drive'],
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
            {
                id: 'gr-imperative',
                level: 'A1',
                labelEn: 'Imperative (affirmative & negative)',
                labelNl: 'Gebiedende wijs (bevestigend & ontkennend)',
                examplesEn: ['Close the door', "Don't touch that"],
            },
        ],
    },
    {
        id: 'past-habits',
        labelEn: 'Past Habits',
        labelNl: 'Gewoontes in het verleden',
        color: '#c084fc',
        items: [
            {
                id: 'gr-used-to',
                level: 'A2',
                labelEn: 'Used to (for past habits & states)',
                labelNl: 'Used to (voor gewoontes & toestanden in het verleden)',
                examplesEn: ['I used to play football', 'She used to live in Paris'],
            },
            {
                id: 'gr-would-habitual',
                level: 'B1',
                labelEn: 'Would (for repeated past actions)',
                labelNl: 'Would (voor herhaalde handelingen in het verleden)',
                examplesEn: ['Every summer we would go to the beach'],
            },
        ],
    },
];

export function getGrammarItems(filters?: { level?: CefrLevel }): GrammarItem[] {
    const all = GRAMMAR_CATEGORIES.flatMap((c) => c.items);
    if (!filters?.level) return all;
    return all.filter((item) => item.level === filters.level);
}

/**
 * Ids retired when a combined descriptor was split into two narrower ones, mapped to
 * one surviving id so already-saved links (question banks, flashcards) keep resolving
 * instead of silently going blank. Picking one side of a split is inherently lossy.
 */
const LEGACY_ITEM_ID_ALIASES: Record<string, string> = {
    'gr-past-simple-negative-question': 'gr-past-simple-negative',
    'gr-future-continuous-perfect': 'gr-future-continuous',
    'gr-conditional-zero-first': 'gr-conditional-zero',
};

/** Resolves a possibly-retired grammar item id to its current, pickable id (a no-op for current ids). */
export function resolveGrammarItemId(id: string): string {
    return LEGACY_ITEM_ID_ALIASES[id] ?? id;
}

/** Builds the CefrPickerModal grammar-tab shape for a GrammarItem.id, for migrating a legacy linkedGrammarItemId. */
export function grammarItemToFrameworkDescriptor(id: string): LinkedFrameworkDescriptor | undefined {
    const resolvedId = resolveGrammarItemId(id);
    for (const category of GRAMMAR_CATEGORIES) {
        const item = category.items.find((i) => i.id === resolvedId);
        if (item) {
            return {
                descriptorId: item.id,
                framework: 'grammar',
                categoryId: category.id,
                categoryLabelEn: category.labelEn,
                categoryLabelNl: category.labelNl,
                categoryColor: category.color,
                descriptionEn: item.labelEn,
                descriptionNl: item.labelNl,
                level: item.level,
            };
        }
    }
    return undefined;
}

export function getGrammarItemById(id: string): GrammarItem | undefined {
    const resolvedId = resolveGrammarItemId(id);
    for (const category of GRAMMAR_CATEGORIES) {
        const found = category.items.find((item) => item.id === resolvedId);
        if (found) return found;
    }
    return undefined;
}
