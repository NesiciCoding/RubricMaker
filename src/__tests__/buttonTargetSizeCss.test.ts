import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom has no layout engine, so the 44px small-button target from WCAG 2.5.5 is pinned at the
// stylesheet level, the same way the phone-width rules are (see mobileLayoutCss.test.ts).
const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const TARGET = 44;

interface Rule {
    selectors: string[];
    decls: string;
    order: number;
}

/** Flat rule list. At-rule preludes are dropped so `.btn-sm` inside a media query is still a `.btn-sm`. */
function parseRules(source: string): Rule[] {
    const flat = source.replace(/@[a-zA-Z-]+[^{;]*\{/g, '{');
    const rules: Rule[] = [];
    for (const match of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selectors = match[1]
            .split(',')
            .map((selector) => selector.trim())
            .filter(Boolean);
        rules.push({ selectors, decls: match[2], order: rules.length });
    }
    return rules;
}

function minHeight(decls: string): number | undefined {
    const match = decls.match(/(?:^|;)\s*min-height:\s*([^;]+)/);
    if (!match) return undefined;
    const px = match[1].match(/^(-?[\d.]+)px$/);
    if (px) return Number(px[1]);
    const rem = match[1].match(/^(-?[\d.]+)rem$/);
    if (rem) return Number(rem[1]) * 16;
    return Number.NaN;
}

/** The classes of a selector that is a plain class chain (`.a`, `.a.b`), or `null` for anything else. */
function classChain(selector: string): string[] | null {
    if (!/^\.[\w-]+(?:\.[\w-]+)*$/.test(selector)) return null;
    return selector.match(/\.[\w-]+/g)!.map((token) => token.slice(1));
}

function compounds(selector: string): string[][] {
    return selector
        .trim()
        .split(/\s+/)
        .map((part) => part.match(/\.[\w-]+/g)?.map((token) => token.slice(1)) ?? []);
}

/** Which declaration wins for an element carrying `classes`, by specificity then source order. */
function winningMinHeight(classes: string[]): { selector: string; value: number } | undefined {
    let winner: { selector: string; value: number; specificity: number; order: number } | undefined;
    for (const rule of parseRules(css)) {
        for (const selector of rule.selectors) {
            const chain = classChain(selector);
            if (!chain || !chain.every((token) => classes.includes(token))) continue;
            const value = minHeight(rule.decls);
            if (value === undefined) continue;
            const candidate = { selector, value, specificity: chain.length, order: rule.order };
            if (
                !winner ||
                candidate.specificity > winner.specificity ||
                (candidate.specificity === winner.specificity && candidate.order > winner.order)
            ) {
                winner = candidate;
            }
        }
    }
    return winner && { selector: winner.selector, value: winner.value };
}

describe('small-button target size (#533, WCAG 2.5.5)', () => {
    const rules = parseRules(css);

    it('gives a plain .btn-sm a 44 px minimum height', () => {
        expect(winningMinHeight(['btn', 'btn-sm'])).toEqual({ selector: '.btn-sm', value: TARGET });
    });

    it('keeps icon-and-small buttons at 44 px even though .btn-icon sets a 24 px minimum', () => {
        // The compound selector outranks both single-class rules (two classes versus one), so it
        // carries the measurement the audit recorded wherever the rules sit in the file.
        expect(winningMinHeight(['btn', 'btn-icon', 'btn-sm'])).toEqual({
            selector: '.btn-icon.btn-sm',
            value: TARGET,
        });
    });

    it('still has the 24 px .btn-icon minimum for the compound rule to outrank', () => {
        const icon = rules.find((rule) => rule.selectors.includes('.btn-icon'));
        expect(minHeight(icon?.decls ?? '')).toBe(24);
    });

    it('has no selector targeting .btn-sm that shrinks it below 44 px', () => {
        const shrinking = rules
            .filter((rule) => rule.selectors.some((selector) => compounds(selector).at(-1)?.includes('btn-sm')))
            .filter((rule) => {
                const value = minHeight(rule.decls);
                return value !== undefined && value < TARGET;
            })
            .map((rule) => rule.selectors.join(', '));
        expect(shrinking).toEqual([]);
    });

    it('still keeps the compact type scale, so the guard is not passing on a renamed selector', () => {
        const small = rules.find((rule) => rule.selectors.includes('.btn-sm'));
        expect(small?.decls).toMatch(/padding:\s*5px 11px/);
        expect(small?.decls).toMatch(/font-size:\s*0\.8rem/);
    });
});
