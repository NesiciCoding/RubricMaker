// Mirrors vocabkitchen-CLI grammar_profile.py. The CLI runs its rules over a spaCy parse; here they
// run over a Universal Dependencies parse (udpipe-wasm, see udParse.ts), so the token model is
// spaCy-shaped (`dep`, `tag`) and the UD differences are handled in place: copulas are children
// (`cop`) rather than heads, infinitival "to" is a `mark`, and "when"/"whenever" are `advmod`.
// Output is a range indicator, not a grade: UDPipe is less accurate than spaCy on some constructions.
import type { CefrLevel } from '../types';
import {
    CEFRJ_CODE_LEVELS,
    GRAMMAR_CONSTRUCTIONS,
    SUBORDINATOR_CODE,
    WH_QUESTION_CODE,
    type GrammarConstruction,
} from '../data/grammarConstructions';
import type { UdSentence, UdToken } from './udParse';

const CEFR_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const REGISTRY = new Map(GRAMMAR_CONSTRUCTIONS.map((c) => [c.id, c]));

const MODAL_ID: Record<string, string> = {
    can: 'modal_can',
    could: 'modal_could',
    may: 'modal_may',
    might: 'modal_might',
    must: 'modal_must',
    shall: 'modal_shall',
    should: 'modal_should',
    would: 'modal_would',
};
const WH_WORDS = new Set(['what', 'when', 'where', 'why', 'who', 'whom', 'which', 'whose', 'how']);
const SUBORDINATORS = new Set([
    'when',
    'as',
    'because',
    'although',
    'though',
    'while',
    'since',
    'until',
    'before',
    'after',
    'whereas',
    'whenever',
    'wherever',
]);
const PREDICATE_DEPS = new Set([
    'ROOT',
    'ccomp',
    'xcomp',
    'advcl',
    'relcl',
    'conj',
    'acl',
    'pcomp',
    'csubj',
    'csubjpass',
    'parataxis',
]);
const FINITE_TAGS = new Set(['VBZ', 'VBP', 'VBD', 'MD']);
const INVERSION_TRIGGERS = new Set([
    'never',
    'hardly',
    'seldom',
    'rarely',
    'little',
    'scarcely',
    'nor',
    'neither',
    'barely',
]);
const MANDATIVE_VERBS = new Set([
    'suggest',
    'demand',
    'insist',
    'recommend',
    'require',
    'propose',
    'order',
    'request',
    'ask',
    'advise',
]);
const VING_DEPS = new Set([
    'nsubj',
    'nsubjpass',
    'dobj',
    'pobj',
    'csubj',
    'acl',
    'advcl',
    'pcomp',
    'conj',
    'ROOT',
    'xcomp',
    'obl',
]);

interface Hit {
    id: string;
    span: string;
    code?: string;
}

interface Group {
    /** The verb that carries tense: the lexical verb, or the copula for predicate adjectives/nouns */
    main: UdToken;
    /** Token the group hangs off in the tree (the predicate for copular groups) */
    head: UdToken;
    auxes: UdToken[];
    copular: boolean;
}

const isAuxDep = (t: UdToken) => t.dep === 'aux' || t.dep === 'auxpass';

function auxesOf(s: UdSentence, t: UdToken): UdToken[] {
    return s.children(t.i).filter(isAuxDep);
}

function hasChild(s: UdSentence, t: UdToken, pred: (c: UdToken) => boolean): boolean {
    return s.children(t.i).some(pred);
}

function next(s: UdSentence, t: UdToken): UdToken | undefined {
    return s.tokens[t.i + 1];
}

function findVbAfter(s: UdSentence, from: number): UdToken | undefined {
    return s.tokens.slice(from, from + 4).find((c) => c.tag === 'VB');
}

function span(s: UdSentence, a: number, b: number): string {
    return s.spanText(Math.min(a, b), Math.max(a, b));
}

function isPast(t: UdToken): boolean {
    return t.feats.Tense === 'Past' || t.tag === 'VBD';
}

