export interface Rgb {
    r: number;
    g: number;
    b: number;
}

export function parseHex(hex: string): Rgb {
    const match = hex.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (!match) {
        throw new Error(`Invalid hex color: ${hex}`);
    }
    const raw = match[1];
    const full =
        raw.length === 3
            ? raw
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : raw;
    return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16),
    };
}

function channelLuminance(value: number): number {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(color: string | Rgb): number {
    const { r, g, b } = typeof color === 'string' ? parseHex(color) : color;
    return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(fg: string | Rgb, bg: string | Rgb): number {
    const l1 = relativeLuminance(fg);
    const l2 = relativeLuminance(bg);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

export function meetsAAA(fg: string | Rgb, bg: string | Rgb, large = false): boolean {
    return contrastRatio(fg, bg) >= (large ? 4.5 : 7);
}

/* ─── Palette and accent helpers (#533) ─────────────────────────────────────── */

/** AA for normal text: the floor for anything a teacher has to read. */
export const AA_NORMAL = 4.5;
/** AAA for normal text: the target for body copy. */
export const AAA_NORMAL = 7;
/** AA for large text and for non-text UI such as icons and meaningful borders. */
export const AA_LARGE = 3;

export type ThemeName = 'light' | 'dark';
export type Surface = 'bg' | 'bg-card' | 'bg-elevated' | 'bg-raised';

/** The lowest ratio `color` has against any of `backgrounds`. */
export function worstContrast(color: string, backgrounds: readonly string[]): number {
    return backgrounds.reduce((worst, bg) => Math.min(worst, contrastRatio(color, bg)), Infinity);
}

function mix(a: string, b: string, weightB: number): string {
    const from = parseHex(a);
    const to = parseHex(b);
    const channel = (x: number, y: number) =>
        Math.round(x + (y - x) * weightB)
            .toString(16)
            .padStart(2, '0');
    return `#${channel(from.r, to.r)}${channel(from.g, to.g)}${channel(from.b, to.b)}`;
}

/**
 * `color` pushed toward white or black until it clears `min` on every background, or returned
 * untouched when it already passes. Steps of 4% keep the result recognisably the same hue.
 */
export function ensureContrast(
    color: string,
    backgrounds: readonly string[],
    min: number = AA_NORMAL,
    towards: 'light' | 'dark' = 'light'
): string {
    if (backgrounds.length === 0) return color;
    if (worstContrast(color, backgrounds) >= min) return color;
    const target = towards === 'light' ? '#ffffff' : '#000000';
    for (let step = 0.04; step < 1; step += 0.04) {
        const candidate = mix(color, target, step);
        if (worstContrast(candidate, backgrounds) >= min) return candidate;
    }
    return target;
}

/**
 * A theme bundle's accent is chosen for buttons — a saturated brand colour on a coloured
 * background — which is often far below the 4.5:1 that normal text needs. This nudges it until it
 * is safe as *text* (links, active tab labels, badge labels) on every surface of the theme.
 *
 * The direction is fixed per theme rather than per colour: accents lighten on the dark palette and
 * deepen on the light one, so the family still looks like itself in both. Links are body copy, so
 * the floor is AAA rather than AA.
 */
export function accentTextFor(
    accent: string,
    surfaces: readonly string[],
    theme: ThemeName,
    min: number = AAA_NORMAL
): string {
    return ensureContrast(accent, surfaces, min, theme === 'light' ? 'dark' : 'light');
}

/**
 * Any data colour — a CEFR level, a grade from the school's own scale — used as *text*.
 *
 * Mixing it with the theme's body text darkens it on the light palette and lightens it on the dark
 * one, so one expression is legible in both themes without a second per-theme map. 60% of the
 * source colour leaves every app-owned colour at 5:1 or better on every surface (#533).
 */
export function textOnTheme(color: string, weight = 60): string {
    return `color-mix(in srgb, ${color} ${weight}%, var(--text))`;
}

/** A readable label colour for an accent used as a button fill. */
export function accentLabelFor(accent: string): string {
    return contrastRatio('#ffffff', accent) >= contrastRatio('#000000', accent) ? '#ffffff' : '#000000';
}
