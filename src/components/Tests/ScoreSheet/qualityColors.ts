/** The status colours as text: the plain tokens are tuned for fills, the -text variants for contrast. */
export function asTextColor(color: string): string {
    return color.replace(/var\(--(red|yellow|green)\)/, 'var(--$1-text)');
}

export function ritColor(value: number | null): string {
    if (value === null) return 'var(--text-muted)';
    if (value < 0.2) return 'var(--red-text)';
    if (value < 0.3) return 'var(--yellow-text)';
    return 'var(--green-text)';
}
