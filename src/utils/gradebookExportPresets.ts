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
    /** Rows whose grade-scale label isn't a number, so the grade was converted from the percentage instead */
    approximateCount: number;
    missingNumberCount: number;
}

export const GRADEBOOK_PRESET_IDS: GradebookPresetId[] = ['generic', 'magister', 'somtoday'];

/** A grade-scale label that is already a 1-10 number ("8", "7,5", "6.8"), kept as written. */
function numericLabel(label: string): string | null {
    const normalized = label.trim().replace(',', '.');
    return /^(10|[1-9])(\.\d+)?$/.test(normalized) ? normalized : null;
}

// ponytail: only used when the rubric's scale has non-numeric labels (A-F, '<6'); linear
// 1 + pct/100*9, not a school's cesuur, which is why those rows are reported as approximate.
function linearDutchGrade(percentage: number): string {
    return (1 + (percentage / 100) * 9).toFixed(1);
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
    let approximateCount = 0;
    const gradeOf = (row: GradebookExportRow) => {
        let grade = numericLabel(row.grade);
        if (grade === null) {
            approximateCount++;
            grade = linearDutchGrade(row.percentage);
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
        approximateCount,
        missingNumberCount: rows.filter((r) => !r.studentNumber.trim()).length,
    };
}
