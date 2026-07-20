/** Converts a UTC ISO timestamp to the local `YYYY-MM-DDTHH:mm` string a `datetime-local` input expects. */
export function toLocalDatetimeInput(iso: string): string {
    const date = new Date(iso);
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function formatShortDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