function verbGroups(s: UdSentence): Group[] {
    const groups: Group[] = [];
    for (const t of s.tokens) {
        if (!PREDICATE_DEPS.has(t.dep)) continue;
        const cop = s.children(t.i).find((c) => c.dep === 'cop');
        if (cop) {
            groups.push({ main: cop, head: t, auxes: auxesOf(s, t), copular: true });
        } else if (t.upos === 'VERB' || t.upos === 'AUX') {
            groups.push({ main: t, head: t, auxes: auxesOf(s, t), copular: false });
        }
    }
    return groups;
}

function isFiniteGroup(g: Group): boolean {
    return FINITE_TAGS.has(g.main.tag) || g.auxes.some((a) => FINITE_TAGS.has(a.tag));
}

function groupSpan(s: UdSentence, g: Group): string {
    const idx = [g.main.i, g.head.i, ...g.auxes.map((a) => a.i)];
    idx.push(
        ...s
            .children(g.head.i)
            .filter((c) => c.dep === 'neg')
            .map((c) => c.i)
    );
    if (g.copular) return span(s, Math.min(...idx), Math.max(...idx));
    return span(s, Math.min(...idx), Math.max(...idx));
}

function analyzeVerbGroup(s: UdSentence, g: Group): Hit | null {
    const { main: V, head, auxes } = g;
    const auxLemmas = auxes.map((a) => a.lemma.toLowerCase());
    const modal = auxes.find((a) => a.tag === 'MD');
    const modalLemma = modal?.lemma.toLowerCase();
    const hasHave = auxLemmas.includes('have');
    const hasBe = auxLemmas.includes('be');
    const passive = !g.copular && hasChild(s, V, (c) => c.dep === 'auxpass') && V.tag === 'VBN';
    const progressive = V.tag === 'VBG' && hasBe;
    const finite = auxes[0] ?? V;
    const past = isPast(finite);
    const sp = groupSpan(s, g);

    if (V.lemma.toLowerCase() === 'be' && hasChild(s, head, (c) => c.dep === 'expl')) return null;

    if (passive) {
        if (hasChild(s, V, (c) => c.dep === 'auxpass' && c.lemma.toLowerCase() === 'get'))
            return { id: 'get_passive', span: sp };
        if (modal) return { id: 'passive_modal', span: sp };
        if (hasHave) return { id: 'passive_perfect', span: sp };
        if (auxes.some((a) => a.lemma.toLowerCase() === 'be' && a.tag === 'VBG'))
            return { id: 'passive_progressive', span: sp };
        return { id: past ? 'passive_past' : 'passive_present', span: sp };
    }

    // UDPipe often tags the participle in "got broken" as an adverb, so `passive` above misses it.
    if (!g.copular && V.lemma.toLowerCase() === 'get' && auxes.length === 0) {
        const part = s
            .children(V.i)
            .find(
                (c) =>
                    (c.dep === 'xcomp' && c.tag === 'VBN') ||
                    (c.dep === 'advmod' && c.upos === 'ADV' && /(ed|en)$/.test(c.lower))
            );
        if (part) return { id: 'get_passive', span: span(s, V.i, part.i) };
    }

    if (modalLemma && modalLemma !== 'will') {
        if (hasHave) return { id: 'modal_perfect', span: sp };
        if (progressive) return { id: 'modal_progressive', span: sp };
        const id = MODAL_ID[modalLemma];
        return id ? { id, span: sp } : null;
    }
    if (modalLemma === 'will') return { id: 'future_will', span: sp };

    if (hasHave && progressive) return { id: past ? 'past_perf_prog' : 'pres_perf_prog', span: sp };
    if (hasHave && V.tag === 'VBN') return { id: past ? 'past_perf' : 'pres_perf', span: sp };
    if (progressive) return { id: past ? 'past_prog' : 'pres_prog', span: sp };

    if (V.lemma.toLowerCase() === 'be' && auxes.length === 0) {
        return { id: V.tag === 'VBD' ? 'past_simple_be' : 'pres_simple_be', span: sp };
    }
    if (V.upos === 'VERB' || V.upos === 'AUX') {
        if (V.tag === 'VBD') return { id: 'past_simple', span: sp };
        if (V.tag === 'VBZ' || V.tag === 'VBP') return { id: 'pres_simple', span: sp };
    }
    return null;
}

