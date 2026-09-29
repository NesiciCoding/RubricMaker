// Universal Dependencies (CoNLL-U) sentence model and reader. udpipe-wasm's own
// parseConllu drops the xpos (Penn tag) and FEATS columns that the grammar
// detectors need, so we read the raw CoNLL-U ourselves.

export interface UdToken {
    /** 0-based index within the sentence */
    i: number;
    form: string;
    lower: string;
    lemma: string;
    upos: string;
    /** Penn Treebank tag (e.g. VBD, MD, TO) */
    tag: string;
    feats: Record<string, string>;
    /** 0-based head index, -1 for the root */
    head: number;
    /** UD relation with any subtype, e.g. "aux:pass" */
    deprel: string;
    /** Relation reduced to the spaCy-style label the detectors were written against */
    dep: string;
    spaceAfter: boolean;
}

export interface UdSentence {
    text: string;
    tokens: UdToken[];
    children: (i: number) => UdToken[];
    head: (t: UdToken) => UdToken | null;
    subtree: (t: UdToken) => UdToken[];
    spanText: (lo: number, hi: number) => string;
}

function normaliseDep(deprel: string, lemma: string, upos: string): string {
    const [base, sub] = deprel.split(':');
    if (base === 'root') return 'ROOT';
    if (base === 'obj') return 'dobj';
    if (base === 'nsubj' && sub === 'pass') return 'nsubjpass';
    if (base === 'csubj' && sub === 'pass') return 'csubjpass';
    if (base === 'aux' && sub === 'pass') return 'auxpass';
    if (base === 'acl' && sub === 'relcl') return 'relcl';
    if (base === 'advmod' && upos === 'PART' && (lemma === 'not' || lemma === "n't")) return 'neg';
    return base;
}

function parseFeats(raw: string): Record<string, string> {
    const out: Record<string, string> = {};
    if (raw === '_') return out;
    for (const kv of raw.split('|')) {
        const eq = kv.indexOf('=');
        if (eq > 0) out[kv.slice(0, eq)] = kv.slice(eq + 1);
    }
    return out;
}

function buildSentence(text: string, tokens: UdToken[]): UdSentence {
    const kids = new Map<number, UdToken[]>();
    for (const t of tokens) {
        const list = kids.get(t.head) ?? [];
        list.push(t);
        kids.set(t.head, list);
    }
    const children = (i: number) => kids.get(i) ?? [];
    const subtree = (t: UdToken): UdToken[] => {
        const out: UdToken[] = [];
        const walk = (n: UdToken) => {
            out.push(n);
            children(n.i).forEach(walk);
        };
        walk(t);
        return out.sort((a, b) => a.i - b.i);
    };
    return {
        text,
        tokens,
        children,
        head: (t) => (t.head >= 0 ? tokens[t.head] : null),
        subtree,
        spanText: (lo, hi) => {
            let s = '';
            for (let k = Math.max(lo, 0); k <= Math.min(hi, tokens.length - 1); k++) {
                s += tokens[k].form + (k < hi && tokens[k].spaceAfter ? ' ' : '');
            }
            return s.trim();
        },
    };
}

/** Parse CoNLL-U (possibly several sentences) into sentences; multiword ranges and empty nodes are skipped. */
export function parseConlluSentences(conllu: string): UdSentence[] {
    const sentences: UdSentence[] = [];
    let text = '';
    let rows: string[][] = [];

    const flush = () => {
        if (!rows.length) return;
        const tokens: UdToken[] = rows.map((c, idx) => {
            const lemma = c[2];
            return {
                i: idx,
                form: c[1],
                lower: c[1].toLowerCase(),
                lemma,
                upos: c[3],
                tag: c[4],
                feats: parseFeats(c[5]),
                head: Number(c[6]) - 1,
                deprel: c[7],
                dep: normaliseDep(c[7], lemma.toLowerCase(), c[3]),
                spaceAfter: !(c[9] ?? '').includes('SpaceAfter=No'),
            };
        });
        sentences.push(buildSentence(text, tokens));
        rows = [];
        text = '';
    };

    for (const line of conllu.split('\n')) {
        if (!line.trim()) {
            flush();
            continue;
        }
        if (line.startsWith('#')) {
            const m = /^#\s*text\s*=\s*(.*)$/.exec(line);
            if (m) text = m[1];
            continue;
        }
        const c = line.split('\t');
        if (c.length < 8 || c[0].includes('-') || c[0].includes('.')) continue;
        rows.push(c);
    }
    flush();
    return sentences;
}

export interface UdParser {
    parse(text: string): UdSentence[];
}

interface UdPipeModule {
    FS: { writeFile(path: string, data: Uint8Array): void };
    initModel(path: string): boolean;
    parseToConllu(text: string): string;
}

let cached: Promise<UdParser> | null = null;

/**
 * Load udpipe-wasm and the English UD model from `modelUrl` (not bundled: the UD 2.5
 * models are CC BY-NC-SA). Lazy so the wasm never enters the main chunk; the promise is
 * cached and reset on failure so a later call can retry.
 */
export function loadUdParser(modelUrl: string, wasmUrl?: string): Promise<UdParser> {
    if (cached) return cached;
    cached = (async () => {
        // @ts-expect-error -- the emitted glue ships without types
        const glue = await import('udpipe-wasm/udpipe.glue.cjs');
        const create = (glue.default ?? glue) as (opts: object) => Promise<UdPipeModule>;
        const mod = await create(wasmUrl ? { locateFile: () => wasmUrl } : {});
        const res = await fetch(modelUrl);
        if (!res.ok) throw new Error(`UD model fetch failed (${res.status}) for ${modelUrl}`);
        mod.FS.writeFile('/model.udpipe', new Uint8Array(await res.arrayBuffer()));
        if (!mod.initModel('/model.udpipe')) throw new Error('UD model failed to load');
        return {
            parse(text: string) {
                const conllu = mod.parseToConllu(text);
                if (conllu.startsWith('ERROR:')) throw new Error(`udpipe: ${conllu.slice(7).trim()}`);
                return parseConlluSentences(conllu);
            },
        };
    })().catch((err) => {
        cached = null;
        throw err;
    });
    return cached;
}
