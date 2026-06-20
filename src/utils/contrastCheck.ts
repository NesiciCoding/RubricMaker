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
