import { describe, it, expect } from 'vitest';
import { buildGradebookPresetCsv } from './gradebookExportPresets';

const row = { studentName: 'Jane Doe', studentNumber: '1234', percentage: 80, grade: '8' };

describe('buildGradebookPresetCsv', () => {
    it('returns null for the generic preset', () => {
        expect(buildGradebookPresetCsv('generic', [row])).toBeNull();
    });

    it('exports the grade shown in the app, not a linear conversion of the percentage (#688)', () => {
        const result = buildGradebookPresetCsv('magister', [{ ...row, percentage: 50, grade: '5,5' }])!;
        expect(result.csv).toContain('Leerlingnummer,Naam,Cijfer');
        expect(result.csv).toContain('1234,Jane Doe,5.5');
        expect(result.approximateCount).toBe(0);
    });

    it('falls back to the linear 1-10 conversion for non-numeric scale labels and counts them (#688)', () => {
        const result = buildGradebookPresetCsv('somtoday', [
            { ...row, grade: 'B' },
            { ...row, grade: '<6', percentage: 50 },
        ])!;
        expect(result.csv).toContain('Leerling,Leerlingnummer,Resultaat');
        expect(result.csv).toContain('Jane Doe,1234,8.2');
        expect(result.csv).toContain('Jane Doe,1234,5.5');
        expect(result.approximateCount).toBe(2);
    });

    it('writes a decimal comma in a semicolon-separated file for Dutch Excel (#688)', () => {
        const result = buildGradebookPresetCsv('magister', [{ ...row, grade: '7.5' }], 'comma')!;
        expect(result.csv).toContain('Leerlingnummer;Naam;Cijfer');
        expect(result.csv).toContain('1234;Jane Doe;7,5');
    });

    it('counts rows without a student number (#688)', () => {
        const result = buildGradebookPresetCsv('magister', [row, { ...row, studentNumber: '' }])!;
        expect(result.missingNumberCount).toBe(1);
    });
});