function multiwordVerbs(s: UdSentence, covered: Set<number>): Hit[] {
    const found: Hit[] = [];
    for (const t of s.tokens) {
        const nxt = next(s, t);
        const toNext = nxt?.lower === 'to';

        if (t.lemma.toLowerCase() === 'go' && t.tag === 'VBG' && toNext) {
            const target = findVbAfter(s, nxt.i);
            if (target) {
                covered.add(t.i);
                covered.add(target.i);
                found.push({ id: 'future_going_to', span: span(s, t.i, target.i) });
                continue;
            }
        }
        if (t.lemma.toLowerCase() === 'have' && toNext) {
            const target = findVbAfter(s, t.i);
            if (target) {
                covered.add(t.i);
                covered.add(target.i);
                found.push({ id: 'have_to', span: span(s, t.i, target.i) });
                continue;
            }
        }
        if (t.lower === 'used' && toNext) {
            const target = findVbAfter(s, t.i);
            if (target) {
                covered.add(t.i);
                covered.add(target.i);
                found.push({ id: 'used_to', span: span(s, t.i, target.i) });
                continue;
            }
        }
        if (t.lower === 'able' && toNext) {
            found.push({ id: 'be_able_to', span: span(s, Math.max(t.i - 1, 0), t.i + 2) });
            const target = findVbAfter(s, t.i);
            if (target) covered.add(target.i);
            continue;
        }
        if (t.lower === 'ought' && toNext) {
            found.push({ id: 'ought_to', span: span(s, t.i, t.i + 2) });
            const target = findVbAfter(s, t.i);
            if (target) covered.add(target.i);
            continue;
        }
        if (t.lower === 'better' && t.i > 0 && ['had', "'d"].includes(s.tokens[t.i - 1].lower)) {
            found.push({ id: 'had_better', span: span(s, t.i - 1, t.i + 1) });
        }
    }
    return found;
}

function nonFinite(s: UdSentence, covered: Set<number>): Hit[] {
    const found: Hit[] = [];
    for (const t of s.tokens) {
        const H = s.head(t);
        if (t.tag === 'TO' && H && (H.upos === 'VERB' || H.upos === 'AUX') && !covered.has(H.i)) {
            const haux = auxesOf(s, H).map((a) => a.lemma.toLowerCase());
            if (H.tag === 'VBN' && haux.includes('be')) found.push({ id: 'to_be_done', span: span(s, t.i, H.i) });
            else if (H.tag === 'VBN' && haux.includes('have'))
                found.push({ id: 'to_have_done', span: span(s, t.i, H.i) });
            else if (H.tag === 'VB') {
                const prev = t.i > 0 ? s.tokens[t.i - 1] : undefined;
                if (prev && ['not', 'never'].includes(prev.lower))
                    found.push({ id: 'not_to_inf', span: span(s, t.i - 1, H.i) });
                else found.push({ id: 'to_inf', span: span(s, t.i, H.i) });
            }
        }
        if (t.tag === 'VBN') {
            const aux = auxesOf(s, t).find((a) => a.tag === 'VBG' && ['having', 'being'].includes(a.lower));
            if (aux) found.push({ id: aux.lower === 'having' ? 'having_pp' : 'being_pp', span: span(s, aux.i, t.i) });
        } else if (t.tag === 'VBG' && ['having', 'being'].includes(t.lower)) {
            const pp = s.children(t.i).find((c) => c.tag === 'VBN');
            if (pp) found.push({ id: t.lower === 'having' ? 'having_pp' : 'being_pp', span: span(s, t.i, pp.i) });
        }
        if (
            t.tag === 'VBG' &&
            !['be', 'have'].includes(t.lemma.toLowerCase()) &&
            !auxesOf(s, t).some((a) => a.lemma === 'be') &&
            VING_DEPS.has(t.dep)
        ) {
            found.push({ id: 'ving', span: t.form });
        }
    }
    return found;
}

