import { CEFRJ_VOCABULARY } from '../data/cefrjVocabulary';
import type { CefrLevel, CefrVocabProfile, CefrWordHit } from '../types';

const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// Words too short or too common to be meaningful content indicators
const SKIP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would', 'shall', 'should',
  'may', 'might', 'can', 'could', 'must', 'to', 'of', 'in', 'on', 'at', 'by',
  'for', 'with', 'as', 'and', 'but', 'or', 'nor', 'so', 'yet', 'if', 'not',
  'no', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'i', 'me', 'you',
  'he', 'she', 'it', 'we', 'they', 'this', 'that', 'these', 'those', 'which',
  'who', 'what', 'how', 'when', 'where', 'why', 'all', 'more', 'very', 'just',
  'up', 'out', 'about', 'then', 'than', 'into', 'from', 'also',
]);

// Strip possessives and common suffixes to reach root form (lightweight lemmatiser)
function normalise(word: string): string[] {
  const w = word.toLowerCase().replace(/['']/g, "'").replace(/'s$/, '');
  const candidates: string[] = [w];
  // -ing → base (running → run, making → make)
  if (w.endsWith('ing') && w.length > 5) {
    candidates.push(w.slice(0, -3));           // running → runn (matched partially)
    candidates.push(w.slice(0, -3) + 'e');     // making → make
  }
  // -ed → base
  if (w.endsWith('ed') && w.length > 4) {
    candidates.push(w.slice(0, -2));
    candidates.push(w.slice(0, -1));           // baked → bake (drop d)
  }
  // -s / -es → base
  if (w.endsWith('es') && w.length > 4) candidates.push(w.slice(0, -2));
  if (w.endsWith('s') && w.length > 3) candidates.push(w.slice(0, -1));
  // -ly → base adjective
  if (w.endsWith('ly') && w.length > 4) candidates.push(w.slice(0, -2));
  return candidates;
}

function lookupLevel(word: string): CefrLevel | null {
  for (const form of normalise(word)) {
    const level = CEFRJ_VOCABULARY[form];
    if (level) return level as CefrLevel;
  }
  return null;
}

/** Tokenise text into lowercase word tokens, skipping punctuation and numbers. */
function tokenise(text: string): string[] {
  return text
    .replace(/[–—]/g, ' ')
    .split(/[^a-zA-Z'-]+/)
    .map((w) => w.toLowerCase().replace(/^'+|'+$/g, ''))
    .filter((w) => w.length > 2 && !SKIP_WORDS.has(w));
}

/**
 * Profile the CEFR vocabulary level of a piece of student text.
 * Returns a distribution of content-word counts by CEFR level and an estimated
 * overall vocabulary level.
 */
export function profileText(text: string): CefrVocabProfile {
  const levelCounts: Record<CefrLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
  const tokens = tokenise(text);

  // Count matched tokens by level (de-duplicate per sentence to avoid penalising repetition)
  const seenInWindow = new Map<string, CefrLevel>();
  const highlightCandidates = new Map<string, CefrLevel>();

  for (const token of tokens) {
    const level = lookupLevel(token);
    if (!level) continue;
    levelCounts[level]++;
    const existing = seenInWindow.get(token);
    // Track highest-level occurrence for highlight words
    if (!existing || LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(existing)) {
      seenInWindow.set(token, level);
    }
  }

  const total = Object.values(levelCounts).reduce((s, c) => s + c, 0);

  // Estimated level: highest level with ≥5% of matched content words
  let estimatedLevel: CefrLevel = 'A1';
  if (total > 0) {
    for (const level of [...LEVEL_ORDER].reverse()) {
      if (levelCounts[level] / total >= 0.05) {
        estimatedLevel = level;
        break;
      }
    }
  }

  // Highlight words: unique words at or above estimated level (max 30)
  const estimatedIdx = LEVEL_ORDER.indexOf(estimatedLevel);
  for (const [word, level] of seenInWindow) {
    if (LEVEL_ORDER.indexOf(level) >= estimatedIdx && level !== 'A1') {
      highlightCandidates.set(word, level);
    }
  }

  const highlightWords: CefrWordHit[] = [...highlightCandidates.entries()]
    .sort(([, a], [, b]) => LEVEL_ORDER.indexOf(b) - LEVEL_ORDER.indexOf(a))
    .slice(0, 30)
    .map(([word, level]) => ({ word, level }));

  return { levelCounts, highlightWords, estimatedLevel };
}
