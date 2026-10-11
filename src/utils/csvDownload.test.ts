import { describe, it, expect, vi } from 'vitest';

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

import { saveAs } from 'file-saver';
import { downloadCsv, csvDate, uniqueColumnLabels } from './csvDownload';

describe('downloadCsv (#684)', () => {
    it('saves the CSV as UTF-8 with a byte order mark so Excel keeps accents', () => {
        downloadCsv('name\nZoë', 'students.csv');
        const [blob, name] = vi.mocked(saveAs).mock.calls[0] as [Blob, string];
        expect(name).toBe('students.csv');
        expect(blob.type).toBe('text/csv;charset=utf-8');
        expect(blob.size).toBe(new TextEncoder().encode('﻿name\nZoë').length);
    });
});

describe('csvDate (#684)', () => {
    it('formats the local day as YYYY-MM-DD and tolerates missing or invalid input', () => {
        const local = new Date(2026, 0, 5, 9, 30).toISOString();
        expect(csvDate(local)).toBe('2026-01-05');
        expect(csvDate(undefined)).toBe('');
        expect(csvDate('not a date')).toBe('');
    });
});

describe('uniqueColumnLabels (#684)', () => {
    it('numbers repeated and blank titles so no column overwrites another', () => {
        expect(uniqueColumnLabels(['Content', 'content ', ' ', 'Style'], (p) => `#${p}`)).toEqual([
            'Content (1)',
            'content (2)',
            '#3',
            'Style',
        ]);
    });

    it('never hands a repeated title a label another criterion already uses', () => {
        const labels = uniqueColumnLabels(['Content', 'Content', 'Content (1)'], (p) => `#${p}`);
        expect(labels).toEqual(['Content (2)', 'Content (3)', 'Content (1)']);
        expect(new Set(labels.map((l) => l.toLowerCase())).size).toBe(labels.length);
    });
});
