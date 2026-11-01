import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
    AA_NORMAL,
    AAA_NORMAL,
    accentLabelFor,
    accentTextFor,
    contrastRatio,
    parseHex,
    worstContrast,
} from './contrastCheck';
import { ACCENT_PRESETS, THEME_BUNDLES } from '../data/themes';
import { CEFR_LEVEL_COLORS } from '../data/cefrDescriptors';
import { THEME_SURFACES, themeSurfaces, type ThemeName } from '../data/themeSurfaces';

/**
 * The contrast guard for #533.
 *
 * Everything below reads the *real* stylesheet and the real theme data rather than a copy of them,
 * so a palette tweak cannot silently ship a pair that fails. The floors are deliberately graded:
 * body copy is AAA, secondary text (`.text-muted`, hints) stays a step above AA, and tertiary text
 * (captions, meta) sits exactly at AA — the dimmest thing a teacher is still meant to read.
 */
const MUTED_FLOOR = 5.5;
const DIM_FLOOR = AA_NORMAL;

const srcDir = resolve(__dirname, '..');
const css = readFileSync(join(srcDir, 'index.css'), 'utf8');

/** Blocks of the stylesheet as `{ selector, body }`, in file order. */
function cssBlocks(source: string): { selector: string; body: string }[] {
    const blocks: { selector: string; body: string }[] = [];
    const re = /(?:^|\n)([^{}\n]+)\{([\s\S]*?)\n\}/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source))) blocks.push({ selector: match[1].trim(), body: match[2] });
    return blocks;
}

function tokens(body: string): Record<string, string> {
    const values: Record<string, string> = {};
    for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
        values[name] = value.trim();
    }
    return values;
}

const themeTokens = (theme: ThemeName): Record<string, string> => {
    const selector = theme === 'light' ? "[data-theme='light']" : ':root';
    const block = cssBlocks(css).find((b) => b.selector === selector);
    if (!block) throw new Error(`no ${selector} block in index.css`);
    return tokens(block.body);
};

const SURFACES = ['bg', 'bg-card', 'bg-elevated', 'bg-raised'] as const;

