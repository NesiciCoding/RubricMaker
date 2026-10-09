/** Converts a UTC ISO timestamp to the local `YYYY-MM-DDTHH:mm` string a `datetime-local` input expects. */
export function toLocalDatetimeInput(iso: string): string {
    const date = new Date(iso);
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

/**
 * Converts a `datetime-local` value (local wall-clock time) back to a UTC ISO timestamp. When the
 * value still shows `original`, `original` is returned untouched so saving without editing never
 * drops its seconds. An empty value means "no date".
 */
export function fromLocalDatetimeInput(value: string, original?: string): string | undefined {
    if (!value) return undefined;
    if (original && toLocalDatetimeInput(original) === value) return original;
    return new Date(value).toISOString();
}

export function formatShortDate(iso: string, locale?: string): string {
    return new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}
