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
        expect(result.blankGradeCount).toBe(0);
    });

    it('leaves the grade empty for non-numeric scale labels instead of guessing one, and counts them (#688)', () => {
        const result = buildGradebookPresetCsv('somtoday', [
            { ...row, grade: 'B' },
            { ...row, grade: 'F', percentage: 50 },
        ])!;
        expect(result.csv).toContain('Leerling,Leerlingnummer,Resultaat');
        expect(result.csv).not.toMatch(/\d\.\d/);
        expect(result.csv.trim().split(/\r?\n/).slice(1)).toEqual(['Jane Doe,1234,', 'Jane Doe,1234,']);
        expect(result.blankGradeCount).toBe(2);
    });

    it('does not treat numbers outside 1-10 as grades (#688)', () => {
        const result = buildGradebookPresetCsv('magister', [
            { ...row, grade: '10.5' },
            { ...row, grade: '0,5' },
            { ...row, grade: '10' },
        ])!;
        expect(result.csv.trim().split(/\r?\n/).slice(1)).toEqual([
            '1234,Jane Doe,',
            '1234,Jane Doe,',
            '1234,Jane Doe,10',
        ]);
        expect(result.blankGradeCount).toBe(2);
    });

    it('writes a decimal comma in a semicolon-separated file for Dutch Excel (#688)', () => {
        const result = buildGradebookPresetCsv('magister', [{ ...row, grade: '7.5' }], 'comma')!;
        expect(result.csv).toContain('Leerlingnummer;Naam;Cijfer');
        expect(result.csv).toContain('1234;Jane Doe;7,5');
    });

    it('leaves an unfinished attempt empty and counts it apart from non-numeric grades', () => {
        const result = buildGradebookPresetCsv('magister', [row, { ...row, grade: '', inProgress: true }])!;
        expect(result.csv.trim().split(/\r?\n/).slice(1)).toEqual(['1234,Jane Doe,8', '1234,Jane Doe,']);
        expect(result.inProgressCount).toBe(1);
        expect(result.blankGradeCount).toBe(0);
    });

    it('counts rows without a student number (#688)', () => {
        const result = buildGradebookPresetCsv('magister', [row, { ...row, studentNumber: '' }])!;
        expect(result.missingNumberCount).toBe(1);
    });
});
