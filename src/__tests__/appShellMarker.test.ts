import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file: string) => readFileSync(path.join(repoRoot, file), 'utf8');

// The service worker's navigation route and the HestiaCP deploy check both tell RubricMaker's
// index.html apart from a server default page by this exact tag. Reformatting it in one place
// without the others would make the worker reject every real page.
const MARKER = 'name="apple-mobile-web-app-title" content="RubricMaker"';

describe('app shell marker', () => {
    it('is present in index.html', () => {
        expect(read('index.html')).toContain(MARKER);
    });

    it('is what the service worker navigation route checks for', () => {
        expect(read('vite.config.ts')).toContain(MARKER);
    });

    it.each(['.github/workflows/ci.yml', '.github/workflows/deploy-hestiacp.yml'])(
        'is what the post-deploy check in %s looks for',
        (workflow) => {
            expect(read(workflow)).toContain(MARKER);
        }
    );
});
