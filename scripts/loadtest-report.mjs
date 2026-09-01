#!/usr/bin/env node
// loadtest-report.mjs — turn a k6 --summary-export JSON into one Markdown table
// row, printed to stdout and (optionally) appended to a results file.
//
// Usage:
//   node scripts/loadtest-report.mjs <summary.json> [out.md]
//
// Annotations are read from the environment so it slots into scripts/loadtest.sh:
//   PROFILE, TARGET   the run's profile / tier
//   LABEL             free-text label for the row (e.g. "4vCPU/8GB VM")
//
// The out.md file is created with a header the first time; subsequent runs
// append a row, so it accumulates into the sizing table docs/LOAD_TESTING_STAGING.md
// describes.

import { readFileSync, openSync, fstatSync, writeSync, closeSync } from 'node:fs';

const [, , summaryPath, outPath] = process.argv;

if (!summaryPath) {
    console.error('usage: node scripts/loadtest-report.mjs <summary.json> [out.md]');
    process.exit(1);
}
let summary;
try {
    summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
} catch (err) {
    const reason = err.code === 'ENOENT' ? 'not found' : `could not be parsed: ${err.message}`;
    console.error(`error: summary file ${summaryPath} ${reason}`);
    process.exit(1);
}

// --summary-export nests metrics under `metrics`; be tolerant if that changes.
const metrics = summary.metrics ?? summary;

const metric = (name) => metrics[name] ?? {};
// Trends expose p(95)/avg/…; rates expose `value` (0..1); counters expose count/rate;
// gauges expose value/max. Pick the first field that exists.
const field = (name, ...keys) => {
    const m = metric(name);
    for (const k of keys) {
        if (m[k] !== undefined && m[k] !== null) return m[k];
    }
    return undefined;
};

const ms = (v) => (v === undefined ? '—' : `${Math.round(v)}ms`);
const pct = (v) => (v === undefined ? '—' : `${(v * 100).toFixed(2)}%`);
const num = (v, d = 0) => (v === undefined ? '—' : Number(v).toFixed(d));

const row = {
    date: new Date().toISOString().slice(0, 16).replace('T', ' '),
    label: process.env.LABEL || '—',
    profile: process.env.PROFILE || '—',
    target: process.env.TARGET || '—',
    peakVUs: num(field('vus_max', 'max', 'value')),
    itersPerSec: num(field('iterations', 'rate'), 1),
    errorRate: pct(field('http_req_failed', 'value')),
    edgeP95: ms(field('edge_get_test_assignment', 'p(95)')),
    restP95: ms(field('rest_tests_read', 'p(95)')),
    httpP95: ms(field('http_req_duration', 'p(95)')),
};

const COLUMNS = [
    ['Date (UTC)', 'date'],
    ['Label', 'label'],
    ['Profile', 'profile'],
    ['Tier', 'target'],
    ['Peak VUs', 'peakVUs'],
    ['Iters/s', 'itersPerSec'],
    ['Error rate', 'errorRate'],
    ['edge p95', 'edgeP95'],
    ['rest p95', 'restP95'],
    ['http p95', 'httpP95'],
];

const headerLine = `| ${COLUMNS.map(([h]) => h).join(' | ')} |`;
const dividerLine = `| ${COLUMNS.map(() => '---').join(' | ')} |`;
const rowLine = `| ${COLUMNS.map(([, k]) => row[k]).join(' | ')} |`;

console.log(rowLine);

if (outPath) {
    // Open once and decide header-vs-append from the fd's size, so there is no
    // check-then-write race on the path (CodeQL js/file-system-race). Mode 'a'
    // creates the file if missing and positions writes at the end.
    const fd = openSync(outPath, 'a');
    try {
        const isNew = fstatSync(fd).size === 0;
        writeSync(fd, isNew ? `${headerLine}\n${dividerLine}\n${rowLine}\n` : `${rowLine}\n`);
        console.error(isNew ? `[report] created ${outPath}` : `[report] appended row to ${outPath}`);
    } finally {
        closeSync(fd);
    }
}
