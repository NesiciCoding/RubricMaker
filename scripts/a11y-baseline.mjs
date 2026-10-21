#!/usr/bin/env node
// Merges the per-scan baseline slices written by `A11Y_UPDATE_BASELINE=1
// npm run e2e:a11y` into e2e/a11y-baseline.json.
//
// Each Playwright test writes only its own slice, so parallel workers never race
// on this file. Slices for route/theme pairs that were not scanned are preserved,
// which makes partial re-baselining (e.g. --grep=Settings) safe.
//
// Usage:
//   A11Y_UPDATE_BASELINE=1 npm run e2e:a11y
//   npm run e2e:a11y:baseline
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PARTS_DIR = resolve('test-results/a11y-baseline');
const BASELINE_PATH = resolve('e2e/a11y-baseline.json');

if (!existsSync(PARTS_DIR)) {
    console.error(`No baseline slices in ${PARTS_DIR}. Run A11Y_UPDATE_BASELINE=1 npm run e2e:a11y first.`);
    process.exit(1);
}

const parts = readdirSync(PARTS_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(join(PARTS_DIR, file), 'utf8')));

if (parts.length === 0) {
    console.error(`No baseline slices in ${PARTS_DIR}. Run A11Y_UPDATE_BASELINE=1 npm run e2e:a11y first.`);
    process.exit(1);
}

function readBaseline() {
    try {
        return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    } catch (err) {
        if (err.code === 'ENOENT') return { entries: [] };
        throw err;
    }
}

const previous = readBaseline();
const merged = new Map(previous.entries.map((entry) => [`${entry.theme}\u0000${entry.route}`, entry]));

for (const part of parts) {
    if (!part.route || !part.theme || !Array.isArray(part.violations)) {
        console.error(`Malformed baseline slice for ${part.theme ?? '?'} ${part.route ?? '?'}`);
        process.exit(1);
    }
    merged.set(`${part.theme}\u0000${part.route}`, {
        route: part.route,
        theme: part.theme,
        violations: part.violations
            .map(({ rule, nodes }) => ({ rule, nodes }))
            .sort((a, b) => a.rule.localeCompare(b.rule)),
    });
}

const entries = [...merged.values()].sort((a, b) => a.route.localeCompare(b.route) || a.theme.localeCompare(b.theme));

const gated = entries.reduce(
    (total, entry) => total + entry.violations.reduce((sum, violation) => sum + violation.nodes, 0),
    0
);

writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(
        {
            $comment:
                'Accepted accessibility debt for the axe gate (e2e/specs/51-a11y.spec.ts). Regenerate with A11Y_UPDATE_BASELINE=1 npm run e2e:a11y && npm run e2e:a11y:baseline. Delete this file when the app is conformant (the gate then runs in A11Y_STRICT mode).',
            version: 1,
            entries,
        },
        null,
        2
    )}\n`
);

console.log(
    `Wrote ${BASELINE_PATH}: ${entries.length} route/theme rows, ${gated} baselined serious/critical node(s) from ${parts.length} scan(s).`
);
