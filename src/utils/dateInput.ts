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

/** Local midnight for a `YYYY-MM-DD` value, or null when the value is missing/unparsable. */
function localMidnight(dateOnly: string): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
    if (!match) return null;
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}

/**
 * Half-open epoch-ms window for a pair of `YYYY-MM-DD` date inputs: `[fromTs, toTs)`, with missing
 * (or unparsable) bounds left open at 0 / Infinity.
 *
 * Both ends are whole days in the viewer's own zone. `new Date('2026-01-05')` would parse as UTC
 * midnight, which drops every grade recorded before ~02:00 local on the From day in CET, and the
 * matching `T23:59:59` bound truncated the last second of the To day.
 */
export function localDayWindow(from: string, to: string): { fromTs: number; toTs: number } {
    const fromTs = from ? localMidnight(from) : null;
    const toStart = to ? localMidnight(to) : null;
    if (toStart === null) return { fromTs: fromTs ?? 0, toTs: Infinity };
    // Date arithmetic rather than +24h so a DST-shifted To day keeps its real length.
    const end = new Date(toStart);
    end.setDate(end.getDate() + 1);
    return { fromTs: fromTs ?? 0, toTs: end.getTime() };
}
