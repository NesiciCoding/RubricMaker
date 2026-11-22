#!/usr/bin/env node
// Moves the hidden source maps out of dist/ so the deploy never publishes them (#870).
//
// The build emits `*.map` next to each bundle (`build.sourcemap: 'hidden'`: no sourceMappingURL
// comment, so browsers never ask for them). Production error rows carry `assets/<file>.js:line:col`
// plus the release (client_logs.app_version); the matching map is only needed on demand, from the
// CI artifact. See docs/ERROR_REPORTING.md for decoding a frame.
import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const target = process.argv[3] ?? 'sourcemaps';

function* walk(dir) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) yield* walk(path);
        else if (entry.endsWith('.map')) yield path;
    }
}

if (!existsSync(dist)) {
    console.error(`extract-sourcemaps: ${dist}/ does not exist`);
    process.exit(1);
}

let moved = 0;
for (const file of walk(dist)) {
    const destination = join(target, relative(dist, file));
    mkdirSync(dirname(destination), { recursive: true });
    renameSync(file, destination);
    moved++;
}
console.log(`extract-sourcemaps: moved ${moved} source map(s) from ${dist}/ to ${target}/`);
