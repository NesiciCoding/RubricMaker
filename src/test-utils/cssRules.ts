/**
 * A small stylesheet reader for the guard tests that pin layout rules.
 *
 * jsdom has no layout engine, so the tests that protect the phone-width layout, the reduced-motion
 * overrides and the 44 px targets assert on `src/index.css` instead of rendered geometry. This is
 * the shared parser for that: a flat rule list with the declarations of each rule, plus just enough
 * cascade logic (class specificity, then source order) to answer "which value wins for this class
 * combination".
 *
 * It understands neither inheritance nor shorthand expansion; it is meant for `min-height`,
 * `padding`, `display` and friends on plain class chains.
 */

export interface CssRule {
    selectors: string[];
    decls: string;
    /** Index in the flat list, i.e. source order. */
    order: number;
}

export const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Every rule in source order. At-rule preludes are dropped so a rule inside a media query is
 * parsed like any other; use {@link mediaBlocks} first when you only want one query's rules.
 */
export function parseRules(source: string): CssRule[] {
    const flat = stripComments(source).replace(/@[a-zA-Z-]+[^{;]*\{/g, '{');
    const rules: CssRule[] = [];
    for (const match of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selectors = match[1]
            .split(',')
            .map((selector) => selector.trim())
            .filter(Boolean);
        rules.push({ selectors, decls: match[2], order: rules.length });
    }
    return rules;
}

/** The bodies of every `@media (query) { … }` block, prelude included, in source order. */
export function mediaBlocks(source: string, query: string): string[] {
    const blocks: string[] = [];
    const re = new RegExp(`@media \\(${query}\\) \\{`, 'g');
    for (const match of source.matchAll(re)) {
        let depth = 1;
        let i = match.index! + match[0].length;
        while (depth > 0 && i < source.length) {
            if (source[i] === '{') depth++;
            if (source[i] === '}') depth--;
            i++;
        }
        blocks.push(source.slice(match.index!, i));
    }
    return blocks;
}

/** The declared value of `property` in a rule body, or `undefined` when the rule omits it. */
export function declaration(decls: string, property: string): string | undefined {
    const match = decls.match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`));
    return match?.[1].trim();
}

/** A `<length>` declaration resolved to px (`px` and `rem` only, which is all `index.css` uses). */
export function lengthPx(decls: string, property: string): number | undefined {
    const value = declaration(decls, property);
    if (value === undefined) return undefined;
    const px = value.match(/^(-?[\d.]+)px$/);
    if (px) return Number(px[1]);
    const rem = value.match(/^(-?[\d.]+)rem$/);
    if (rem) return Number(rem[1]) * 16;
    return Number.NaN;
}

/** The classes of a selector that is a plain class chain (`.a`, `.a.b`), or `null` for anything else. */
export function classChain(selector: string): string[] | null {
    if (!/^\.[\w-]+(?:\.[\w-]+)*$/.test(selector)) return null;
    return selector.match(/\.[\w-]+/g)!.map((token) => token.slice(1));
}

/** The class chain of each compound (space-separated part) of a selector. */
export function compounds(selector: string): string[][] {
    return selector
        .trim()
        .split(/\s+/)
        .map((part) => part.match(/\.[\w-]+/g)?.map((token) => token.slice(1)) ?? []);
}

/** Whether the selector's subject (its last compound) carries `className`. */
export function targetsClass(selector: string, className: string): boolean {
    return compounds(selector).at(-1)?.includes(className) ?? false;
}

export interface WinningDeclaration {
    selector: string;
    value: string;
    pixels: number;
}

/**
 * Which declaration of `property` wins for an element carrying exactly `classes`, by class
 * specificity then source order. Rules whose selector is not a plain class chain (descendants,
 * attribute selectors, inline styles) are ignored — the cascade they take part in is not modelled.
 */
export function winningDeclaration(css: string, classes: string[], property: string): WinningDeclaration | undefined {
    let winner: (WinningDeclaration & { specificity: number; order: number }) | undefined;
    for (const rule of parseRules(css)) {
        for (const selector of rule.selectors) {
            const chain = classChain(selector);
            if (!chain || !chain.every((token) => classes.includes(token))) continue;
            const value = declaration(rule.decls, property);
            const pixels = lengthPx(rule.decls, property);
            if (value === undefined || pixels === undefined) continue;
            const candidate = { selector, value, pixels, specificity: chain.length, order: rule.order };
            if (
                !winner ||
                candidate.specificity > winner.specificity ||
                (candidate.specificity === winner.specificity && candidate.order > winner.order)
            ) {
                winner = candidate;
            }
        }
    }
    return winner && { selector: winner.selector, value: winner.value, pixels: winner.pixels };
}
