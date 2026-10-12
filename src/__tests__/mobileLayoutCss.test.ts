import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom has no layout engine, so the phone-width rules are pinned at the stylesheet level (#652, #663).
const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

function mediaBlocks(maxWidth: number): string[] {
    const blocks: string[] = [];
    const re = new RegExp(`@media \\(max-width: ${maxWidth}px\\) \\{`, 'g');
    for (const match of css.matchAll(re)) {
        let depth = 1;
        let i = match.index! + match[0].length;
        while (depth > 0 && i < css.length) {
            if (css[i] === '{') depth++;
            if (css[i] === '}') depth--;
            i++;
        }
        blocks.push(css.slice(match.index!, i));
    }
    return blocks;
}

describe('phone-width layout rules', () => {
    const phone = mediaBlocks(640).join('\n');

    it('wraps topbar page actions onto their own row instead of scrolling them out of view', () => {
        expect(phone).toMatch(/\.topbar \{[^}]*flex-wrap: wrap/);
        expect(phone).toMatch(/\.topbar-actions \{[^}]*flex-wrap: wrap[^}]*overflow-x: visible/);
    });

    it('drops 4-column tiles to 2 and 2/3-column grids to 1', () => {
        expect(phone).toMatch(/\.grid-4 \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
        expect(phone).toMatch(/\.grid-2,\s*\.grid-3 \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    });
});
