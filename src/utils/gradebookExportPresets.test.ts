import { describe, it, expect } from 'vitest';
import { buildGradebookPresetCsv } from './gradebookExportPresets';

const rows = [{ studentName: 'Jane Doe', studentNumber: '1234', percentage: 80 }];

describe('buildGradebookPresetCsv', () => {
    it('returns null for the generic preset', () => {
        expect(buildGradebookPresetCsv('generic', rows)).toBeNull();
    });

    it('builds a Magister CSV with Dutch 1-10 grade', () => {
        const csv = buildGradebookPresetCsv('magister', rows);
        expect(csv).toContain('Leerlingnummer,Naam,Cijfer');
        expect(csv).toContain('1234,Jane Doe,8.2');
    });

    it('builds a SOMtoday CSV with Dutch 1-10 grade', () => {
        const csv = buildGradebookPresetCsv('somtoday', rows);
        expect(csv).toContain('Leerling,Leerlingnummer,Resultaat');
        expect(csv).toContain('Jane Doe,1234,8.2');
    });
});
