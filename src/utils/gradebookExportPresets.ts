import Papa from 'papaparse';

export type GradebookPresetId = 'generic' | 'magister' | 'somtoday';

export interface GradebookExportRow {
    studentName: string;
    studentNumber: string;
    percentage: number;
}

// ponytail: linear 1-10 conversion (1 + pct/100*9), not each school's actual cesuur/norm table.
// Swap in a per-rubric/per-school grading-scale lookup if that becomes a real requirement.
function toDutchGrade(percentage: number): string {
    return (1 + (percentage / 100) * 9).toFixed(1);
}

export const GRADEBOOK_PRESET_IDS: GradebookPresetId[] = ['generic', 'magister', 'somtoday'];

/** Returns null for 'generic' — callers keep using their existing full-column CSV in that case. */
export function buildGradebookPresetCsv(preset: GradebookPresetId, rows: GradebookExportRow[]): string | null {
    if (preset === 'magister') {
        return Papa.unparse(
            rows.map((r) => ({
                Leerlingnummer: r.studentNumber,
                Naam: r.studentName,
                Cijfer: toDutchGrade(r.percentage),
            }))
        );
    }
    if (preset === 'somtoday') {
        return Papa.unparse(
            rows.map((r) => ({
                Leerling: r.studentName,
                Leerlingnummer: r.studentNumber,
                Resultaat: toDutchGrade(r.percentage),
            }))
        );
    }
    return null;
}
