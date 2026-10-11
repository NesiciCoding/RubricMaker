import type { Class, Student } from '../types';

export type CsvColumnMap = {
    fullName: string;
    firstName: string;
    lastName: string;
    email: string;
    className: string;
    /** A full-name column kept aside when first + last name win, for rows where one of them is blank. */
    fullNameFallback?: string;
};

export interface MatchedImportRow {
    name: string;
    email: string;
    /** Set when the row's class name doesn't exist yet and needs to be created on apply. */
    newClassName: string | null;
    /** Set when the row targets an existing class. */
    existingClassId: string | null;
    matchedStudent: Student | null;
}

const cell = (row: Record<string, string>, column: string | undefined) =>
    column && row[column] ? String(row[column]).trim() : '';

export function extractCsvName(row: Record<string, string>, mapping: CsvColumnMap): string {
    const full = cell(row, mapping.fullName);
    if (full) return full;
    const f = cell(row, mapping.firstName);
    const l = cell(row, mapping.lastName);
    if (!f || !l) {
        const fallback = cell(row, mapping.fullNameFallback);
        if (fallback) return fallback;
    }
    return [f, l].filter(Boolean).join(' ');
}

export type CsvSkipReason = 'no_name' | 'no_class' | 'duplicate';

export interface SkippedCsvRow {
    /** Spreadsheet row number, counting the header as row 1 (rows after a dropped blank line shift up). */
    row: number;
    name: string;
    email: string;
    reason: CsvSkipReason;
    /** For duplicates: the row this one repeats. */
    duplicateOf?: number;
}

export interface CsvImportPlan {
    rows: MatchedImportRow[];
    skipped: SkippedCsvRow[];
}

/**
 * Pure matching pass: decides, for each CSV row, whether it creates a student, updates one, or transfers one — without
 * mutating app state — and reports every row it leaves out with the reason. Rows only count as duplicates when name,
 * email and class all repeat, so siblings sharing a guardian's email are each imported.
 */
export function planCsvImport(
    parsedData: Record<string, string>[],
    mapping: CsvColumnMap,
    classes: Class[],
    students: Student[],
    defaultClassId: string
): CsvImportPlan {
    const classMap = new Map<string, string>();
    classes.forEach((c) => classMap.set(c.name.toLowerCase().trim(), c.id));

    const firstRowForKey = new Map<string, number>();
    const processedIds = new Set<string>();
    const rows: MatchedImportRow[] = [];
    const skipped: SkippedCsvRow[] = [];

    parsedData.forEach((row, i) => {
        const rowNumber = i + 2;
        const name = extractCsvName(row, mapping);
        const email = cell(row, mapping.email);
        if (!name) {
            skipped.push({ row: rowNumber, name, email, reason: 'no_name' });
            return;
        }

        const classNameToMap = cell(row, mapping.className);

        let existingClassId: string | null = defaultClassId || null;
        let newClassName: string | null = null;
        if (classNameToMap) {
            const lowerName = classNameToMap.toLowerCase();
            if (classMap.has(lowerName)) {
                existingClassId = classMap.get(lowerName)!;
            } else {
                newClassName = classNameToMap;
                existingClassId = null;
            }
        }
        if (!existingClassId && !newClassName) {
            skipped.push({ row: rowNumber, name, email, reason: 'no_class' });
            return;
        }

        const nameLower = name.toLowerCase();
        const emailLower = email.toLowerCase();
        const dedupeTarget = existingClassId ?? `new:${newClassName!.toLowerCase()}`;
        const csvKey = `class:${dedupeTarget}|name:${nameLower}|email:${emailLower}`;
        const duplicateOf = firstRowForKey.get(csvKey);
        if (duplicateOf !== undefined) {
            skipped.push({ row: rowNumber, name, email, reason: 'duplicate', duplicateOf });
            return;
        }
        firstRowForKey.set(csvKey, rowNumber);

        const sameName = (s: Student) => !processedIds.has(s.id) && s.name.toLowerCase().trim() === nameLower;
        // A shared email alone (siblings, a guardian's address) never identifies the student — the name must match too.
        const matchedStudent =
            (existingClassId ? students.find((s) => sameName(s) && s.classId === existingClassId) : undefined) ??
            (emailLower
                ? students.find((s) => sameName(s) && s.email?.toLowerCase().trim() === emailLower)
                : undefined) ??
            null;

        if (matchedStudent) processedIds.add(matchedStudent.id);

        rows.push({ name, email, newClassName, existingClassId, matchedStudent });
    });

    return { rows, skipped };
}

