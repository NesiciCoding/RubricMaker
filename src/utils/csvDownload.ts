import { saveAs } from 'file-saver';

// Excel only reads a CSV as UTF-8 when it starts with a byte order mark; without one, accented and
// non-Latin names (Zoë, Müller, Arabic, CJK) open as mojibake.
const UTF8_BOM = '﻿';

export function downloadCsv(csv: string, filename: string): void {
    saveAs(new Blob([UTF8_BOM + csv], { type: 'text/csv;charset=utf-8' }), filename);
}

/** The local calendar day of an ISO timestamp as YYYY-MM-DD, which every locale's spreadsheet reads the same way. */
export function csvDate(iso: string | undefined | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Column labels that never collide: a blank title gets a numbered fallback and repeated titles their position. */
export function uniqueColumnLabels(titles: string[], fallback: (position: number) => string): string[] {
    const labels = titles.map((title, i) => title.trim() || fallback(i + 1));
    const counts = new Map<string, number>();
    for (const label of labels) counts.set(label.toLowerCase(), (counts.get(label.toLowerCase()) ?? 0) + 1);
    // Titles that are already unique keep their name, so a numbered repeat must not take one (e.g. a real "Content (1)").
    const taken = new Set(labels.filter((label) => counts.get(label.toLowerCase()) === 1).map((l) => l.toLowerCase()));
    return labels.map((label, i) => {
        if (counts.get(label.toLowerCase()) === 1) return label;
        let n = i + 1;
        let candidate = `${label} (${n})`;
        while (taken.has(candidate.toLowerCase())) candidate = `${label} (${++n})`;
        taken.add(candidate.toLowerCase());
        return candidate;
    });
}
