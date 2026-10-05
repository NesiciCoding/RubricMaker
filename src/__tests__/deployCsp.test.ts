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
