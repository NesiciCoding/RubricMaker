#!/usr/bin/env node
/**
 * Generates docs/badges/coverage.json — a shields.io endpoint badge fed by CI.
 *
 * Reads the line-coverage percentage from vitest's coverage-summary.json
 * (emitted by the `json-summary` reporter configured in vite.config.ts) and
 * writes a shields endpoint-format JSON. The badge is committed to the repo on
 * main pushes by the `coverage-badge` job in .github/workflows/ci.yml, so the
 * README badge works with no external coverage service (Codecov/Coveralls) and
 * no token.
 *
 * Usage: node scripts/generate-coverage-badge.mjs [path-to-coverage-summary.json]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const summaryPath = resolve(process.argv[2] ?? `${root}/coverage/coverage-summary.json`);
const outPath = `${root}/docs/badges/coverage.json`;

let pct;
try {
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  pct = summary?.total?.lines?.pct;
} catch (err) {
  console.error(`generate-coverage-badge: cannot read ${summaryPath} — ${err.message}`);
  process.exit(1);
}

if (typeof pct !== 'number' || Number.isNaN(pct)) {
  console.error(`generate-coverage-badge: no total.lines.pct found in ${summaryPath}`);
  process.exit(1);
}

pct = Math.round(pct * 10) / 10;

// Shields.io flat-badge colors by coverage tier.
const color =
  pct >= 90 ? 'brightgreen' :
  pct >= 80 ? 'green' :
  pct >= 70 ? 'yellowgreen' :
  pct >= 60 ? 'yellow' :
  pct >= 40 ? 'orange' :
  'red';

const badge = {
  schemaVersion: 1,
  label: 'coverage',
  message: `${pct}%`,
  color,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(badge, null, 2)}\n`);
console.log(`generate-coverage-badge: wrote ${outPath} (${pct}% lines, ${color})`);
