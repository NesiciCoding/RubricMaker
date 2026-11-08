// Rule-based (no AI) checks for punctuation and capital letters, linked from the "mechanics"
// grammar category via `detectShorthand`. Unlike GRAMMAR_PATTERNS, which only count uses of a
// structure, every rule here reports correct uses AND mistakes: using a full stop proves little,
// missing one is what a teacher wants flagged. Heuristics favour missing a mistake over inventing
// one, since a false accusation in feedback costs more than a miss.

export interface MechanicsCount {
    uses: number;
    mistakes: number;
}

interface Sentence {
    /** Trimmed sentence text, leading/trailing quotes and brackets kept. */
    text: string;
    /** Ends in . ? ! or … (optionally followed by closing quotes/brackets). */
    terminated: boolean;
    /** Follows a quoted ? or ! or an ellipsis, where a lowercase start is a speech tag or continuation. */
    continues: boolean;
}

interface Paragraph {
    text: string;
    sentences: Sentence[];
}

const ABBREVIATION = /(?:^|[\s(])(?:e\.g|i\.e|etc|vs|mr|mrs|ms|dr|st|no|approx|cf)\.$/i;
const SINGLE_INITIAL = /(?:^|\s)\p{Lu}\.$/u;
const CLOSERS = `"'’”»)\\]`;
const TERMINATED = new RegExp(`[.?!…][${CLOSERS}]*$`);
const OPENERS = /^[\s"'‘“«([-]+/;

// Extracted text keeps paragraphs apart with a blank line (DOCX, OCR, PDF pages); a single newline
// is an OCR line wrap inside a paragraph, so it must not end a sentence.
function paragraphs(text: string): Paragraph[] {
    return text
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
        .filter((p) => p.length > 0)
        .map((p) => ({ text: p, sentences: splitSentences(p) }));
}

const SPEECH_OR_ELLIPSIS_END = new RegExp(`(?:[?!][${CLOSERS}]|…|\\.\\.\\.)[${CLOSERS}]*$`);

function splitSentences(paragraph: string): Sentence[] {
    const out: Sentence[] = [];
    const boundary = new RegExp(`[.?!…]+[${CLOSERS}]*(?=\\s+|$)`, 'g');
    let start = 0;
    let continues = false;
    let m: RegExpExecArray | null;
    while ((m = boundary.exec(paragraph)) !== null) {
        const end = m.index + m[0].length;
        const candidate = paragraph.slice(start, end);
        if (ABBREVIATION.test(candidate) || SINGLE_INITIAL.test(candidate)) continue;
        const trimmed = candidate.trim();
        if (trimmed) out.push({ text: trimmed, terminated: true, continues });
        continues = SPEECH_OR_ELLIPSIS_END.test(m[0]);
        start = end;
    }
    const rest = paragraph.slice(start).trim();
    if (rest) out.push({ text: rest, terminated: TERMINATED.test(rest), continues });
    return out;
}

const stripOpeners = (s: string) => s.replace(OPENERS, '');
const wordCount = (s: string) => s.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;
const count = (text: string, re: RegExp) => text.match(re)?.length ?? 0;

function capitalSentenceStart(text: string): MechanicsCount {
    let uses = 0;
    let mistakes = 0;
    for (const p of paragraphs(text)) {
        for (const s of p.sentences) {
            const body = stripOpeners(s.text);
            const first = body.match(/^\S+/)?.[0] ?? '';
            // Lists, numbers, and brand-style words (iPhone, eBay) or links don't start with a letter to judge.
            if (!/^\p{L}/u.test(first) || /^\p{Ll}+\p{Lu}/u.test(first) || /[@/]|www\./i.test(first)) continue;
            if (/^\p{Lu}/u.test(first)) uses++;
            else if (!s.continues) mistakes++;
        }
    }
    return { uses, mistakes };
}

function capitalI(text: string): MechanicsCount {
    return {
        uses: count(text, /\bI\b(?!\.\p{L})/gu),
        // Excludes "i.e." and roman-numeral list markers such as "(i)".
        mistakes: count(text, /(?<![(\p{L}])\bi\b(?!\.\p{L}|\))/gu),
    };
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
// "may" and "march" are also ordinary words, so they are left out entirely.
const MONTHS = [
    'january',
    'february',
    'april',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
];
// "polish", "turkey" and "china" double as ordinary words, so they are left out.
const PEOPLES_AND_PLACES = [
    'english',
    'dutch',
    'french',
    'german',
    'spanish',
    'italian',
    'portuguese',
    'chinese',
    'japanese',
    'korean',
    'arabic',
    'turkish',
    'russian',
    'greek',
    'swedish',
    'norwegian',
    'danish',
    'irish',
    'scottish',
    'welsh',
    'british',
    'american',
    'canadian',
    'australian',
    'mexican',
    'indian',
    'belgian',
    'moroccan',
    'ukrainian',
    'european',
    'african',
    'asian',
    'england',
    'scotland',
    'ireland',
    'wales',
    'britain',
    'netherlands',
    'holland',
    'france',
    'germany',
    'spain',
    'italy',
    'portugal',
    'belgium',
    'america',
    'canada',
    'mexico',
    'europe',
    'africa',
    'asia',
    'australia',
    'japan',
    'india',
    'russia',
    'greece',
    'morocco',
    'ukraine',
];
const PROPER_WORD = new RegExp(`\\b(?:${[...DAYS, ...MONTHS, ...PEOPLES_AND_PLACES].join('|')})\\b`, 'giu');

function capitalProperNouns(text: string): MechanicsCount {
    let uses = 0;
    let mistakes = 0;
    for (const word of text.match(PROPER_WORD) ?? []) {
        if (/^\p{Lu}/u.test(word)) uses++;
        else mistakes++;
    }
    return { uses, mistakes };
}

function endPunctuation(text: string): MechanicsCount {
    let uses = 0;
    let mistakes = 0;
    paragraphs(text).forEach((p, index) => {
        for (const s of p.sentences) if (s.terminated) uses++;
        const last = p.sentences[p.sentences.length - 1];
        if (!last || last.terminated || /[:;,]$/.test(last.text)) return;
        // Headings, titles and list items routinely go without a full stop.
        const looksLikeTitle = index === 0 && wordCount(p.text) <= 10 && !/[.,;:?!]/.test(p.text);
        if (wordCount(last.text) >= 6 && !looksLikeTitle) mistakes++;
    });
    return { uses, mistakes };
}

const AUX = 'am|is|are|was|were|do|does|did|have|has|had|can|could|will|would|should|shall|may|might|must';
const QUESTION_START = new RegExp(
    // Not questions: "Do it now." (imperative), "What is more, …" / "What is important is …" (pseudo-cleft),
    // "Had he known, …" / "Were I rich, …" / "Should you need help, …" (conditional inversion).
    `^(?!do\\s+(?:it|this|that)\\b)(?!what\\s+is\\s+(?:more|worse|better)\\b)(?!(?:what|which)\\s+(?:is|was)\\s+\\w+\\s+(?:is|was)\\b)(?!(?:had|were|should)\\s+(?:i|you|he|she|it|we|they|there)\\b[^?]*,)(?:(?:what|where|when|why|who|whom|whose|which|how)\\s+(?:${AUX})(?:n['’]t)?\\b|(?:${AUX})(?:n['’]t)?\\s+(?:i|you|he|she|it|we|they|there|this|that)\\b)`,
    'i'
);
const QUESTION_END = new RegExp(`\\?[${CLOSERS}]*$`);

function questionMark(text: string): MechanicsCount {
    let uses = 0;
    let mistakes = 0;
    for (const p of paragraphs(text)) {
        for (const s of p.sentences) {
            if (QUESTION_END.test(s.text)) uses++;
            else if (QUESTION_START.test(stripOpeners(s.text))) mistakes++;
        }
    }
    return { uses, mistakes };
}

function punctuationSpacing(text: string): MechanicsCount {
    const flat = text.replace(/\s*\n\s*/g, ' ');
    const uses = count(flat, /(?<=[\p{L}\p{N}"'’”)])[,;:?!.](?=\s|$)/gu);
    const spaceBefore = count(flat, /(?<=[\p{L}\p{N}])[ \t]+(?:[,;:?!]|\.(?!\.))(?=\s|$)/gu);
    const noSpaceAfterComma = count(flat, /(?<=\p{L})[,;](?=\p{L})/gu);
    // Two lowercase letters before the mark keep abbreviations (U.S.Army, e.g.The) out.
    const noSpaceAfterStop = count(flat, /(?<=\p{Ll}{2})[.?!](?=\p{Lu}\p{Ll})/gu);
    return { uses, mistakes: spaceBefore + noSpaceAfterComma + noSpaceAfterStop };
}

const CONTRACTION_USE =
    /\b(?:\p{L}+n['’]t|(?:I|you|he|she|it|we|they|that|there|what|who|here|let)['’](?:m|re|ve|ll|d|s))\b/giu;
// "wont", "ill", "well", "were", "its", "id", "hell", "shell", "shed", "wed" and "lets" are real
// words too, so only forms that are never correct without an apostrophe are listed.
const CONTRACTION_MISSING =
    /\b(?:dont|doesnt|didnt|isnt|arent|wasnt|werent|hasnt|havent|hadnt|cant|couldnt|shouldnt|wouldnt|mustnt|neednt|im|ive|youre|youve|youll|youd|theyre|theyve|theyll|theyd|weve|thats|whats|theres|whos|hes|shes|itll|wouldve|couldve|shouldve)\b/gi;

function apostropheContractions(text: string): MechanicsCount {
    return { uses: count(text, CONTRACTION_USE), mistakes: count(text, CONTRACTION_MISSING) };
}

const OPENING_LINKER =
    /^(?:however(?! (?:much|many|hard|long|little|often|well|far|good|bad|big|small|you)\b)|therefore|moreover|furthermore|firstly|secondly|thirdly|finally|lastly|first of all|in addition(?! to\b)|for example|for instance|in conclusion|to conclude|to sum up|on the other hand|nevertheless|consequently|as a result(?! of\b)|in my opinion|meanwhile|in fact)\b(.?)/i;

function commaAfterLinker(text: string): MechanicsCount {
    let uses = 0;
    let mistakes = 0;
    for (const p of paragraphs(text)) {
        for (const s of p.sentences) {
            const m = stripOpeners(s.text).match(OPENING_LINKER);
            if (!m) continue;
            if (m[1] === ',') uses++;
            else if (m[1] === ' ') mistakes++;
        }
    }
    return { uses, mistakes };
}

export const MECHANICS_RULES: Record<string, (text: string) => MechanicsCount> = {
    'MECH.CAP.START': capitalSentenceStart,
    'MECH.CAP.I': capitalI,
    'MECH.CAP.PROPER': capitalProperNouns,
    'MECH.END': endPunctuation,
    'MECH.QMARK': questionMark,
    'MECH.SPACE': punctuationSpacing,
    'MECH.APOS.CONTR': apostropheContractions,
    'MECH.COMMA.LINKER': commaAfterLinker,
};

export function isMechanicsShorthand(shorthand: string): boolean {
    return Object.hasOwn(MECHANICS_RULES, shorthand);
}

/** Uses and mistakes per requested mechanics shorthand; unknown shorthands are omitted. */
export function detectMechanics(text: string, shorthands: string[]): Record<string, MechanicsCount> {
    const result: Record<string, MechanicsCount> = {};
    for (const sh of shorthands) {
        if (isMechanicsShorthand(sh)) result[sh] = MECHANICS_RULES[sh](text);
    }
    return result;
}
