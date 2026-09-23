import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as sharedScoring from '../../supabase/functions/_shared/testScoring.ts';
import * as sharedRouting from '../../supabase/functions/_shared/placementRouting.ts';
import * as sharedStaircase from '../../supabase/functions/_shared/placementStaircase.ts';
import * as sharedShuffle from '../../supabase/functions/_shared/seededShuffle.ts';
import * as testCalc from '../utils/testCalc';
import * as clozeParse from '../utils/clozeParse';
import * as placementRouting from '../utils/placementRouting';
import * as placementStaircase from '../utils/placementStaircase';
import * as seededShuffle from '../utils/seededShuffle';
import { CEFR_LEVELS } from '../data/cefrDescriptors';

// Test scoring, placement routing and the staircase/Elo ladder used to be hand-copied into
// src/utils/ and the submit-test / next-placement-question edge functions, so the score and
// placement a student saw could silently drift from what the server validated. They now live
// only in supabase/functions/_shared/; these guards stop a copy from creeping back in and keep
// the modules loadable by both Deno and Vite.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const functionsDir = path.join(repoRoot, 'supabase/functions');
const sharedDir = path.join(functionsDir, '_shared');

const SHARED_MODULES = {
    testScoring: sharedScoring,
    placementRouting: sharedRouting,
    placementStaircase: sharedStaircase,
    seededShuffle: sharedShuffle,
};

const EDGE_FUNCTION_IMPORTS: Record<string, (keyof typeof SHARED_MODULES)[]> = {
    'submit-test': ['testScoring', 'placementRouting', 'placementStaircase'],
    'next-placement-question': ['testScoring', 'placementStaircase', 'seededShuffle'],
};

const sharedFunctionNames = [
    ...new Set(
        Object.values(SHARED_MODULES).flatMap((mod) =>
            Object.entries(mod)
                .filter(([, value]) => typeof value === 'function')
                .map(([name]) => name)
        )
    ),
];

function listSourceFiles(dir: string): string[] {
    return readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file))
        .map((file) => path.join(dir, file));
}

function definesFunction(source: string, name: string): boolean {
    return new RegExp(`(function\\s+${name}\\s*[<(])|((const|let)\\s+${name}\\s*=)`).test(source);
}

function redefinitions(files: string[]): string[] {
    return files.flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        return sharedFunctionNames
            .filter((name) => definesFunction(source, name))
            .map((name) => `${path.relative(repoRoot, file)}: ${name}`);
    });
}

describe('shared edge-function modules', () => {
    const sharedFiles = listSourceFiles(sharedDir);

    it('covers every module in _shared/', () => {
        expect(sharedFiles.map((f) => path.basename(f, '.ts')).sort()).toEqual(Object.keys(SHARED_MODULES).sort());
    });

    it.each(sharedFiles.map((f) => [path.basename(f), f]))(
        '%s only imports sibling _shared modules, so Deno needs no import map',
        (_name, file) => {
            const source = readFileSync(file, 'utf8');
            const specifiers = [...source.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
            for (const specifier of specifiers) expect(specifier).toMatch(/^\.\/[\w-]+\.ts$/);
            expect(source).not.toMatch(/\brequire\(/);
        }
    );

    it.each(sharedFiles.map((f) => [path.basename(f), f]))('%s uses no runtime-specific globals', (_name, file) => {
        const source = readFileSync(file, 'utf8');
        for (const global of ['Deno.', 'window.', 'document.', 'localStorage', 'navigator.']) {
            expect(source, global).not.toContain(global);
        }
    });

    it('keeps the CEFR level order identical to the app data', () => {
        expect([...sharedStaircase.CEFR_LEVELS]).toEqual(CEFR_LEVELS);
    });
});

describe('single source of truth', () => {
    it.each(Object.entries(EDGE_FUNCTION_IMPORTS))('%s imports its logic from _shared/', (fn, modules) => {
        const source = readFileSync(path.join(functionsDir, fn, 'index.ts'), 'utf8');
        for (const mod of modules) expect(source).toContain(`from '../_shared/${mod}.ts'`);
    });

    it('no edge function redefines a shared function', () => {
        const files = listSourceFiles(functionsDir).filter((file) => !file.startsWith(sharedDir));
        expect(redefinitions(files)).toEqual([]);
    });

    it('no client module redefines a shared function', () => {
        expect(redefinitions(listSourceFiles(path.join(repoRoot, 'src')))).toEqual([]);
    });

    it('client re-exports are the shared implementations, not wrappers', () => {
        expect(testCalc.autoScoreResponse).toBe(sharedScoring.autoScoreResponse);
        expect(testCalc.scoreCloze).toBe(sharedScoring.scoreCloze);
        expect(testCalc.scoreHotText).toBe(sharedScoring.scoreHotText);
        expect(testCalc.scoreShortAnswerExact).toBe(sharedScoring.scoreShortAnswerExact);
        expect(clozeParse.parseClozeGaps).toBe(sharedScoring.parseClozeGaps);
        expect(clozeParse.parseHotTextFragments).toBe(sharedScoring.parseHotTextFragments);
        expect(placementRouting.isAutoScorable).toBe(sharedScoring.isAutoScorable);
        expect(placementRouting.resolveNextSection).toBe(sharedRouting.resolveNextSection);
        expect(placementRouting.scoreSectionPct).toBe(sharedRouting.scoreSectionPct);
        expect(placementRouting.hasRoutingCycle).toBe(sharedRouting.hasRoutingCycle);
        expect(placementStaircase.computeStaircaseState).toBe(sharedStaircase.computeStaircaseState);
        expect(placementStaircase.updateItemElo).toBe(sharedStaircase.updateItemElo);
        expect(placementStaircase.pickNearestEloItem).toBe(sharedStaircase.pickNearestEloItem);
        expect(placementStaircase.LEVEL_TO_ELO).toBe(sharedStaircase.LEVEL_TO_ELO);
        expect(seededShuffle.seededShuffle).toBe(sharedShuffle.seededShuffle);
    });
});
