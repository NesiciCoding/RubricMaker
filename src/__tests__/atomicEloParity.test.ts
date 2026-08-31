import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ELO_RATING, ELO_K_FACTOR } from '../utils/placementStaircase';

// The atomic per-question Elo update (issue #336, migration 064) re-implements the
// Elo delta math in SQL so the read-modify-write happens under a single row lock.
// That SQL duplicates the constants that otherwise live only in placementStaircase.ts.
// Nothing but this test keeps the two in sync: if someone retunes ELO_K_FACTOR,
// DEFAULT_ELO_RATING, or the /400 expected-score divisor in TS but not in the RPC,
// submit-test's persisted ratings would silently drift from the app's own Elo math.
// See docs/CONCURRENCY.md.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rpcSql = readFileSync(path.join(repoRoot, 'supabase/migrations/064_atomic_test_question_elo.sql'), 'utf8');
const staircaseSrc = readFileSync(path.join(repoRoot, 'src/utils/placementStaircase.ts'), 'utf8');

/** The body of the named `export function`, brace-balanced, so assertions can't match a stray comment elsewhere. */
function functionBody(src: string, signature: string): string {
    const start = src.indexOf(signature);
    expect(start, `${signature} not found`).toBeGreaterThan(-1);
    const open = src.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    throw new Error(`unbalanced braces after ${signature}`);
}

const eloExpectedScoreFn = functionBody(staircaseSrc, 'export function eloExpectedScore');

describe('atomic Elo RPC parity with placementStaircase', () => {
    it('uses the same K factor as ELO_K_FACTOR', () => {
        expect(ELO_K_FACTOR).toBe(24);
        expect(rpcSql).toMatch(new RegExp(`-\\s*${ELO_K_FACTOR}\\s*\\*`));
    });

    it('uses the same default rating as DEFAULT_ELO_RATING', () => {
        expect(DEFAULT_ELO_RATING).toBe(1200);
        expect(rpcSql).toContain(`::numeric, ${DEFAULT_ELO_RATING})`);
    });

    it('uses the same expected-score divisor (400) as eloExpectedScore', () => {
        // 400 is the Elo scale divisor. Scope each match to the expected-score expression
        // itself — eloExpectedScore's body, and the RPC's power(10::numeric, … / 400.0) term —
        // so a stray /400 in a comment or unrelated expression can't satisfy the test.
        expect(eloExpectedScoreFn).toMatch(/10 \*\* \(\(itemRating - opponentRating\) \/ 400\)/);
        expect(rpcSql).toMatch(/power\(\s*10::numeric,[\s\S]*?\/\s*400\.0/);
    });

    it('applies the delta as rating - K*(actual - expected), matching updateItemElo', () => {
        // The item-difficulty update subtracts the delta (a correct answer lowers the
        // item's rating), the opposite sign from a player-rating Elo update.
        expect(staircaseSrc).toMatch(/itemRating\s*-\s*ELO_K_FACTOR\s*\*/);
        expect(rpcSql).toMatch(/COALESCE\(\(q ->> 'eloRating'\)::numeric, 1200\)\s*-\s*24 \*/);
    });
});