describe('theme surfaces in index.css are real and mirrored in themeSurfaces.ts', () => {
    for (const theme of ['dark', 'light'] as const) {
        for (const surface of SURFACES) {
            it(`${theme} ${surface}`, () => {
                const declared = themeTokens(theme)[surface];
                expect(declared, `--${surface} missing from the ${theme} block`).toMatch(/^#[0-9a-f]{6}$/i);
                expect(THEME_SURFACES[theme][surface]).toBe(declared);
            });
        }
    }
});

describe('text tones clear their floors on every surface', () => {
    const floors = { text: AAA_NORMAL, 'text-muted': MUTED_FLOOR, 'text-dim': DIM_FLOOR } as const;

    for (const theme of ['dark', 'light'] as const) {
        const palette = themeTokens(theme);
        const backgrounds = SURFACES.map((surface) => palette[surface]);

        for (const [token, floor] of Object.entries(floors)) {
            it(`${theme} --${token} >= ${floor}:1`, () => {
                expect(palette[token], `--${token} missing from the ${theme} block`).toBeTruthy();
                expect(worstContrast(palette[token], backgrounds)).toBeGreaterThanOrEqual(floor);
            });
        }
    }
});

describe('the accent is readable as text and as a fill', () => {
    for (const theme of ['dark', 'light'] as const) {
        const palette = themeTokens(theme);
        const backgrounds = SURFACES.map((surface) => palette[surface]);

        it(`${theme} --accent-text >= AAA on every surface`, () => {
            expect(palette['accent-text'], `--accent-text missing from the ${theme} block`).toBeTruthy();
            expect(worstContrast(palette['accent-text'], backgrounds)).toBeGreaterThanOrEqual(AAA_NORMAL);
        });

        it(`${theme} --accent-fg label on the --accent fill >= AA`, () => {
            expect(contrastRatio(palette['accent-fg'], palette.accent)).toBeGreaterThanOrEqual(AA_NORMAL);
        });
    }
});

describe('every bundle and preset accent becomes legible text in both themes', () => {
    // AppContext derives --accent-text from the chosen accent with exactly this helper, so what the
    // bundles and the colour picker can produce is what gets verified here.
    const accents = [
        ...THEME_BUNDLES.map((bundle) => [bundle.id, bundle.accentColor] as const),
        ...ACCENT_PRESETS.map((preset) => [`preset:${preset.id}`, preset.color] as const),
    ];

    for (const [id, accent] of accents) {
        for (const theme of ['dark', 'light'] as const) {
            it(`${id} (${theme})`, () => {
                const text = accentTextFor(accent, themeSurfaces(theme), theme);
                expect(worstContrast(text, themeSurfaces(theme))).toBeGreaterThanOrEqual(AAA_NORMAL);
                expect(contrastRatio(accentLabelFor(accent), accent)).toBeGreaterThanOrEqual(AA_NORMAL);
            });
        }
    }
});

/** Flatten `rgba(r, g, b, a)` over an opaque hex background, the way the browser paints a badge. */
function blendOver(rgba: [number, number, number, number], background: string): string {
    const [r, g, b, alpha] = rgba;
    const hex = background.replace('#', '');
    const channels = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
    const blend = (fg: number, bg: number) =>
        Math.round(fg * alpha + bg * (1 - alpha))
            .toString(16)
            .padStart(2, '0');
    return `#${blend(r, channels[0])}${blend(g, channels[1])}${blend(b, channels[2])}`;
}

/** `.badge-*` rules: the tint behind the label and the token used for its text. */
function badgeRules(): { selector: string; rgba: [number, number, number, number]; token: string }[] {
    return [...css.matchAll(/\.(badge-[\w-]+)\s*\{([\s\S]*?)\n\}/g)].flatMap(([, selector, body]) => {
        const tint = /background:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(body);
        const color = /color:\s*var\(--([\w-]+)\)/.exec(body);
        if (!tint || !color) return [];
        return [
            {
                selector,
                rgba: [Number(tint[1]), Number(tint[2]), Number(tint[3]), Number(tint[4])],
                token: color[1],
            },
        ];
    });
}

describe('badge labels stay AA on their own tint', () => {
    const badges = badgeRules();

    it('finds the badge rules', () => {
        expect(badges.length).toBeGreaterThanOrEqual(5);
    });

    for (const badge of badges) {
        for (const theme of ['dark', 'light'] as const) {
            it(`${theme} .${badge.selector}`, () => {
                const palette = themeTokens(theme);
                const backgrounds = ['bg-card', 'bg', 'bg-elevated'].map((surface) =>
                    blendOver(badge.rgba, palette[surface])
                );
                expect(palette[badge.token], `--${badge.token} missing from the ${theme} block`).toBeTruthy();
                expect(worstContrast(palette[badge.token], backgrounds)).toBeGreaterThanOrEqual(AA_NORMAL);
            });
        }
    }
});

describe('data colours used as text are mixed with the body colour', () => {
    // CEFR level colours and a school's own grade colours live in data, not in the palette, so they
    // cannot have a per-theme token. `textOnTheme` mixes them with --text, which darkens them on the
    // light palette and lightens them on the dark one; this replays the browser's blend.
    const MIX_PERCENT = 60;

    function mixedOverText(color: string, bodyText: string): string {
        const from = parseHex(color);
        const to = parseHex(bodyText);
        const channel = (a: number, b: number) =>
            Math.round((a * MIX_PERCENT + b * (100 - MIX_PERCENT)) / 100)
                .toString(16)
                .padStart(2, '0');
        return `#${channel(from.r, to.r)}${channel(from.g, to.g)}${channel(from.b, to.b)}`;
    }

    for (const [level, color] of Object.entries(CEFR_LEVEL_COLORS)) {
        for (const theme of ['dark', 'light'] as const) {
            it(`CEFR ${level} (${theme})`, () => {
                const palette = themeTokens(theme);
                const text = mixedOverText(color, palette.text);
                expect(
                    worstContrast(
                        text,
                        SURFACES.map((surface) => palette[surface])
                    )
                ).toBeGreaterThanOrEqual(AA_NORMAL);
            });
        }
    }
});

describe('coloured text uses the text-safe token, not the fill', () => {
    // `--accent` and friends are fills: fine behind a label, unreadable as the label.
    const FILL_TOKENS = ['accent', 'green', 'red', 'yellow', 'purple', 'teal'];

    function componentFiles(dir: string): string[] {
        return readdirSync(dir).flatMap((entry) => {
            const path = join(dir, entry);
            if (statSync(path).isDirectory()) return componentFiles(path);
            return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : [];
        });
    }

    it('no stylesheet rule paints text with a fill token', () => {
        for (const token of FILL_TOKENS) {
            expect(css).not.toMatch(new RegExp(`^\\s*color:\\s*var\\(--${token}\\);`, 'm'));
            expect(css).not.toMatch(new RegExp(`^\\s*text-decoration-color:\\s*var\\(--${token}\\);`, 'm'));
        }
    });

    it('no component paints text with a fill token', () => {
        const pattern = new RegExp(`\\bcolor:\\s*'var\\(--(${FILL_TOKENS.join('|')})\\)'`);
        const offenders = componentFiles(srcDir)
            .filter((path) => pattern.test(readFileSync(path, 'utf8')))
            .map((path) => relative(srcDir, path));
        expect(offenders).toEqual([]);
    });
});
