#!/usr/bin/env node
// Maps a production error frame back to the original source (#870).
//
//   node scripts/decode-error-frame.mjs <sourcemaps-dir> assets/index-BtRH-A10.js:1:48213 [...more frames]
//
// A frame is `file:line:col` exactly as stored in client_logs.meta->'frames' (the "Top error
// signatures" panel shows the first one). <sourcemaps-dir> is the unzipped `sourcemaps-<sha>` CI
// artifact for the release in client_logs.app_version (the first 12 characters of that commit).
//
// Uses `source-map-js`, which ships with Vite, so there is nothing extra to install.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SourceMapConsumer } = require('source-map-js');

const [directory, ...frames] = process.argv.slice(2);
if (!directory || frames.length === 0) {
    console.error('usage: node scripts/decode-error-frame.mjs <sourcemaps-dir> <file:line:col> [...]');
    process.exit(2);
}

let failed = false;
for (const frame of frames) {
    const match = frame.match(/^(.+):(\d+):(\d+)$/);
    if (!match) {
        console.error(`${frame}: not a file:line:col frame`);
        failed = true;
        continue;
    }
    const [, file, line, column] = match;
    const mapPath = join(directory, `${file}.map`);
    if (!existsSync(mapPath)) {
        console.error(`${frame}: no ${mapPath} (wrong release artifact?)`);
        failed = true;
        continue;
    }
    const consumer = new SourceMapConsumer(JSON.parse(readFileSync(mapPath, 'utf8')));
    // Browsers report 1-based columns, the source map format counts from 0.
    const original = consumer.originalPositionFor({ line: Number(line), column: Number(column) - 1 });
    if (original.source) {
        console.log(
            `${frame}\n  → ${original.source}:${original.line}:${(original.column ?? 0) + 1}${original.name ? `  (${original.name})` : ''}`
        );
    } else {
        console.log(`${frame}\n  → no mapping at that position`);
        failed = true;
    }
}
process.exit(failed ? 1 : 0);
