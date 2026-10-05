import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { CSV_UNPARSE_OPTIONS } from './csvOptions';

function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
        return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
    });
}

describe('CSV exports escape formulae', () => {
    it('prefixes formula-like cells but leaves numbers and ordinary text alone', () => {
        const csv = Papa.unparse(
            [{ name: '=HYPERLINK("x")', note: '@sum', score: 5, text: 'plain' }],
            CSV_UNPARSE_OPTIONS
        );
        const [, row] = csv.split('\r\n');
        expect(row).toBe('"\'=HYPERLINK(""x"")","\'@sum",5,plain');
    });

    it('is passed to every Papa.unparse call in the app', () => {
        const offenders: string[] = [];
        for (const file of sourceFiles(path.resolve(__dirname, '..'))) {
            const lines = fs.readFileSync(file, 'utf8').split('\n');
            lines.forEach((line, i) => {
                if (!/\.unparse\(/.test(line)) return;
                const call = lines.slice(i, i + 30).join('\n');
                if (!/CSV_UNPARSE_OPTIONS|escapeFormulae/.test(call)) offenders.push(`${file}:${i + 1}`);
            });
        }
        expect(offenders).toEqual([]);
    });
});
