import type { Class, Student } from '../types';

export type CsvColumnMap = {
    fullName: string;
    firstName: string;
    lastName: string;
    email: string;
    className: string;
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

function extractName(row: Record<string, string>, mapping: CsvColumnMap): string {
    if (mapping.fullName && row[mapping.fullName]) return String(row[mapping.fullName]).trim();
    const f = mapping.firstName && row[mapping.firstName] ? String(row[mapping.firstName]).trim() : '';
    const l = mapping.lastName && row[mapping.lastName] ? String(row[mapping.lastName]).trim() : '';
    return [f, l].filter(Boolean).join(' ');
}

/** Pure matching pass: decides, for each CSV row, whether it creates a student, updates one, or transfers one — without mutating app state. */
export function matchCsvRows(
    parsedData: Record<string, string>[],
    mapping: CsvColumnMap,
    classes: Class[],
    students: Student[],
    defaultClassId: string
): MatchedImportRow[] {
    const classMap = new Map<string, string>();
    classes.forEach((c) => classMap.set(c.name.toLowerCase().trim(), c.id));

    const seenCsvKeys = new Set<string>();
    const processedIds = new Set<string>();
    const rows: MatchedImportRow[] = [];

    for (const row of parsedData) {
        const name = extractName(row, mapping);
        if (!name) continue;

        const email = mapping.email && row[mapping.email] ? String(row[mapping.email]).trim() : '';
        const classNameToMap = mapping.className && row[mapping.className] ? String(row[mapping.className]).trim() : '';

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
        if (!existingClassId && !newClassName) continue;

        const nameLower = name.toLowerCase();
        const emailLower = email.toLowerCase();
        const dedupeTarget = existingClassId ?? `new:${newClassName!.toLowerCase()}`;
        const csvKey = emailLower ? `email:${emailLower}` : `class:${dedupeTarget}|name:${nameLower}`;
        if (seenCsvKeys.has(csvKey)) continue;
        seenCsvKeys.add(csvKey);

        const matchedStudent =
            (existingClassId
                ? students.find(
                      (s) =>
                          !processedIds.has(s.id) &&
                          s.classId === existingClassId &&
                          s.name.toLowerCase().trim() === nameLower
                  )
                : undefined) ??
            (emailLower
                ? students.find((s) => !processedIds.has(s.id) && s.email?.toLowerCase().trim() === emailLower)
                : undefined) ??
            null;

        if (matchedStudent) processedIds.add(matchedStudent.id);

        rows.push({ name, email, newClassName, existingClassId, matchedStudent });
    }

    return rows;
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
    const find = (exact: string[], contains: string[] = []) => {
        const i = norm.findIndex((h) => exact.includes(h));
        if (i !== -1) return headers[i];
        const j = norm.findIndex((h) => contains.some((c) => h.includes(c)));
        return j !== -1 ? headers[j] : '';
    };
    const firstName = find(FIRST_NAME_HEADERS, ['first name', 'given name', 'voornaam', 'roepnaam']);
    const lastName = find(LAST_NAME_HEADERS, ['last name', 'surname', 'family name', 'achternaam']);
    const fullName = firstName && lastName ? '' : find(FULL_NAME_HEADERS, ['full name', 'volledige naam']);
    return {
        fullName,
        firstName,
        lastName,
        email: find(['email', 'e mail', 'mail', 'email address'], ['email', 'e mail']),
        className: find(['class', 'klas', 'group', 'course', 'groep'], ['class', 'course', 'group', 'klas', 'groep']),
    };
}