function comparatives(s: UdSentence): Hit[] {
    const found: Hit[] = [];
    for (const t of s.tokens) {
        const hadBetter = t.lower === 'better' && t.i > 0 && ['had', "'d"].includes(s.tokens[t.i - 1].lower);
        if (hadBetter) continue;
        if (t.tag === 'JJR' || t.tag === 'RBR') {
            found.push({ id: ['more', 'less'].includes(t.lower) ? 'comp_more' : 'comp_er', span: t.form });
        } else if (t.tag === 'JJS' || t.tag === 'RBS') {
            found.push({ id: ['most', 'least'].includes(t.lower) ? 'superl_most' : 'superl_est', span: t.form });
        }
    }
    const asPos = s.tokens.filter((t) => t.lower === 'as').map((t) => t.i);
    if (asPos.length >= 2) found.push({ id: 'as_as', span: span(s, asPos[0], asPos[1]) });
    return found;
}

function relatives(s: UdSentence): Hit[] {
    const found: Hit[] = [];
    for (const t of s.tokens) {
        if (t.dep !== 'relcl') continue;
        const rel = s.subtree(t).find((d) => ['WDT', 'WP', 'WP$'].includes(d.tag) || (d.lower === 'that' && d.i < t.i));
        const headNoun = s.head(t);
        const start = rel ? rel.i : t.i;
        const nonRestrictive = start > 0 && s.tokens[start - 1].form === ',';
        const sp = headNoun ? span(s, headNoun.i, t.i) : t.form;
        if (nonRestrictive) {
            found.push({ id: 'rel_nonrestrictive', span: sp });
            continue;
        }
        const ids: Record<string, string> = {
            who: 'rel_who',
            which: 'rel_which',
            whom: 'rel_whom',
            whose: 'rel_whose',
            that: 'rel_that',
        };
        found.push({ id: ids[rel?.lower ?? 'that'] ?? 'rel_that', span: sp });
    }
    return found;
}

function clauses(s: UdSentence): Hit[] {
    const found: Hit[] = [];
    for (const t of s.tokens) {
        const kids = s.children(t.i);
        if (t.dep === 'ccomp') {
            const mark = kids.find((c) => c.dep === 'mark' && c.lower === 'that');
            if (mark) found.push({ id: 'that_clause', span: span(s, mark.i, t.i) });
        }
        if (['ccomp', 'advcl', 'acl', 'dobj', 'pcomp'].includes(t.dep)) {
            const wh = kids.find((c) => ['WDT', 'WP', 'WP$', 'WRB'].includes(c.tag) && WH_WORDS.has(c.lower));
            if (wh && wh.i !== 0) found.push({ id: 'wh_clause', span: span(s, wh.i, t.i) });
        }
        if (t.dep === 'advcl') {
            const mark = kids.find(
                (c) => (c.dep === 'mark' || (c.dep === 'advmod' && c.tag === 'WRB')) && SUBORDINATORS.has(c.lower)
            );
            if (mark) found.push({ id: 'adv_clause', span: span(s, mark.i, t.i), code: SUBORDINATOR_CODE[mark.lower] });
        }
    }
    return found;
}

const VERBISH_TAGS = new Set(['MD', 'VBZ', 'VBP', 'VBD']);
const isVerbish = (t: UdToken) => VERBISH_TAGS.has(t.tag) || t.upos === 'AUX';

