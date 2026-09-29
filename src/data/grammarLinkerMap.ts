// Maps the grammar linker's items onto UD construction ids (src/data/grammarConstructions.ts) so
// linked rubric criteria can be checked against the UD parse when it is available. Items or
// shorthands not listed here keep using the regex detectors in grammarChecker.ts.
import type { GrammarItem } from '../types';

/** `GrammarItem.detectShorthand` → construction ids whose counts are summed. */
export const SHORTHAND_CONSTRUCTIONS: Record<string, string[]> = {
    'PRES.PROG': ['pres_prog'],
    'TA.PASTPRG': ['past_prog'],
    'TA.PRPF': ['pres_perf'],
    'TA.PRPFPRG': ['pres_perf_prog'],
    'TA.PASTPF': ['past_perf'],
    'TA.PASTPFPRG': ['past_perf_prog'],
    'FUT.WILL': ['future_will'],
    'FUT.GOING': ['future_going_to'],
    'MOD.CAN': ['modal_can', 'modal_could'],
    'MOD.SHOULD': ['modal_should', 'modal_must', 'modal_would', 'modal_might'],
    // The regex cannot tell zero and first conditional apart; the parse reports both as cond_first.
    'COND.ZERO_FIRST': ['cond_first'],
    'COND.SECOND': ['cond_second'],
    'COND.THIRD': ['cond_third'],
    PASS: ['passive_present', 'passive_past', 'passive_perfect', 'passive_progressive', 'passive_modal', 'get_passive'],
    'REP.SPEECH': ['that_clause'],
    'REL.CLAUSE': ['rel_who', 'rel_that', 'rel_which', 'rel_whom', 'rel_whose', 'rel_nonrestrictive'],
    'INF.CLAUSE': ['to_inf', 'not_to_inf'],
    'COMP.ADJ': ['comp_er', 'comp_more'],
    'SUP.ADJ': ['superl_est', 'superl_most'],
};

/** Items the regex detectors cannot check at all but the parse can. */
export const ITEM_CONSTRUCTIONS: Record<string, string[]> = {
    'gr-present-simple-affirmative': ['pres_simple', 'pres_simple_be'],
    'gr-modals-possibility': ['modal_may', 'modal_might', 'modal_could'],
    'gr-wish-if-only': ['wish_clause'],
    'gr-passive-continuous': ['passive_progressive'],
    'gr-passive-perfect': ['passive_perfect'],
    'gr-passive-modal': ['passive_modal'],
    'gr-reported-speech-commands': ['caus_ask_tell'],
    'gr-embedded-questions': ['wh_clause'],
    'gr-inversion': ['inversion_neg'],
    'gr-gerund': ['ving'],
    'gr-causative': ['caus_have_pp'],
    'gr-causative-make-let-have': ['caus_make'],
    'gr-comparison-equality': ['as_as'],
    'gr-existential-there': ['there_be'],
    'gr-wh-questions': ['wh_question'],
    'gr-question-tags': ['tag_question'],
    'gr-imperative': ['imperative', 'neg_imperative'],
    'gr-used-to': ['used_to'],
};

/** Construction ids that decide this item under the UD parse, or undefined when it needs the regex path. */
export function constructionsForItem(item: Pick<GrammarItem, 'id' | 'detectShorthand'>): string[] | undefined {
    return (
        ITEM_CONSTRUCTIONS[item.id] ??
        (item.detectShorthand ? SHORTHAND_CONSTRUCTIONS[item.detectShorthand] : undefined)
    );
}
