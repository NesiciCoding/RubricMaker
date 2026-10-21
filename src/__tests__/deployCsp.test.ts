import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const files = [
    'docker/nginx.conf',
    'docker/nginx.prod.conf',
    ...readdirSync(resolve(root, 'deploy'))
        .filter((f) => f.endsWith('.conf'))
        .map((f) => `deploy/${f}`),
];

describe('deployment CSP headers', () => {
    it.each(files)('%s sends one complete CSP value per header', (file) => {
        const text = readFileSync(resolve(root, file), 'utf8');
        const headers = [
            ...text.matchAll(/(?:add_header\s+|Header always set\s+)Content-Security-Policy\s+("[^"\n]*")/g),
        ];
        expect(headers.length).toBeGreaterThan(0);
        for (const [, value] of headers) {
            expect(value).toContain("object-src 'none'");
            expect(value).toContain("base-uri 'self'");
            expect(value).toContain("frame-ancestors 'self'");
        }
        const bare = [...text.matchAll(/add_header\s+Content-Security-Policy\s*\n/g)];
        expect(bare).toHaveLength(0);
    });
});

// The camera scan (useCameraCapture) and voice recording (useMediaRecorder) call getUserMedia on
// our own origin; `camera=()` or `microphone=()` would block them in production only (#929).
const policyFiles = [...files, 'deploy/.htaccess', 'public/.htaccess'];

describe('deployment Permissions-Policy headers', () => {
    it.each(policyFiles)('%s allows camera and microphone for the app itself', (file) => {
        const text = readFileSync(resolve(root, file), 'utf8');
        const headers = [...text.matchAll(/^\s*(?:add_header|Header always set)\s+Permissions-Policy\s+"([^"\n]*)"/gm)];
        expect(headers.length).toBeGreaterThan(0);
        for (const [, value] of headers) {
            expect(value).toContain('camera=(self)');
            expect(value).toContain('microphone=(self)');
        }
        expect(text).not.toMatch(/camera=\(\)|microphone=\(\)/);
    });
});