function questions(s: UdSentence): Hit[] {
    const found: Hit[] = [];
    const toks = s.tokens;
    if (!toks.length) return found;
    const isQuestion = toks[toks.length - 1].form === '?';
    const first = toks[0];
    if (isQuestion && WH_WORDS.has(first.lower)) {
        found.push({ id: 'wh_question', span: first.form, code: WH_QUESTION_CODE[first.lower] ?? 'INT.what' });
    } else if (isQuestion && isVerbish(first) && ['aux', 'auxpass', 'ROOT', 'cop'].includes(first.dep)) {
        found.push({ id: 'yesno_question', span: first.form });
    }
    if (isQuestion && toks.length >= 4) {
        const n = toks.length;
        const tail = toks.slice(n - 4);
        if (tail[0].form === ',' && isVerbish(tail[1]) && tail[2].upos === 'PRON') {
            found.push({ id: 'tag_question', span: span(s, tail[0].i, tail[3].i) });
        } else if (
            toks[n - 2].upos === 'PRON' &&
            toks.slice(n - 4, n - 1).some(isVerbish) &&
            toks.slice(Math.max(n - 5, 0), n - 2).some((t) => t.form === ',')
        ) {
            found.push({ id: 'tag_question', span: span(s, toks[n - 4].i, toks[n - 1].i) });
        }
    }
    return found;
}

function existential(s: UdSentence): Hit[] {
    return s.tokens
        .filter((t) => t.dep === 'expl' && t.lower === 'there')
        .map((t) => {
            const h = s.head(t);
            return { id: 'there_be', span: h && h.i >= t.i ? span(s, t.i, h.i) : span(s, t.i, t.i + 1) };
        });
}

function imperative(s: UdSentence): Hit[] {
    const toks = s.tokens.filter((t) => t.upos !== 'PUNCT');
    if (!toks.length) return [];
    const root = s.tokens.find((t) => t.dep === 'ROOT');
    if (!root) return [];
    const hasSubj = hasChild(s, root, (c) => ['nsubj', 'nsubjpass', 'expl'].includes(c.dep));
    const first = toks[0];
    if (
        ['let', "let's", 'lets'].includes(first.lower) &&
        (first.lower !== 'let' || (toks.length > 1 && ['us', "'s"].includes(toks[1].lower)))
    ) {
        return [{ id: 'lets', span: span(s, first.i, first.i + 1) }];
    }
    if (['do', "don't", 'never'].includes(first.lower) && root.tag === 'VB' && !hasSubj) {
        return [{ id: 'neg_imperative', span: span(s, first.i, root.i) }];
    }
    if (root.tag === 'VB' && !hasSubj && root.i <= first.i + 1 && root.lemma.toLowerCase() !== 'let') {
        return [{ id: 'imperative', span: root.form }];
    }
    return [];
}

function conditionals(s: UdSentence): Hit[] {
    const found: Hit[] = [];
    const ifTok = s.tokens.find((t) => t.lemma.toLowerCase() === 'if' && t.dep === 'mark');
    const wishTok = s.tokens.find((t) => t.lemma.toLowerCase() === 'wish');
    if (wishTok) {
        const comp = s.children(wishTok.i).find((c) => c.dep === 'ccomp');
        if (comp) found.push({ id: 'wish_clause', span: span(s, wishTok.i, comp.i) });
    }
    if (ifTok) {
        const ifHead = s.head(ifTok);
        if (ifHead) {
            const cop = s.children(ifHead.i).find((c) => c.dep === 'cop');
            const verb = cop ?? ifHead;
            const ifAuxes = auxesOf(s, ifHead);
            const ifAuxLemmas = ifAuxes.map((a) => a.lemma.toLowerCase());
            const ifPast = isPast(ifAuxes[0] ?? verb) || ifAuxes.some((a) => a.lower === 'had');
            const main = ifHead.dep === 'advcl' ? s.head(ifHead) : null;
            let mainModal: string | null = null;
            let mainHave = false;
            if (main) {
                for (const a of auxesOf(s, main)) {
                    if (a.tag === 'MD') mainModal = a.lemma.toLowerCase();
                    if (a.lemma.toLowerCase() === 'have') mainHave = true;
                }
            }
            const sp = span(s, ifTok.i, ifHead.i);
            if (ifAuxLemmas.includes('have') && ifHead.tag === 'VBN' && mainHave)
                found.push({ id: 'cond_third', span: sp });
            else if (ifPast && mainModal && ['would', 'could', 'might'].includes(mainModal))
                found.push({ id: 'cond_second', span: sp });
            else found.push({ id: 'cond_first', span: sp });
        }
    }
    return found;
}

