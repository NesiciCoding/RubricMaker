import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mediaBlocks } from '../test-utils/cssRules';

// jsdom has no layout/animation engine, so this is pinned at the stylesheet level,
// the same way the phone-width rules are (see mobileLayoutCss.test.ts).
const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

describe('modal animations respect prefers-reduced-motion (#533)', () => {
    it('disables both the overlay fade and the grow-in scale animation', () => {
        const reduced = mediaBlocks(css, 'prefers-reduced-motion: reduce').join('\n');
        expect(reduced).toMatch(/\.modal-overlay,\s*\.modal-grow\s*\{[^}]*animation: none/);
    });

    it('still animates them by default', () => {
        expect(css).toMatch(/\.modal-overlay \{[^}]*animation: modal-overlay-in/);
        expect(css).toMatch(/\.modal-grow \{\s*animation: modal-grow-in/);
    });
});
