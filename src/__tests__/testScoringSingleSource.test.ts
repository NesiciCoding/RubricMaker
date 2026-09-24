import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as shared from '../../supabase/functions/_shared/testScoring.ts';
import * as testCalc from '../utils/testCalc';
import * as clozeParse from '../utils/clozeParse';
import * as placementRouting from '../utils/placementRouting';

// Test auto-scoring used to be hand-copied into src/utils/testCalc.ts and both scoring edge
// functions, so the score a student saw could silently drift from the one the server
// validated. supabase/functions/_shared/testScoring.ts is now the only implementation; these
// guards stop a copy from creeping back in and keep the module loadable by both Deno and Vite.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharedPath = path.join(repoRoot, 'supabase/functions/_shared/testScoring.ts');
const sharedSrc = readFileSync(sharedPath, 'utf8');

const SCORING_EDGE_FUNCTIONS = ['submit-test', 'next-placement-question'];

const sharedFunctionNames = Object.entries(shared)
    .filter(([, value]) => typeof value === 'function')
    .map(([name]) => name);

function listSourceFiles(dir: string): string[] {
    return readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file))
        .map((file) => path.join(dir, file));
}

function definesFunction(source: string, name: string): boolean {
    return new RegExp(`(function\\s+${name}\\s*[<(])|((const|let)\\s+${name}\\s*=)`).test(source);
}

describe('shared test-scoring module', () => {
    it('exports the scorers and markup parsers', () => {
        expect(sharedFunctionNames).toEqual(
            expect.arrayContaining([
                'autoScoreResponse',
                'isAutoScorable',
                'parseClozeGaps',
                'parseHotTextFragments',
                'scoreCloze',
                'scoreHotText',
            ])
        );
    });

    it('has no imports, so Deno can load it without an import map', () => {
        expect(sharedSrc).not.toMatch(/^\s*import\s/m);
        expect(sharedSrc).not.toMatch(/\brequire\(/);
    });

    it('uses no runtime-specific globals', () => {
        for (const global of ['Deno.', 'window.', 'document.', 'localStorage', 'navigator.']) {
            expect(sharedSrc, global).not.toContain(global);
        }
    });
});

describe('single source of truth for scoring', () => {
    it.each(SCORING_EDGE_FUNCTIONS)('%s imports scoring from ../_shared/testScoring.ts', (fn) => {
        const source = readFileSync(path.join(repoRoot, 'supabase/functions', fn, 'index.ts'), 'utf8');
        expect(source).toMatch(/from '\.\.\/_shared\/testScoring\.ts'/);
    });

    it('no edge function redefines a shared scorer or parser', () => {
        const functionsDir = path.join(repoRoot, 'supabase/functions');
        const offenders = listSourceFiles(functionsDir)
            .filter((file) => !file.startsWith(path.join(functionsDir, '_shared')))
            .flatMap((file) => {
                const source = readFileSync(file, 'utf8');
                return sharedFunctionNames
                    .filter((name) => definesFunction(source, name))
                    .map((name) => `${path.relative(repoRoot, file)}: ${name}`);
            });
        expect(offenders).toEqual([]);
    });

    it('no client module redefines a shared scorer or parser', () => {
        const offenders = listSourceFiles(path.join(repoRoot, 'src')).flatMap((file) => {
            const source = readFileSync(file, 'utf8');
            return sharedFunctionNames
                .filter((name) => definesFunction(source, name))
                .map((name) => `${path.relative(repoRoot, file)}: ${name}`);
        });
        expect(offenders).toEqual([]);
    });

    it('client re-exports are the shared implementations, not wrappers', () => {
        expect(testCalc.autoScoreResponse).toBe(shared.autoScoreResponse);
        expect(testCalc.scoreCloze).toBe(shared.scoreCloze);
        expect(testCalc.scoreHotText).toBe(shared.scoreHotText);
        expect(testCalc.scoreShortAnswerExact).toBe(shared.scoreShortAnswerExact);
        expect(clozeParse.parseClozeGaps).toBe(shared.parseClozeGaps);
        expect(clozeParse.parseHotTextFragments).toBe(shared.parseHotTextFragments);
        expect(placementRouting.isAutoScorable).toBe(shared.isAutoScorable);
    });
});