function causatives(s: UdSentence): Hit[] {
    const found: Hit[] = [];
    for (const t of s.tokens) {
        const lemma = t.lemma.toLowerCase();
        const kids = s.children(t.i);
        const letUs = lemma === 'let' && kids.some((c) => c.lower === "'s" || c.lower === 'us');
        if (['make', 'let', 'have'].includes(lemma) && !letUs) {
            const inf = kids.find((c) => ['ccomp', 'xcomp'].includes(c.dep) && c.tag === 'VB');
            if (inf && (hasChild(s, inf, (g) => g.dep === 'nsubj') || kids.some((c) => c.dep === 'dobj'))) {
                found.push({ id: 'caus_make', span: span(s, t.i, inf.i) });
            }
        }
        if (['have', 'get'].includes(lemma)) {
            const pp = kids.find((c) => ['ccomp', 'xcomp', 'oprd'].includes(c.dep) && c.tag === 'VBN');
            const objPp = kids.find(
                (c) => c.dep === 'dobj' && hasChild(s, c, (g) => g.dep === 'acl' && g.tag === 'VBN')
            );
            if (pp) found.push({ id: 'caus_have_pp', span: span(s, t.i, pp.i) });
            else if (objPp) {
                const acl = s.children(objPp.i).find((g) => g.dep === 'acl' && g.tag === 'VBN')!;
                found.push({ id: 'caus_have_pp', span: span(s, t.i, acl.i) });
            }
        }
        if (['ask', 'tell', 'want', 'advise', 'order', 'persuade'].includes(lemma)) {
            const xcomp = kids.find((c) => c.dep === 'xcomp' && hasChild(s, c, (g) => g.tag === 'TO'));
            const obj = kids.find((c) => c.dep === 'dobj');
            if (xcomp && obj) found.push({ id: 'caus_ask_tell', span: span(s, t.i, xcomp.i) });
        }
    }
    return found;
}

function inversion(s: UdSentence): Hit[] {
    const found: Hit[] = [];
    const toks = s.tokens;
    if (!toks.length) return found;
    const first = toks[0];
    if (
        INVERSION_TRIGGERS.has(first.lower) &&
        toks.length > 2 &&
        ['MD', 'VB', 'VBZ', 'VBP', 'VBD', 'VBN'].includes(toks[1].tag) &&
        ['aux', 'auxpass'].includes(toks[1].dep)
    ) {
        found.push({ id: 'inversion_neg', span: span(s, first.i, toks[2].i) });
    }
    if (first.lower === 'no' && toks.length > 1 && toks[1].lower === 'sooner') {
        found.push({ id: 'inversion_neg', span: span(s, first.i, toks[1].i) });
    }
    return found;
}

function subjunctive(s: UdSentence): Hit[] {
    const found: Hit[] = [];
    for (const t of s.tokens) {
        if (!MANDATIVE_VERBS.has(t.lemma.toLowerCase())) continue;
        const comp = s.children(t.i).find((c) => c.dep === 'ccomp');
        if (!comp) continue;
        if (!hasChild(s, comp, (c) => c.dep === 'mark' && c.lower === 'that')) continue;
        const subj = s.children(comp.i).find((c) => c.dep === 'nsubj');
        const uninflected = comp.lower === comp.lemma.toLowerCase();
        const thirdSing = !!subj && subj.feats.Number === 'Sing' && subj.feats.Person === '3';
        if (comp.tag === 'VB' || (comp.tag === 'VBP' && uninflected && thirdSing)) {
            found.push({ id: 'subjunctive_mandative', span: span(s, t.i, comp.i) });
        }
    }
    return found;
}

/** Constructions found in one sentence, in detection order. */
export function analyzeSentence(s: UdSentence): Hit[] {
    const raw: Hit[] = [];
    const covered = new Set<number>();
    raw.push(...multiwordVerbs(s, covered));
    for (const g of verbGroups(s)) {
        if (covered.has(g.head.i) || covered.has(g.main.i)) continue;
        if (!isFiniteGroup(g)) continue;
        const hit = analyzeVerbGroup(s, g);
        if (hit) raw.push(hit);
    }
    raw.push(...nonFinite(s, covered));
    for (const fn of [
        comparatives,
        relatives,
        clauses,
        questions,
        existential,
        imperative,
        conditionals,
        causatives,
        inversion,
        subjunctive,
    ]) {
        raw.push(...fn(s));
    }
    return raw;
}