export function matchCsvRows(
    parsedData: Record<string, string>[],
    mapping: CsvColumnMap,
    classes: Class[],
    students: Student[],
    defaultClassId: string
): MatchedImportRow[] {
    return planCsvImport(parsedData, mapping, classes, students, defaultClassId).rows;
}

export interface ImportSummary {
    created: number;
    updated: number;
    transferred: number;
    removed: number;
}

/** Read-only summary of what an import would do, for a confirmation prompt before mutating state. */
export function summarizeImport(rows: MatchedImportRow[], students: Student[], syncMode: boolean): ImportSummary {
    let created = 0;
    let updated = 0;
    let transferred = 0;
    const matchedIds = new Set<string>();
    const touchedClassIds = new Set<string>();

    for (const row of rows) {
        if (row.existingClassId) touchedClassIds.add(row.existingClassId);
        if (!row.matchedStudent) {
            created++;
            continue;
        }
        matchedIds.add(row.matchedStudent.id);
        const targetClassId = row.newClassName ? null : row.existingClassId;
        const isTransfer = row.newClassName !== null || row.matchedStudent.classId !== targetClassId;
        if (isTransfer) transferred++;
        else updated++;
    }

    const removed = syncMode
        ? students.filter((s) => touchedClassIds.has(s.classId) && !matchedIds.has(s.id)).length
        : 0;

    return { created, updated, transferred, removed };
}

const normaliseHeader = (h: string) =>
    h
        .toLowerCase()
        .replace(/[_\-.]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const FIRST_NAME_HEADERS = [
    'first name',
    'firstname',
    'first',
    'given name',
    'givenname',
    'forename',
    'voornaam',
    'roepnaam',
];
const LAST_NAME_HEADERS = ['last name', 'lastname', 'last', 'surname', 'family name', 'familyname', 'achternaam'];
// Columns about someone other than the student (Parent first name, Guardian email, …) are never auto-mapped.
const OTHER_PERSON_WORDS = [
    'parent',
    'guardian',
    'mother',
    'father',
    'contact',
    'teacher',
    'ouder',
    'verzorger',
    'moeder',
    'vader',
    'docent',
    'mentor',
];

const FULL_NAME_HEADERS = [
    'name',
    'full name',
    'fullname',
    'student name',
    'student',
    'pupil',
    'naam',
    'volledige naam',
    'leerling',
    'leerlingnaam',
];

/**
 * Suggests a column mapping for a generic student CSV. Full name only matches a header that *is* a
 * full-name header, never one that merely contains "name" (First name, Last name, Username), and
 * first + last name columns win over a full-name column when both are present.
 */
export function autoMapCsvHeaders(headers: string[]): CsvColumnMap {
    const norm = headers.map(normaliseHeader);
    const isOtherPerson = (h: string) => h.split(' ').some((w) => OTHER_PERSON_WORDS.includes(w));
    const find = (exact: string[], contains: string[] = []) => {
        const i = norm.findIndex((h) => exact.includes(h));
        if (i !== -1) return headers[i];
        const j = norm.findIndex((h) => !isOtherPerson(h) && contains.some((c) => h.includes(c)));
        return j !== -1 ? headers[j] : '';
    };
    const firstName = find(FIRST_NAME_HEADERS, ['first name', 'given name', 'voornaam', 'roepnaam']);
    const lastName = find(LAST_NAME_HEADERS, ['last name', 'surname', 'family name', 'achternaam']);
    const fullNameColumn = find(FULL_NAME_HEADERS, ['full name', 'volledige naam']);
    const separate = Boolean(firstName && lastName);
    return {
        fullName: separate ? '' : fullNameColumn,
        firstName,
        lastName,
        ...(separate && fullNameColumn ? { fullNameFallback: fullNameColumn } : {}),
        email: find(['email', 'e mail', 'mail', 'email address'], ['email', 'e mail']),
        className: find(['class', 'klas', 'group', 'course', 'groep'], ['class', 'course', 'group', 'klas', 'groep']),
    };
}
