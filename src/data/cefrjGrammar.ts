// CEFR-J Grammar Profile
// Source: Open Language Profiles / Tono Laboratory, Tokyo University of Foreign Studies
// License: Free for educational and commercial use with attribution
// https://github.com/openlanguageprofiles/olp-en-cefrj
import type { CefrjGrammarItem } from '../types';

export const CEFRJ_GRAMMAR: CefrjGrammarItem[] = [
    {
        label: 'I am',
        level: 'A1',
        shorthand: 'PP.I_am',
    },
    {
        label: 'I am not',
        level: 'A1',
        shorthand: 'PP.I_am_not',
    },
    {
        label: 'Am I ...?',
        level: 'A1',
        shorthand: 'PP.am_I',
    },
    {
        label: 'Am I not ...?',
        level: 'A1',
        shorthand: 'PP.am_I_not',
    },
    {
        label: 'You are',
        level: 'A1',
        shorthand: 'PP.you_are',
    },
    {
        label: 'You are not',
        level: 'A1',
        shorthand: 'PP.you_are_not',
    },
    {
        label: 'Are you ...?',
        level: 'A1',
        shorthand: 'PP.are_you',
    },
    {
        label: "Aren't you ...?",
        level: 'A1',
        shorthand: "PP.aren't_you",
    },
    {
        label: 'he/she is',
        level: 'A1',
        shorthand: 'PP.he.she_is',
    },
    {
        label: 'he/she is not',
        level: 'A1',
        shorthand: 'PP.he.she_is_not',
    },
    {
        label: 'Is he/she ...?',
        level: 'A1',
        shorthand: 'PP.is_he.she',
    },
    {
        label: "Isn't he/she ...?",
        level: 'A1',
        shorthand: "PP.isn't_he.she",
    },
    {
        label: 'we are',
        level: 'A1',
        shorthand: 'PP.we_are',
    },
    {
        label: 'we are not',
        level: 'A1',
        shorthand: 'PP.we_are_not',
    },
    {
        label: 'Are we ...?',
        level: 'A1',
        shorthand: 'PP.are_we',
    },
    {
        label: "Aren't we ...?",
        level: 'A1',
        shorthand: "PP.aren't_we",
    },
    {
        label: 'they are',
        level: 'A1',
        shorthand: 'PP.they_are',
    },
    {
        label: 'they are not',
        level: 'A1',
        shorthand: 'PP.they_are_not',
    },
    {
        label: 'Are they ...?',
        level: 'A1',
        shorthand: 'PP.are_they',
    },
    {
        label: "Aren't they ...?",
        level: 'A1',
        shorthand: "PP.aren't_they",
    },
    {
        label: "my/our/your/her/their (except for 'his' and 'its')",
        level: 'A1',
        shorthand: 'PGEN',
    },
    {
        label: "me/us/him/her/them (except for 'you' and 'it')",
        level: 'A1',
        shorthand: 'PPO',
    },
    {
        label: 'This/That is',
        level: 'A1',
        shorthand: 'DT.this.that_is',
    },
    {
        label: 'This/That is not',
        level: 'A1',
        shorthand: 'DT.this.that_is_not',
    },
    {
        label: 'Is this/that ...?',
        level: 'A1',
        shorthand: 'DT.is_this.that',
    },
    {
        label: "Isn't this/that ...?",
        level: 'A1',
        shorthand: "DT.isn't_this.that",
    },
    {
        label: 'These/Those are',
        level: 'A1',
        shorthand: 'DT.these.those_are',
    },
    {
        label: 'These/Those are not',
        level: 'A1',
        shorthand: 'DT.these.those_are_not',
    },
    {
        label: 'Are these/those ...?',
        level: 'A1',
        shorthand: 'DT.are_these.those',
    },
    {
        label: "Aren't these/those ...?",
        level: 'A1',
        shorthand: "DT.aren't_these.those",
    },
    {
        label: 'It is',
        level: 'A1',
        shorthand: 'PP.it_is',
    },
    {
        label: 'It is not',
        level: 'A1',
        shorthand: 'PP.it_is_not',
    },
    {
        label: 'Is it ...?',
        level: 'A1',
        shorthand: 'PP.is_it',
    },
    {
        label: "Isn't it ...?",
        level: 'A1',
        shorthand: "PP.isn't_it",
    },
    {
        label: 'This/That N',
        level: 'A1',
        shorthand: 'DT.this.that_N',
    },
    {
        label: 'These/Those N',
        level: 'A1',
        shorthand: 'DT.these.those_N',
    },
    {
        label: 'INDEFINITE ARTICLES',
        level: 'A1',
        shorthand: 'DT.a.an',
    },
    {
        label: 'DEFINITE ARTICLES',
        level: 'A1',
        shorthand: 'DT.the',
    },
    {
        label: 'DETERMINERS: some/any',
        level: 'A1',
        shorthand: 'DT.some.any',
    },
    {
        label: 'DETERMINER: no',
        level: 'A1',
        shorthand: 'DT.no',
    },
    {
        label: 'DETERMINER: another',
        level: 'A2',
        shorthand: 'DT.another',
    },
    {
        label: 'much UNCOUNTABLE NOUN',
        level: 'A2',
        shorthand: 'QUANT.much',
    },
    {
        label: 'little UNCOUNTABLE NOUN',
        level: 'A2',
        shorthand: 'QUANT.little',
    },
    {
        label: 'few PLURAL NOUN',
        level: 'A2',
        shorthand: 'QUANT.few',
    },
    {
        label: 'PREPOSITIONS',
        level: 'A1',
        shorthand: 'IN.PREP.GENERAL',
    },
    {
        label: "POSSESSIVE PRONOUNS (except for 'his' and 'its')",
        level: 'A1',
        shorthand: 'PPOS.mine.etc',
    },
    {
        label: 'REFLEXIVE PRONOUNS',
        level: 'B1',
        shorthand: 'PREFL.oneself.etc',
    },
    {
        label: 'INDEFINITE PRONOUNS',
        level: 'A1',
        shorthand: 'PIND.nobody.anything.etc',
    },
    {
        label: "INDEFINITE PRONOUN/PROP-WORDS: ones (except for 'one')",
        level: 'A2',
        shorthand: 'PIND.ones',
    },
    {
        label: 'INDEFINITE PRONOUN: none',
        level: 'A2',
        shorthand: 'PIND.none',
    },
    {
        label: 'RECIPROCAL PRONOUN: each other',
        level: 'B1',
        shorthand: 'PREF.each_other',
    },
    {
        label: "PRONOUN: others (excluding 'the",
        level: 'B1',
        shorthand: 'P.others',
    },
    {
        label: '-thing ADJ',
        level: 'B1',
        shorthand: 'NN.thing_JJ',
    },
    {
        label: 'ADVERBS OF FREQUENCY: always/usually/often/frequently/occasionally/sometimes/rarely',
        level: 'A1',
        shorthand: 'RB.FRQ',
    },
    {
        label: 'ADVERBS: INTENSIFIERS: extremely/greatly/really/so/terribly/too/unbelievably/very',
        level: 'A2',
        shorthand: 'RB.INT',
    },
    {
        label: 'ADVERBS OF ATTITUDES: apparently/clearly/fortunately/frankly/unfortunately',
        level: 'A2',
        shorthand: 'RB.ATT',
    },
    {
        label: 'ADVERBS OF NEGATION: never',
        level: 'A1',
        shorthand: 'RB.NEG',
    },
    {
        label: 'COMPARISON OF EQUALITY: as ... as',
        level: 'B2',
        shorthand: 'COMP.EQ.as_as',
    },
    {
        label: 'COMPARATIVE OF SUPERIORITY: -er',
        level: 'A1',
        shorthand: 'COMP.JJR.RBR.er',
    },
    {
        label: 'COMPARATIVE OF SUPERIORITY: more+ADJ/ADV',
        level: 'A2',
        shorthand: 'COMP.JJR.RBR.more',
    },
    {
        label: 'SUPERLATIVE OF SUPERIORITY: -est',
        level: 'A1',
        shorthand: 'COMP.JJS.RBS.est',
    },
    {
        label: 'SUPERLATIVE OF SUPERIORITY: most+ADJ/ADV',
        level: 'A2',
        shorthand: 'COMP.JJS.RBS.most',
    },
    {
        label: 'COMPARATIVE/SUPERLATIVE OF INFERIORITY',
        level: 'B2',
        shorthand: 'COMP.INFER',
    },
    {
        label: "ADJ/ADV enough (except for 'not enough')",
        level: 'B2',
        shorthand: 'RBDEG.enough',
    },
    {
        label: 'too ADJ/ADV to+INFINITIVE',
        level: 'B1',
        shorthand: 'RBDEG.too_to',
    },
    {
        label: 'such (a/an) ADJ NOUN',
        level: 'B2',
        shorthand: 'RBDEG.such_JJ',
    },
    {
        label: '"the COMPARATIVE (...)',
        level: 'B2',
        shorthand: 'COMP.the_the',
    },
    {
        label: 'INTENSIFIED COMPARATIVES: a lot/by far/even/far/much/still',
        level: 'B1',
        shorthand: 'COMP.even_JJR.RBR',
    },
    {
        label: 'do/does DO',
        level: 'B2',
        shorthand: 'V.INT.do_does',
    },
    {
        label: 'PHRASAL VERBS (V+PARTICLE)',
        level: 'A2',
        shorthand: 'PHV.V_PART',
    },
    {
        label: 'PHRASAL VERBS (V+NP+PARTICLE)',
        level: 'A2',
        shorthand: 'PHV.V_NP_PART',
    },
    {
        label: 'PHRASAL VERBS (V+PARTICLE+PREP+NP)',
        level: 'B2',
        shorthand: 'PHV.V_PART_PREP',
    },
    {
        label: 'TENSE/ASPECT: PRESENT (BE)',
        level: 'A1',
        shorthand: 'TA.PRESENT.be.AFF',
    },
    {
        label: 'TENSE/ASPECT: PRESENT (BE)',
        level: 'A1',
        shorthand: 'TA.PRESENT.be.NEG',
    },
    {
        label: 'TENSE/ASPECT: PRESENT (BE)',
        level: 'A1',
        shorthand: 'TA.PRESENT.be.INT.AFF',
    },
    {
        label: 'TENSE/ASPECT: PRESENT (BE)',
        level: 'A1',
        shorthand: 'TA.PRESENT.be.INT.NEG',
    },
    {
        label: 'TENSE/ASPECT: PRESENT (lexical verbs)',
        level: 'A1',
        shorthand: 'TA.PRESENT.do.AFF',
    },
    {
        label: 'TENSE/ASPECT: PRESENT (lexical verbs)',
        level: 'A1',
        shorthand: 'TA.PRESENT.do.NEG',
    },
    {
        label: 'TENSE/ASPECT: PRESENT (lexicalverbs)',
        level: 'A1',
        shorthand: 'TA.PRESENT.do.INT.AFF',
    },
    {
        label: 'TENSE/ASPECT: PRESENT (lexical verbs)',
        level: 'A1',
        shorthand: 'TA.PRESENT.do.INT.NEG',
    },
    {
        label: 'TENSE/ASPECT: PRESENT (lexical verbs; third person & singular)',
        level: 'A1',
        shorthand: 'TA.PRESENT.does.AFF',
    },
    {
        label: 'TENSE/ASPECT: PRESENT (lexical verbs; third person & singular)',
        level: 'A1',
        shorthand: 'TA.PRESENT.does.NEG',
    },
    {
        label: 'TENSE/ASPECT: PRESENT (lexical verbs; third person & singular)',
        level: 'A1',
        shorthand: 'TA.PRESENT.does.INT.AFF',
    },
    {
        label: 'TENSE/ASPECT: PRESENT (lexical verbs; third person & singular)',
        level: 'A1',
        shorthand: 'TA.PRESENT.does.INT.NEG',
    },
    {
        label: 'TENSE/ASPECT: PRESENT PROGRESSIVE',
        level: 'A1',
        shorthand: 'TA.PRPRG.AFF',
    },
    {
        label: 'TENSE/ASPECT: PRESENT PROGRESSIVE',
        level: 'A1',
        shorthand: 'TA.PRPRG.NEG',
    },
    {
        label: 'TENSE/ASPECT: PRESENT PROGRESSIVE',
        level: 'A1',
        shorthand: 'TA.PRPRG.INT.AFF',
    },
    {
        label: 'TENSE/ASPECT: PRESENT PROGRESSIVE',
        level: 'A1',
        shorthand: 'TA.PRPRG.INT.NEG',
    },
    {
        label: 'TENSE/ASPECT: PRESENT PERFECT',
        level: 'A2',
        shorthand: 'TA.PRPF.AFF',
    },
    {
        label: 'TENSE/ASPECT: PRESENT PERFECT',
        level: 'A2',
        shorthand: 'TA.PRPF.NEG',
    },
    {
        label: 'TENSE/ASPECT: PRESENT PERFECT',
        level: 'A2',
        shorthand: 'TA.PRPF.INT.AFF',
    },
    {
        label: 'TENSE/ASPECT: PRESENT PERFECT',
        level: 'A2',
        shorthand: 'TA.PRPF.INT.NEG',
    },
    {
        label: 'TENSE/ASPECT: PRESENT PERFECT PROGRESSIVE',
        level: 'B1',
        shorthand: 'TA.PRPFPRG.AFF',
    },
    {
        label: 'TENSE/ASPECT: PRESENT PERFECT PROGRESSIVE',
        level: 'B1',
        shorthand: 'TA.PRPFPRG.NEG',
    },
    {
        label: 'TENSE/ASPECT: PRESENT PERFECT PROGRESSIVE',
        level: 'B1',
        shorthand: 'TA.PRPFPRG.INT.AFF',
    },
    {
        label: 'TENSE/ASPECT: PRESENT PERFECT PROGRESSIVE',
        level: 'B1',
        shorthand: 'TA.PRPFPRG.INT.NEG',
    },
    {
        label: 'TENSE/ASPECT: PAST (BE)',
        level: 'A1',
        shorthand: 'TA.PAST.be.AFF',
    },
    {
        label: 'TENSE/ASPECT: PAST (BE)',
        level: 'A1',
        shorthand: 'TA.PAST.be.NEG',
    },
    {
        label: 'TENSE/ASPECT: PAST (BE)',
        level: 'A1',
        shorthand: 'TA.PAST.be.INT.AFF',
    },
    {
        label: 'TENSE/ASPECT: PAST (BE)',
        level: 'A1',
        shorthand: 'TA.PAST.be.INT.NEG',
    },
    {
        label: 'TENSE/ASPECT: PRESENT (lexical verbs)',
        level: 'A1',
        shorthand: 'TA.PAST.do.AFF',
    },
    {
        label: 'TENSE/ASPECT: PRESENT (lexical verbs)',
        level: 'A1',
        shorthand: 'TA.PAST.do.NEG',
    },
    {
        label: 'TENSE/ASPECT: PRESENT (lexical verbs)',
        level: 'A1',
        shorthand: 'TA.PAST.do.INT.AFF',
    },
    {
        label: 'TENSE/ASPECT: PRESENT (lexical verbs)',
        level: 'A1',
        shorthand: 'TA.PAST.do.INT.NEG',
    },
    {
        label: 'TENSE/ASPECT: PAST PROGRESSIVE',
        level: 'A2',
        shorthand: 'TA.PASTPRG.AFF',
    },
    {
        label: 'TENSE/ASPECT: PAST PROGRESSIVE',
        level: 'A2',
        shorthand: 'TA.PASTPRG.NEG',
    },
    {
        label: 'TENSE/ASPECT: PAST PROGRESSIVE',
        level: 'A2',
        shorthand: 'TA.PASTPRG.INT.AFF',
    },
    {
        label: 'TENSE/ASPECT: PAST PROGRESSIVE',
        level: 'A2',
        shorthand: 'TA.PASTPRG.INT.NEG',
    },
    {
        label: 'TENSE/ASPECT: PAST PERFECT',
        level: 'B1',
        shorthand: 'TA.PASTPF.AFF',
    },
    {
        label: 'TENSE/ASPECT: PAST PERFECT',
        level: 'B1',
        shorthand: 'TA.PASTPF.NEG',
    },
    {
        label: 'TENSE/ASPECT: PAST PERFECT',
        level: 'B1',
        shorthand: 'TA.PASTPF.INT.AFF',
    },
    {
        label: 'TENSE/ASPECT: PAST PERFECT',
        level: 'B1',
        shorthand: 'TA.PASTPF.INT.NEG',
    },
    {
        label: 'TENSE/ASPECT: PAST PERFECT PROGRESSIVE',
        level: 'B2',
        shorthand: 'TA.PASTPFPRG.AFF',
    },
    {
        label: 'TENSE/ASPECT: PAST PERFECT PROGRESSIVE',
        level: 'B2',
        shorthand: 'TA.PASTPFPRG.NEG',
    },
    {
        label: 'TENSE/ASPECT: PAST PERFECT PROGRESSIVE',
        level: 'B2',
        shorthand: 'TA.PASTPFPRG.INT.AFF',
    },
    {
        label: 'TENSE/ASPECT: PAST PERFECT PROGRESSIVE',
        level: 'B2',
        shorthand: 'TA.PASTPFPRG.INT.NEG',
    },
    {
        label: 'TENSE/ASPECT: FUTURE',
        level: 'A1',
        shorthand: 'TA.FUT.AFF',
    },
    {
        label: 'TENSE/ASPECT: FUTURE',
        level: 'A1',
        shorthand: 'TA.FUT.NEG',
    },
    {
        label: 'TENSE/ASPECT: FUTURE',
        level: 'A1',
        shorthand: 'TA.FUT.INT.AFF',
    },
    {
        label: 'TENSE/ASPECT: FUTURE',
        level: 'A1',
        shorthand: 'TA.FUT.INT.NEG',
    },
    {
        label: 'TENSE/ASPECT: FUTURE',
        level: 'B1',
        shorthand: 'TA.FUTPRG.AFF',
    },
    {
        label: 'TENSE/ASPECT: FUTURE',
        level: 'B1',
        shorthand: 'TA.FUTPRG.NEG',
    },
    {
        label: 'TENSE/ASPECT: FUTURE PROGRESSIVE',
        level: 'B1',
        shorthand: 'TA.FUTPRG.INT.AFF',
    },
    {
        label: 'TENSE/ASPECT: FUTURE PROGRESSIVE',
        level: 'B1',
        shorthand: 'TA.FUTPRG.INT.NEG',
    },
    {
        label: 'TENSE/ASPECT: FUTURE PERFECT',
        level: 'B2',
        shorthand: 'TA.FUTPF.AFF',
    },
    {
        label: 'TENSE/ASPECT: FUTURE PERFECT',
        level: 'B2',
        shorthand: 'TA.FUTPF.NEG',
    },
    {
        label: 'TENSE/ASPECT: FUTURE PERFECT',
        level: 'B2',
        shorthand: 'TA.FUTPF.INT.AFF',
    },
    {
        label: 'TENSE/ASPECT: FUTURE PERFECT',
        level: 'B2',
        shorthand: 'TA.FUTPF.INT.NEG',
    },
    {
        label: 'TENSE/ASPECT: FUTURE PERFECT PROGRESSIVE',
        level: 'B2',
        shorthand: 'TA.FUTPFPRG.AFF',
    },
    {
        label: 'TENSE/ASPECT: FUTURE PERFECT PROGRESSIVE',
        level: 'B2',
        shorthand: 'TA.FUTPFPRG.NEG',
    },
    {
        label: 'TENSE/ASPECT: FUTURE PERFECT PROGRESSIVE',
        level: 'B2',
        shorthand: 'TA.FUTPFPRG.INT.AFF',
    },
    {
        label: 'TENSE/ASPECT: FUTURE PERFECT PROGRESSIVE',
        level: 'B2',
        shorthand: 'TA.FUTPFPRG.INT.NEG',
    },
    {
        label: 'PASSIVE: PRESENT',
        level: 'A1',
        shorthand: 'PASS.PRESENT',
    },
    {
        label: 'PASSIVE: PRESENT',
        level: 'B2',
        shorthand: 'PASS.PRESENT.NEG',
    },
    {
        label: 'PASSIVE: PRESENT PROGRESSIVE',
        level: 'B2',
        shorthand: 'PASS.PRSPRG.AFF',
    },
    {
        label: 'PASSIVE: PRESENT PROGRESSIVE',
        level: 'B2',
        shorthand: 'PASS.PRSPRG.NEG',
    },
    {
        label: 'PASSIVE: PRESENT PROGRESSIVE',
        level: 'B2',
        shorthand: 'PASS.PRSPRG.INT.AFF',
    },
    {
        label: 'PASSIVE: PRESENT PROGRESSIVE',
        level: 'B2',
        shorthand: 'PASS.PRSPRG.INT.NEG',
    },
    {
        label: 'PASSIVE: PRESENT PERFECT',
        level: 'B2',
        shorthand: 'PASS.PRSPF.AFF',
    },
    {
        label: 'PASSIVE: PRESENT PERFECT',
        level: 'B2',
        shorthand: 'PASS.PRSPF.NEG',
    },
    {
        label: 'PASSIVE: PRESENT PERFECT',
        level: 'B2',
        shorthand: 'PASS.PRSPF.INT.AFF',
    },
    {
        label: 'PASSIVE: PRESENT PERFECT',
        level: 'B2',
        shorthand: 'PASS.PRSPF.INT.NEG',
    },
    {
        label: 'PASSIVE: PAST',
        level: 'B1',
        shorthand: 'PASS.PAST.AFF',
    },
    {
        label: 'PASSIVE: PAST',
        level: 'B1',
        shorthand: 'PASS.PAST.NEG',
    },
    {
        label: 'PASSIVE: PAST',
        level: 'B1',
        shorthand: 'PASS.PAST.INT.AFF',
    },
    {
        label: 'PASSIVE: PAST',
        level: 'B1',
        shorthand: 'PASS.PAST.INT.NEG',
    },
    {
        label: 'PASSIVE: PAST PROGRESSIVE',
        level: 'B2',
        shorthand: 'PASS.PASTPRG.AFF',
    },
    {
        label: 'PASSIVE: PAST PROGRESSIVE',
        level: 'B2',
        shorthand: 'PASS.PASTPRG.NEG',
    },
    {
        label: 'PASSIVE: PAST PROGRESSIVE',
        level: 'B2',
        shorthand: 'PASS.PASTPRG.INT.AFF',
    },
    {
        label: 'PASSIVE: PAST PROGRESSIVE',
        level: 'B2',
        shorthand: 'PASS.PASTPRG.INT.NEG',
    },
    {
        label: 'PASSIVE: PAST PERFECT',
        level: 'B2',
        shorthand: 'PASS.PASTPF.AFF',
    },
    {
        label: 'PASSIVE: PAST PERFECT',
        level: 'B2',
        shorthand: 'PASS.PASTPF.NEG',
    },
    {
        label: 'PASSIVE: PAST PERFECT',
        level: 'B2',
        shorthand: 'PASS.PASTPF.INT.AFF',
    },
    {
        label: 'PASSIVE: PAST PERFECT',
        level: 'B2',
        shorthand: 'PASS.PASTPF.INT.NEG',
    },
    {
        label: 'PASSIVE: FUTURE',
        level: 'C1',
        shorthand: 'PASS.FUT.AFF',
    },
    {
        label: 'PASSIVE: FUTURE',
        level: 'C1',
        shorthand: 'PASS.FUT.NEG',
    },
    {
        label: 'PASSIVE: FUTURE',
        level: 'C1',
        shorthand: 'PASS.FUT.INT.AFF',
    },
    {
        label: 'PASSIVE: FUTURE',
        level: 'C1',
        shorthand: 'PASS.FUT.INT.NEG',
    },
    {
        label: 'PASSIVE: FUTURE PROGRESSIVE',
        level: 'C1',
        shorthand: 'PASS.FUTPRG.AFF',
    },
    {
        label: 'PASSIVE: FUTURE PROGRESSIVE',
        level: 'C1',
        shorthand: 'PASS.FUTPRG.NEG',
    },
    {
        label: 'PASSIVE: FUTURE PROGRESSIVE',
        level: 'C1',
        shorthand: 'PASS.FUTPRG.INT.AFF',
    },
    {
        label: 'PASSIVE: FUTURE PROGRESSIVE',
        level: 'C1',
        shorthand: 'PASS.FUTPRG.INT.NEG',
    },
    {
        label: 'PASSIVE: FUTURE PERFECT',
        level: 'C1',
        shorthand: 'PASS.FUTPF.AFF',
    },
    {
        label: 'PASSIVE: FUTURE PERFECT',
        level: 'C1',
        shorthand: 'PASS.FUTPF.NEG',
    },
    {
        label: 'PASSIVE: FUTURE PERFECT',
        level: 'C1',
        shorthand: 'PASS.FUTPF.INT.AFF',
    },
    {
        label: 'PASSIVE: FUTURE PERFECT',
        level: 'C1',
        shorthand: 'PASS.FUTPF.INT.NEG',
    },
    {
        label: 'PASSIVE: AUX',
        level: 'C1',
        shorthand: 'PASS.MD.AFF',
    },
    {
        label: 'PASSIVE: AUX',
        level: 'C1',
        shorthand: 'PASS.MD.NEG',
    },
    {
        label: 'PASSIVE: AUX',
        level: 'C1',
        shorthand: 'PASS.MD.INT.AFF',
    },
    {
        label: 'PASSIVE: AUX',
        level: 'C1',
        shorthand: 'PASS.MD.INT.NEG',
    },
    {
        label: 'PASSIVE: AUX+PERFECT',
        level: 'B2',
        shorthand: 'PASS.MDPF.AFF',
    },
    {
        label: 'PASSIVE: AUX+PERFECT',
        level: 'B2',
        shorthand: 'PASS.MDPF.NEG',
    },
    {
        label: 'PASSIVE: AUX+PERFECT',
        level: 'B2',
        shorthand: 'PASS.MDPF.INT.AFF',
    },
    {
        label: 'PASSIVE: AUX+PERFECT',
        level: 'B2',
        shorthand: 'PASS.MDPF.INT.NEG',
    },
    {
        label: 'PASSIVE: INDIRECT OBJECTS OF GIVE/PASS/SEND/SHOW/TEACH/TELL AS SUBJECTS',
        level: 'B2',
        shorthand: 'PASS.IO.AFF',
    },
    {
        label: 'GET+PAST PARTICIPLE',
        level: 'B1',
        shorthand: 'PASS.get_VN',
    },
    {
        label: "TO-INFINITIVE: to DO (not preceded by 'not')",
        level: 'A2',
        shorthand: 'TO.to_do',
    },
    {
        label: 'TO-INFINITIVE: not to DO',
        level: 'B1',
        shorthand: 'TO.not_to_do',
    },
    {
        label: 'TO-INFINITIVE: to be DONE',
        level: 'B2',
        shorthand: 'TO.to_be_done',
    },
    {
        label: 'TO-INFINITIVE: WITH NOTIONAL SUBJECT',
        level: 'B1',
        shorthand: 'TO.for_NP_to_do',
    },
    {
        label: 'in order to DO',
        level: 'B2',
        shorthand: 'TO.in_order_to_do',
    },
    {
        label: 'BE to DO',
        level: 'B1',
        shorthand: 'TO.be_to_do',
    },
    {
        label: 'VERB to DO',
        level: 'A2',
        shorthand: 'TO.VV_to_do',
    },
    {
        label: 'VERB OBJECT to DO',
        level: 'A1',
        shorthand: 'TO.VV_NP_to_do',
    },
    {
        label: "V-ING (not preceded by 'not')",
        level: 'A2',
        shorthand: 'VG',
    },
    {
        label: 'not+V-ING',
        level: 'B2',
        shorthand: 'VG.not_VG',
    },
    {
        label: 'being+PAST PARTICIPLE',
        level: 'B2',
        shorthand: 'VG.being_VN',
    },
    {
        label: 'PREP+V-ING',
        level: 'A1',
        shorthand: 'VG.PREP_VG',
    },
    {
        label: 'VERB V-ING',
        level: 'A1',
        shorthand: 'VG.VV_VG',
    },
    {
        label: 'VERB OBJECT V-ING',
        level: 'A2',
        shorthand: 'VG.VV_NP_VG',
    },
    {
        label: 'IMPERATIVE: AFFIRMATIVE (lexical verbs)',
        level: 'A1',
        shorthand: 'IMP.V.AFF',
    },
    {
        label: 'IMPERATIVE: AFFIRMATIVE (lexical verbs)',
        level: 'A1',
        shorthand: 'IMP.V.NEG',
    },
    {
        label: 'Please+INFINITIVE',
        level: 'A2',
        shorthand: 'IMP.please_V.AFF',
    },
    {
        label: "Please+don't/never+INFINITIVE",
        level: 'A2',
        shorthand: 'IMP.please_V.NEG',
    },
    {
        label: "let's (not followed by 'not')",
        level: 'A1',
        shorthand: "IMP.let's_V.AFF",
    },
    {
        label: 'MODAL/AUX: be able to',
        level: 'B1',
        shorthand: 'MD.be_able_to.AFF',
    },
    {
        label: 'MODAL/AUX: be going to',
        level: 'A1',
        shorthand: 'MD.be_going_to.AFF',
    },
    {
        label: 'MODAL/AUX: be going to',
        level: 'A1',
        shorthand: 'MD.be_going_to.NEG',
    },
    {
        label: 'MODAL/AUX: be going to',
        level: 'A1',
        shorthand: 'MD.be_going_to.INT.AFF',
    },
    {
        label: 'MODAL/AUX: be going to',
        level: 'A1',
        shorthand: 'MD.be_going_to.INT.NEG',
    },
    {
        label: 'MODAL/AUX: can',
        level: 'A1',
        shorthand: 'MD.can.AFF',
    },
    {
        label: 'MODAL/AUX: can',
        level: 'A1',
        shorthand: 'MD.can.NEG',
    },
    {
        label: 'MODAL/AUX: can',
        level: 'A1',
        shorthand: 'MD.can.INT.AFF',
    },
    {
        label: 'MODAL/AUX: can',
        level: 'A1',
        shorthand: 'MD.can.INT.NEG',
    },
    {
        label: 'MODAL/AUX: could',
        level: 'A2',
        shorthand: 'MD.could.AFF',
    },
    {
        label: 'MODAL/AUX: could',
        level: 'A2',
        shorthand: 'MD.could.NEG',
    },
    {
        label: 'MODAL/AUX: could',
        level: 'A2',
        shorthand: 'MD.could.INT.AFF',
    },
    {
        label: 'MODAL/AUX: could',
        level: 'A2',
        shorthand: 'MD.could.INT.NEG',
    },
    {
        label: 'MODAL/AUX: have to',
        level: 'A2',
        shorthand: 'MD.have_to.AFF',
    },
    {
        label: 'MODAL/AUX: have to',
        level: 'A2',
        shorthand: 'MD.have_to.NEG',
    },
    {
        label: 'MODAL/AUX: have to',
        level: 'A2',
        shorthand: 'MD.have_to.INT.AFF',
    },
    {
        label: 'MODAL/AUX: have to',
        level: 'A2',
        shorthand: 'MD.have_to.INT.NEG',
    },
    {
        label: 'MODAL/AUX: may',
        level: 'A2',
        shorthand: 'MD.may.AFF',
    },
    {
        label: 'MODAL/AUX: may',
        level: 'A2',
        shorthand: 'MD.may.NEG',
    },
    {
        label: 'MODAL/AUX: may',
        level: 'A2',
        shorthand: 'MD.may.INT.AFF',
    },
    {
        label: 'MODAL/AUX: may',
        level: 'A2',
        shorthand: 'MD.may.INT.NEG',
    },
    {
        label: 'MODAL/AUX: might',
        level: 'A2',
        shorthand: 'MD.might.AFF',
    },
    {
        label: 'MODAL/AUX: might',
        level: 'B1',
        shorthand: 'MD.might.NEG',
    },
    {
        label: 'MODAL/AUX: might',
        level: 'C1',
        shorthand: 'MD.might.INT.AFF',
    },
    {
        label: 'MODAL/AUX: might as well',
        level: 'C2',
        shorthand: 'MD.might_as_well.AFF',
    },
    {
        label: 'MODAL/AUX: must',
        level: 'A2',
        shorthand: 'MD.must.AFF',
    },
    {
        label: 'MODAL/AUX: must',
        level: 'A2',
        shorthand: 'MD.must.NEG',
    },
    {
        label: 'MODAL/AUX: must',
        level: 'B2',
        shorthand: 'MD.must.INT.AFF',
    },
    {
        label: 'MODAL/AUX: need (to)',
        level: 'A2',
        shorthand: 'MD.need.AFF',
    },
    {
        label: 'MODAL/AUX: need (to)',
        level: 'B2',
        shorthand: 'MD.need.NEG',
    },
    {
        label: 'MODAL/AUX: need (to)',
        level: 'C2',
        shorthand: 'MD.need.INT.AFF',
    },
    {
        label: 'MODAL/AUX: ought to',
        level: 'B1',
        shorthand: 'MD.ought_to.AFF',
    },
    {
        label: 'MODAL/AUX: ought to',
        level: 'B1',
        shorthand: 'MD.ought_to.NEG',
    },
    {
        label: 'MODAL/AUX: ought to',
        level: 'B1',
        shorthand: 'MD.ought_to.INT.AFF',
    },
    {
        label: 'MODAL/AUX: ought to',
        level: 'B1',
        shorthand: 'MD.ought_to.INT.NEG',
    },
    {
        label: 'MODAL/AUX: should',
        level: 'A2',
        shorthand: 'MD.should.AFF',
    },
    {
        label: 'MODAL/AUX: should',
        level: 'A2',
        shorthand: 'MD.should.NEG',
    },
    {
        label: 'MODAL/AUX: should',
        level: 'A2',
        shorthand: 'MD.should.INT.AFF',
    },
    {
        label: 'MODAL/AUX: should',
        level: 'A2',
        shorthand: 'MD.should.INT.NEG',
    },
    {
        label: 'MODAL/AUX: used to',
        level: 'A2',
        shorthand: 'MD.used_to.AFF',
    },
    {
        label: 'MODAL/AUX: used to',
        level: 'A2',
        shorthand: 'MD.used_to.NEG',
    },
    {
        label: 'MODAL/AUX: used to',
        level: 'A2',
        shorthand: 'MD.used_to.INT.AFF',
    },
    {
        label: 'MODAL/AUX: used to',
        level: 'A2',
        shorthand: 'MD.used_to.INT.NEG',
    },
    {
        label: 'MODAL/AUX: will',
        level: 'A2',
        shorthand: 'MD.will.AFF',
    },
    {
        label: 'MODAL/AUX: will',
        level: 'A2',
        shorthand: 'MD.will.NEG',
    },
    {
        label: 'MODAL/AUX: will',
        level: 'A2',
        shorthand: 'MD.will.INT.AFF',
    },
    {
        label: 'MODAL/AUX: will',
        level: 'A2',
        shorthand: 'MD.will.INT.NEG',
    },
    {
        label: 'MODAL/AUX: would',
        level: 'B1',
        shorthand: 'MD.would.AFF',
    },
    {
        label: 'MODAL/AUX: would',
        level: 'B1',
        shorthand: 'MD.would.NEG',
    },
    {
        label: 'MODAL/AUX: would',
        level: 'B1',
        shorthand: 'MD.would.INT.AFF',
    },
    {
        label: 'MODAL/AUX: would',
        level: 'B1',
        shorthand: 'MD.would.INT.NEG',
    },
    {
        label: 'AUX+PROGRESSIVE',
        level: 'B2',
        shorthand: 'MD.MD_PRG.AFF',
    },
    {
        label: 'AUX+PERFECT',
        level: 'B1',
        shorthand: 'MD.MD_PF.AFF',
    },
    {
        label: 'AUX+PERFECT',
        level: 'B1',
        shorthand: 'MD.MD_PF.NEG',
    },
    {
        label: 'AUX+PERFECT',
        level: 'B1',
        shorthand: 'MD.MD_PF.INT.AFF',
    },
    {
        label: 'AUX+PERFECT',
        level: 'B1',
        shorthand: 'MD.MD_PF.INT.NEG',
    },
    {
        label: 'there+be',
        level: 'A1',
        shorthand: 'EX.there.AFF',
    },
    {
        label: 'there+be',
        level: 'A1',
        shorthand: 'EX.there.NEG',
    },
    {
        label: 'there+be',
        level: 'A1',
        shorthand: 'EX.there.INT.AFF',
    },
    {
        label: 'there+be',
        level: 'A1',
        shorthand: 'EX.there.INT.NEG',
    },
    {
        label: 'here is/are',
        level: 'B1',
        shorthand: 'EX.here.AFF',
    },
    {
        label: 'COORDINATING CONJUNCTIONS',
        level: 'A1',
        shorthand: 'CC',
    },
    {
        label: 'V+that+CLAUSE',
        level: 'A2',
        shorthand: 'CL.that.OBJ',
    },
    {
        label: "know/wonder+WH-(CLAUSE) (except for 'whether')",
        level: 'B1',
        shorthand: 'CL.WH.OBJ',
    },
    {
        label: 'whether',
        level: 'B2',
        shorthand: 'CL.WH.whether',
    },
    {
        label: 'ADVERBIAL CLAUSE: when',
        level: 'A1',
        shorthand: 'CL.when',
    },
    {
        label: 'ADVERBIAL CLAUSE: if',
        level: 'A2',
        shorthand: 'CL.if',
    },
    {
        label: 'ADVERBIAL CLAUSE: as',
        level: 'A2',
        shorthand: 'CL.as',
    },
    {
        label: 'ADVERBIAL CLAUSE: so that',
        level: 'B2',
        shorthand: 'CL.so_that',
    },
    {
        label: 'SUBORDINATE CLAUSE: after/albeit/although/because/before/despite/except/for/lest/like/once/since/so/than/though/till/unless/until/where/whereas/wheresoever/whether/while/whilst tagged as IN',
        level: 'A1',
        shorthand: 'CL_after.etc',
    },
    {
        label: "hope/know/think+CLAUSE (without 'that')",
        level: 'A1',
        shorthand: 'CL.that.OMIT',
    },
    {
        label: 'WH-+to+INFINITIVE',
        level: 'B1',
        shorthand: 'TO.WH_to_do',
    },
    {
        label: 'PREMODIFYING PRESENT PARTICIPLE',
        level: 'A2',
        shorthand: 'VG.VG_N',
    },
    {
        label: 'POSTMODIFYING PRESENT',
        level: 'A1',
        shorthand: 'VG.N_VG',
    },
    {
        label: 'PREMODIFYING PAST PARTICIPLE',
        level: 'A1',
        shorthand: 'VN.VN_N',
    },
    {
        label: 'POSTMODIFYING PAST PARTICIPLE',
        level: 'A1',
        shorthand: 'VN.N_VN',
    },
    {
        label: 'NOMINATIVE RELATIVE PRONOUN: who',
        level: 'B2',
        shorthand: 'PREL.who',
    },
    {
        label: 'NOMINATIVE RELATIVE PRONOUN: which',
        level: 'B2',
        shorthand: 'PREL.which',
    },
    {
        label: 'NOMINATIVE RELATIVE PRONOUN:',
        level: 'B2',
        shorthand: 'PREL.that',
    },
    {
        label: 'ACCUSATIVE RELATIVE PRONOUN: who',
        level: 'B2',
        shorthand: 'PRELO.who',
    },
    {
        label: 'ACCUSATIVE RELATIVE PRONOUN: whom',
        level: 'B2',
        shorthand: 'PRELO.whom',
    },
    {
        label: 'ACCUSATIVE RELATIVE PRONOUN: which',
        level: 'B2',
        shorthand: 'PRELO.which',
    },
    {
        label: 'ACCUSATIVE RELATIVE PRONOUN: that',
        level: 'B2',
        shorthand: 'PRELO.that',
    },
    {
        label: 'ELLIPTICAL ACCUSATIVE RELATIVE PRONOUN',
        level: 'B2',
        shorthand: 'PRELO.OMIT',
    },
    {
        label: 'GENITIVE RELATIVE PRONOUN',
        level: 'B2',
        shorthand: 'PRELGEN',
    },
    {
        label: 'RELATIVE PRONOUN: NONRESTRICTIVE',
        level: 'B2',
        shorthand: 'PREL.NR',
    },
    {
        label: 'COMPOUND RELATIVE PRONOUN:',
        level: 'A2',
        shorthand: 'PREL.what',
    },
    {
        label: 'PREP+RELATIVE PRONOUN',
        level: 'B2',
        shorthand: 'PREL.PREP_PREL',
    },
    {
        label: 'RELATIVE ADVERB: WITH',
        level: 'A2',
        shorthand: 'RBREL',
    },
    {
        label: 'RELATIVE ADVERB: WITHOUT ANTECEDENT',
        level: 'B1',
        shorthand: 'RBREL.NOANT',
    },
    {
        label: 'WH-EVER',
        level: 'B2',
        shorthand: 'WH.-ever',
    },
    {
        label: 'PREPOSITION STRANDING',
        level: 'A1',
        shorthand: 'PREP.STRAND',
    },
    {
        label: 'TAG QUESTION: FOLLOWING AFFIRMATIVE SENTENCE',
        level: 'B1',
        shorthand: 'TAG.AFF',
    },
    {
        label: 'TAG QUESTION: FOLLOWING NEGATIVE SENTENCE',
        level: 'B1',
        shorthand: 'TAG.NEG',
    },
    {
        label: 'SENTENCE PATTERN: SUBJECT+V',
        level: 'B1',
        shorthand: 'VP.SV.AFF',
    },
    {
        label: 'SENTENCE PATTERN: SUBJECT+V+OBJECT',
        level: 'A1',
        shorthand: 'VP.SVO.AFF',
    },
    {
        label: 'SENTENCE PATTERN: SUBJECT+V+OBJECT',
        level: 'A2',
        shorthand: 'VP.SVO.NEG',
    },
    {
        label: 'SENTENCE PATTERN: SUBJECT+V+OBJECT',
        level: 'A1',
        shorthand: 'VP.SVO.INT.AFF',
    },
    {
        label: 'SENTENCE PATTERN: SUBJECT+MAKE+OBJECT+COMPLEME NT (ADJ)',
        level: 'A2',
        shorthand: 'VP.SVOC.AFF',
    },
    {
        label: 'SENTENCE PATTERN: SUBJECT+MAKE+OBJECT+COMPLEME NT (ADJ)',
        level: 'A2',
        shorthand: 'VP.SVOC.NEG',
    },
    {
        label: 'SENTENCE PATTERN: SUBJECT+MAKE+OBJECT+COMPLEME NT (ADJ)',
        level: 'A2',
        shorthand: 'VP.SVOC.INT.AFF',
    },
    {
        label: 'SENTENCE PATTERN: SUBJECT+MAKE+OBJECT+COMPLEME NT (ADJ)',
        level: 'A2',
        shorthand: 'VP.SVOC.INT.NEG',
    },
    {
        label: 'INDIRECT SPEECH: SAY/EXPLAIN/REPORT',
        level: 'B1',
        shorthand: 'INDSP.explain.report.say',
    },
    {
        label: 'INDIRECT SPEECH: TELL',
        level: 'B1',
        shorthand: 'INDSP.tell',
    },
    {
        label: 'INDIRECT QUESTION: DECIDE/EXPLAIN/KNOW/LEARN/SEE/UNDERSTAND/WONDER',
        level: 'A2',
        shorthand: 'INDQ.know.etc',
    },
    {
        label: 'INDIRECT QUESTION: ASK/REMIND/SHOW/TEACH/TELL',
        level: 'B1',
        shorthand: 'INDQ.ask.etc',
    },
    {
        label: 'HAVE/LET/MAKE+NP+INFINITIVE',
        level: 'A2',
        shorthand: 'CAUS.have.let.make',
    },
    {
        label: 'HAVE/GET+NP+PAST PARTICIPLE',
        level: 'B2',
        shorthand: 'CAUS.have.get_NP_VN',
    },
    {
        label: 'ASK/TELL+NP+to+INFINITIVE',
        level: 'B1',
        shorthand: 'CAUS.ask.tell_NP_to_do',
    },
    {
        label: 'PARTICIPIAL CONSTRUCTION: PRESENT PARTICIPLE',
        level: 'B1',
        shorthand: 'VG.P.AFF',
    },
    {
        label: 'CONDITIONAL: SECOND',
        level: 'B1',
        shorthand: 'SUBJ.PAST.AFF',
    },
    {
        label: 'CONDITIONAL: SECOND',
        level: 'B1',
        shorthand: 'SUBJ.PAST.NEG',
    },
    {
        label: 'CONDITIONAL: THIRD',
        level: 'B1',
        shorthand: 'SUBJ.PASTPF.AFF',
    },
    {
        label: 'CONDITIONAL: THIRD',
        level: 'B1',
        shorthand: 'SUBJ.PASTPF.NEG',
    },
    {
        label: 'WISH+SECOND CONDITIONAL',
        level: 'B2',
        shorthand: 'SUBJ.wish_PAST',
    },
    {
        label: 'WISH+THIRD CONDITIONAL',
        level: 'B2',
        shorthand: 'SUBJ.wish_PASTPF',
    },
    {
        label: 'IF ONLY+SECOND CONDITIONAL',
        level: 'C1',
        shorthand: 'SUBJ.if_only_PAST',
    },
    {
        label: 'IF ONLY+THIRD CONDITIONAL',
        level: 'C1',
        shorthand: 'SUBJ.if_only_PASTPF',
    },
    {
        label: 'INVERSION: Hardly/Little/Never/No sooner/Scarcely/Seldom ....',
        level: 'C1',
        shorthand: 'INV.never.etc',
    },
    {
        label: 'WH- QUESTION: Why ...?',
        level: 'A1',
        shorthand: 'INT.why',
    },
    {
        label: 'WH- QUESTION: When ...?',
        level: 'A1',
        shorthand: 'INT.when',
    },
    {
        label: 'WH- QUESTION: Who ...?',
        level: 'B1',
        shorthand: 'INT.who',
    },
    {
        label: 'WH- QUESTION: What ...?',
        level: 'A1',
        shorthand: 'INT.what',
    },
    {
        label: 'WH- QUESTION: What N ...?',
        level: 'A1',
        shorthand: 'INT.what_N',
    },
    {
        label: 'WH- QUESTION: Where ...?',
        level: 'A1',
        shorthand: 'INT.where',
    },
    {
        label: 'WH- QUESTION: How ...?',
        level: 'A1',
        shorthand: 'INT.how',
    },
    {
        label: 'WH- QUESTION: How ADJ/ADV ...?',
        level: 'A1',
        shorthand: 'INT.how_JJ.RB',
    },
    {
        label: 'FUNCTIONAL QUESTION: Can you ...?',
        level: 'A2',
        shorthand: 'INTF.can_you',
    },
    {
        label: 'FUNCTIONAL QUESTION: Can I ...?',
        level: 'A1',
        shorthand: 'INTF.can_I',
    },
    {
        label: 'FUNCTIONAL QUESTION: Could I ...?',
        level: 'A1',
        shorthand: 'INTF.could_I',
    },
];