export interface GrammarConstructionResult {
    id: string;
    name: string;
    category: string;
    count: number;
    examples: { span: string; sentence: string }[];
}

export interface GrammarProfileResult {
    sentenceCount: number;
    tokenCount: number;
    constructionCount: number;
    estimatedLevel: { typical: CefrLevel | '—'; reaches: CefrLevel | '—' };
    bandCounts: Record<CefrLevel, number>;
    results: Record<
        CefrLevel,
        { constructionCount: number; distinct: number; constructions: GrammarConstructionResult[] }
    >;
}

function levelOf(c: GrammarConstruction, codeOverride?: string): CefrLevel {
    const code = codeOverride || c.code;
    return (code && CEFRJ_CODE_LEVELS[code]) || c.fallback;
}

/** Every registered construction whose CEFR band is exactly `level` (grammar-gap target set). */
export function constructionsAtLevel(level: CefrLevel): { name: string; category: string }[] {
    return GRAMMAR_CONSTRUCTIONS.filter((c) => levelOf(c) === level)
        .map((c) => ({ name: c.name, category: c.category }))
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export function profileUdSentences(sentences: UdSentence[]): GrammarProfileResult {
    const agg = new Map<string, GrammarConstructionResult & { level: CefrLevel }>();
    let tokenCount = 0;
    const real = sentences.filter((s) => s.text.trim() || s.tokens.length);
    for (const s of real) {
        tokenCount += s.tokens.filter((t) => t.upos !== 'PUNCT' && t.upos !== 'SYM').length;
        for (const hit of analyzeSentence(s)) {
            const spec = REGISTRY.get(hit.id);
            if (!spec) continue;
            let entry = agg.get(hit.id);
            if (!entry) {
                entry = {
                    id: spec.id,
                    name: spec.name,
                    category: spec.category,
                    level: levelOf(spec, hit.code),
                    count: 0,
                    examples: [],
                };
                agg.set(hit.id, entry);
            }
            entry.count++;
            if (entry.examples.length < 3) entry.examples.push({ span: hit.span.trim(), sentence: s.text.trim() });
        }
    }

    const results = {} as GrammarProfileResult['results'];
    const bandCounts = {} as Record<CefrLevel, number>;
    for (const lvl of CEFR_ORDER) {
        const entries = [...agg.values()].filter((e) => e.level === lvl);
        entries.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        bandCounts[lvl] = entries.reduce((n, e) => n + e.count, 0);
        results[lvl] = {
            constructionCount: bandCounts[lvl],
            distinct: entries.length,
            constructions: entries.map(({ id, name, category, count, examples }) => ({
                id,
                name,
                category,
                count,
                examples,
            })),
        };
    }
    const constructionCount = Object.values(bandCounts).reduce((a, b) => a + b, 0);
    let typical: CefrLevel | '—' = '—';
    let reaches: CefrLevel | '—' = '—';
    if (constructionCount > 0) {
        typical = CEFR_ORDER.reduce((best, lvl) => (bandCounts[lvl] > bandCounts[best] ? lvl : best), CEFR_ORDER[0]);
        reaches = [...CEFR_ORDER].reverse().find((lvl) => bandCounts[lvl] > 0) ?? typical;
    }
    return {
        sentenceCount: real.length,
        tokenCount,
        constructionCount,
        estimatedLevel: { typical, reaches },
        bandCounts,
        results,
    };
}

/** Flat construction id → count, for callers that only need to ask "how often was X used". */
export function constructionCounts(profile: GrammarProfileResult): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const band of Object.values(profile.results)) {
        for (const c of band.constructions) counts[c.id] = c.count;
    }
    return counts;
}
