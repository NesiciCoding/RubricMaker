import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lengthPx, parseRules, targetsClass, winningDeclaration } from '../test-utils/cssRules';

// jsdom has no layout engine, so the 44px targets of WCAG 2.5.5 are pinned at the stylesheet level,
// the same way the phone-width rules are (see mobileLayoutCss.test.ts).
const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

const TARGET = 44;

/** The winning declaration for a class combination, as `{ selector, value }` in px. */
function target(classes: string[], property: 'min-height' | 'min-width' = 'min-height') {
    const winner = winningDeclaration(css, classes, property);
    return winner && { selector: winner.selector, value: winner.pixels };
}

/**
 * Every minimum height declared for `selector` verbatim, in source order. A field is pinned if any
 * of its rules carries the 44 px floor — earlier rules just set the family or the padding.
 */
function minHeightsFor(selector: string): number[] {
    return parseRules(css)
        .filter((rule) => rule.selectors.includes(selector))
        .map((rule) => lengthPx(rule.decls, 'min-height'))
        .filter((value): value is number => value !== undefined);
}

describe('pointer targets at 44 px (#533, WCAG 2.5.5)', () => {
    it('gives a plain .btn a 44 px minimum height', () => {
        expect(target(['btn'])).toEqual({ selector: '.btn', value: TARGET });
    });

    it('gives the small button variant a 44 px minimum height', () => {
        expect(target(['btn', 'btn-sm'])).toEqual({ selector: '.btn-sm', value: TARGET });
    });

    it('makes an icon-only button 44×44 rather than the 24 px of 2.5.8', () => {
        expect(target(['btn', 'btn-icon'], 'min-width')).toEqual({ selector: '.btn-icon', value: TARGET });
        expect(target(['btn', 'btn-icon'], 'min-height')).toEqual({ selector: '.btn-icon', value: TARGET });
    });

    it('keeps icon-and-small buttons 44×44 even though .btn-icon and .btn-sm pad narrower', () => {
        // The compound selector outranks both single-class rules (two classes versus one), so it
        // carries the measurement the audit recorded wherever the rules sit in the file.
        expect(target(['btn', 'btn-icon', 'btn-sm'], 'min-width')).toEqual({
            selector: '.btn-icon.btn-sm',
            value: TARGET,
        });
        expect(target(['btn', 'btn-icon', 'btn-sm'], 'min-height')).toEqual({
            selector: '.btn-icon.btn-sm',
            value: TARGET,
        });
    });

    it('gives text fields, selects and the editor toolbar buttons a 44 px minimum', () => {
        for (const selector of [
            '.input',
            "input[type='text']",
            "input[type='email']",
            "input[type='number']",
            "input[type='tel']",
            "input[type='date']",
            'select',
            'textarea',
            '.settings-tab',
            '.btn-xs',
        ]) {
            expect(minHeightsFor(selector), selector).toContain(TARGET);
        }
        expect(target(['toolbar-btn'], 'min-width')).toEqual({ selector: '.toolbar-btn', value: TARGET });
        expect(target(['toolbar-btn'], 'min-height')).toEqual({ selector: '.toolbar-btn', value: TARGET });
    });

    it('has no selector targeting a guarded target that shrinks it below 44 px', () => {
        const guarded = ['btn', 'btn-sm', 'btn-icon', 'btn-xs', 'toolbar-btn', 'settings-tab'];
        const shrinking = parseRules(css)
            .filter((rule) => rule.selectors.some((selector) => guarded.some((name) => targetsClass(selector, name))))
            .filter((rule) => {
                const value = lengthPx(rule.decls, 'min-height');
                return value !== undefined && value < TARGET;
            })
            .map((rule) => rule.selectors.join(', '));
        expect(shrinking).toEqual([]);
    });

    it('still keeps the compact type scale, so the guard is not passing on a renamed selector', () => {
        const small = parseRules(css).find((rule) => rule.selectors.includes('.btn-sm'));
        expect(small?.decls).toMatch(/padding:\s*5px 11px/);
        expect(small?.decls).toMatch(/font-size:\s*0\.8rem/);
    });
});
