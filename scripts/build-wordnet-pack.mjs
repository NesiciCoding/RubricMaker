#!/usr/bin/env node
// Dev-only: builds public/wordnet/oewn-defs.json.gz from the Open English WordNet
// WN-LMF release (CC BY 4.0). Not part of the app bundle — the app downloads the
// generated pack on demand, after the teacher confirms.
//
// Usage: node scripts/build-wordnet-pack.mjs <english-wordnet-2024.xml.gz>
// Source: https://github.com/globalwordnet/english-wordnet/releases
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

const SENSES_PER_WORD = 3;
const src = process.argv[2];
if (!src) {
    console.error('Usage: node scripts/build-wordnet-pack.mjs <english-wordnet.xml.gz>');
    process.exit(1);
}

const xml = gunzipSync(readFileSync(src)).toString('utf8');
const decode = (s) =>
    s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&amp;/g, '&');

const synsets = new Map();
for (const m of xml.matchAll(/<Synset id="([^"]+)"[^>]*>([\s\S]*?)<\/Synset>/g)) {
    const def = /<Definition>([\s\S]*?)<\/Definition>/.exec(m[2]);
    if (!def) continue;
    const ex = /<Example>([\s\S]*?)<\/Example>/.exec(m[2]);
    synsets.set(m[1], { d: decode(def[1]).trim(), e: ex ? decode(ex[1]).trim() : undefined });
}

const POS = { n: 'n', v: 'v', a: 'a', s: 'a', r: 'r' };
const entries = [];
for (const m of xml.matchAll(/<LexicalEntry [^>]*>([\s\S]*?)<\/LexicalEntry>/g)) {
    const lemma = /<Lemma writtenForm="([^"]+)" partOfSpeech="(\w)"/.exec(m[1]);
    const pos = lemma && POS[lemma[2]];
    if (!pos) continue;
    const written = decode(lemma[1]);
    if (!/^[A-Za-z][A-Za-z'-]*$/.test(written)) continue;
    entries.push({ written, pos, body: m[1] });
}
// Lowercase-spelled entries first so "cat" (animal) outranks "CAT" (scan) once case-folded.
entries.sort((a, b) => Number(b.written === b.written.toLowerCase()) - Number(a.written === a.written.toLowerCase()));

const pack = Object.create(null);
for (const { written, pos, body } of entries) {
    const word = written.toLowerCase();
    for (const s of body.matchAll(/<Sense [^>]*synset="([^"]+)"/g)) {
        const syn = synsets.get(s[1]);
        if (!syn) continue;
        const list = (pack[word] ??= []);
        if (list.length >= SENSES_PER_WORD || list.some((x) => x[1] === syn.d)) continue;
        list.push(syn.e ? [pos, syn.d, syn.e] : [pos, syn.d]);
    }
}

mkdirSync('public/wordnet', { recursive: true });
const out = gzipSync(Buffer.from(JSON.stringify(pack)), { level: 9 });
writeFileSync('public/wordnet/oewn-defs.json.gz', out);
console.log(`${Object.keys(pack).length} words, ${(out.length / 1e6).toFixed(1)} MB gzipped`);
