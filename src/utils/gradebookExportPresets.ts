import Papa from 'papaparse';
import { CSV_UNPARSE_OPTIONS } from './csvOptions';

export type GradebookPresetId = 'generic' | 'magister' | 'somtoday';
export type DecimalSeparator = 'comma' | 'dot';

export interface GradebookExportRow {
    studentName: string;
    studentNumber: string;
    percentage: number;
    /** The grade the app shows for this result: the label from the rubric's grade scale */
    grade: string;
}

export interface GradebookPresetCsv {
    csv: string;
    /** Rows whose grade-scale label isn't a 1-10 number, exported with an empty grade */
    blankGradeCount: number;
    missingNumberCount: number;
}

export const GRADEBOOK_PRESET_IDS: GradebookPresetId[] = ['generic', 'magister', 'somtoday'];

/** A grade-scale label that is already a 1-10 number ("8", "7,5", "6.8"), kept as written. */
function numericLabel(label: string): string | null {
    const normalized = label.trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
    const value = Number(normalized);
    return value >= 1 && value <= 10 ? normalized : null;
}

/**
 * Returns null for 'generic' — callers keep using their existing full-column CSV in that case.
 * With a decimal comma the file is semicolon-separated, the CSV dialect Dutch Excel reads.
 */
export function buildGradebookPresetCsv(
    preset: GradebookPresetId,
    rows: GradebookExportRow[],
    decimal: DecimalSeparator = 'dot'
): GradebookPresetCsv | null {
    if (preset === 'generic') return null;
    let blankGradeCount = 0;
    // A letter grade has no faithful 1-10 equivalent without the school's cesuur, and a guessed
    // number would be imported as an official grade, so those cells stay empty for the teacher.
    const gradeOf = (row: GradebookExportRow) => {
        const grade = numericLabel(row.grade);
        if (grade === null) {
            blankGradeCount++;
            return '';
        }
        return decimal === 'comma' ? grade.replace('.', ',') : grade;
    };
    const records: Record<string, string>[] =
        preset === 'magister'
            ? rows.map((r) => ({ Leerlingnummer: r.studentNumber, Naam: r.studentName, Cijfer: gradeOf(r) }))
            : rows.map((r) => ({ Leerling: r.studentName, Leerlingnummer: r.studentNumber, Resultaat: gradeOf(r) }));
    const csv = Papa.unparse(records, { ...CSV_UNPARSE_OPTIONS, delimiter: decimal === 'comma' ? ';' : ',' });
    return {
        csv,
        blankGradeCount,
        missingNumberCount: rows.filter((r) => !r.studentNumber.trim()).length,
    };
}
