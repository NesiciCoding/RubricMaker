import { sentenceBuilderChunks } from '../../supabase/functions/_shared/testScoring';

const normalise = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

const tileWords = (tile: string) => tile.split(' ').map(normalise);

/** Writes tiles back as a target sentence, bracketing the multi-word ones. */
export function chunksToSentence(chunks: string[]): string {
    return chunks.map((chunk) => (chunk.includes(' ') ? `[${chunk}]` : chunk)).join(' ');
}

/** Merges tile `index` with the tile after it. */
export function joinTiles(sentence: string, index: number): string {
    const chunks = sentenceBuilderChunks(sentence);
    if (index < 0 || index >= chunks.length - 1) return sentence;
    return chunksToSentence([
        ...chunks.slice(0, index),
        `${chunks[index]} ${chunks[index + 1]}`,
        ...chunks.slice(index + 2),
    ]);
}

/** Breaks tile `index` back into single words. */
export function splitTile(sentence: string, index: number): string {
    const chunks = sentenceBuilderChunks(sentence);
    if (!chunks[index]?.includes(' ')) return sentence;
    return chunksToSentence([...chunks.slice(0, index), ...chunks[index].split(' '), ...chunks.slice(index + 1)]);
}

/**
 * True when `sentence` can be laid out with every tile used once and word groups kept whole, ignoring case
 * and punctuation — the same comparison the scorer makes, so a false here means no student can earn full marks
 * for that word order.
 */
export function canBuildFromTiles(sentence: string, tiles: string[]): boolean {
    const target = sentenceBuilderChunks(sentence).flatMap(tileWords);
    const counts = new Map<string, { words: string[]; left: number }>();
    for (const tile of tiles) {
        const words = tileWords(tile);
        const key = words.join(' ');
        const entry = counts.get(key);
        if (entry) entry.left++;
        else counts.set(key, { words, left: 1 });
    }
    const totalWords = tiles.reduce((sum, tile) => sum + tile.split(' ').length, 0);
    if (totalWords !== target.length) return false;
    const entries = [...counts.values()];
    // A position with the same tiles left over fails the same way however it was reached.
    const failed = new Set<string>();
    const place = (pos: number): boolean => {
        if (pos === target.length) return true;
        const key = `${pos}|${entries.map((entry) => entry.left).join(',')}`;
        if (failed.has(key)) return false;
        for (const entry of entries) {
            if (entry.left === 0 || !entry.words.every((word, k) => target[pos + k] === word)) continue;
            entry.left--;
            const done = place(pos + entry.words.length);
            entry.left++;
            if (done) return true;
        }
        failed.add(key);
        return false;
    };
    return place(0);
}

/** True when a `[` or `]` has no partner, or groups are nested — the parser would then not group what the teacher meant. */
export function hasUnbalancedBrackets(sentence: string): boolean {
    let open = false;
    for (const ch of sentence) {
        if (ch === '[') {
            if (open) return true;
            open = true;
        } else if (ch === ']') {
            if (!open) return true;
            open = false;
        }
    }
    return open;
}
