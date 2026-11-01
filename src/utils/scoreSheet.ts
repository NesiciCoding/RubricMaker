import type { StudentTest, Test, TestAnswer, TestQuestion } from '../types';
import Papa from 'papaparse';
import { CSV_UNPARSE_OPTIONS } from './csvOptions';
import { calcStudentTestRawPoints } from './testCalc';
import { nanoid } from './nanoid';

/** "4,5" and "4.5" both read as 4.5; blank is null; anything else is NaN so the cell can flag it. */
export function parsePoints(raw: string): number | null {
    const text = raw.trim().replace(',', '.');
    if (text === '' || text === '-') return null;
    if (!/^\d*\.?\d+$|^\d+\.$/.test(text)) return NaN;
    return Number(text);
}

export type CellValidity = 'ok' | 'empty' | 'invalid' | 'over_max';

export function validateCell(raw: string, max: number): CellValidity {
    const value = parsePoints(raw);
    if (value === null) return 'empty';
    if (Number.isNaN(value)) return 'invalid';
    return value > max ? 'over_max' : 'ok';
}

/** Tab/newline separated text pasted from a spreadsheet, as a grid of raw cell strings. */
export function parsePastedGrid(text: string): string[][] {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    return lines.map((line) => line.split('\t'));
}

function emptyManualTest(testId: string, studentId: string, now: string): StudentTest {
    return {
        id: nanoid(),
        testId,
        studentId,
        answers: [],
        status: 'in_progress',
        startedAt: now,
        source: 'manual',
    };
}

/** Every question has a score: online answers count when auto-scorable, manual cells when typed in. */
export function isSheetComplete(test: Test, st: StudentTest): boolean {
    const answered = new Set(st.answers.map((a) => a.questionId));
    return test.questions.every((q) => answered.has(q.id));
}

function withTotals(test: Test, st: StudentTest, now: string): StudentTest {
    const complete = isSheetComplete(test, st);
    const status: StudentTest['status'] = complete ? 'graded' : st.source === 'manual' ? 'in_progress' : st.status;
    return {
        ...st,
        rawTotalPoints: calcStudentTestRawPoints(test, st.answers),
        status,
        submittedAt: complete ? (st.submittedAt ?? now) : st.submittedAt,
        gradedAt: complete ? now : st.gradedAt,
        updatedAt: now,
    };
}

/**
 * Sets (or clears, with null) the points for one cell. Answers a student gave online keep their
 * response — the typed points only override their score — so switching to the sheet never loses
 * what the student wrote.
 */
export function applyCellEdit(
    existing: StudentTest | undefined,
    test: Test,
    studentId: string,
    questionId: string,
    points: number | null,
    now: string = new Date().toISOString()
): StudentTest {
    const base = existing ?? emptyManualTest(test.id, studentId, now);
    const question = test.questions.find((q) => q.id === questionId);
    const answers: TestAnswer[] = base.answers.filter((a) => a.questionId !== questionId);
    const prior = [...base.answers].reverse().find((a) => a.questionId === questionId);
    if (points !== null && question) {
        const clamped = Math.min(Math.max(points, 0), question.points);
        answers.push({ ...(prior ?? { questionId, response: '' }), pointsEarned: clamped });
    } else if (prior && prior.response) {
        const rest = { ...prior };
        delete rest.pointsEarned;
        answers.push(rest);
    }
    return withTotals(test, { ...base, answers }, now);
}

export function setAbsent(
    existing: StudentTest | undefined,
    test: Test,
    studentId: string,
    absent: boolean,
    now: string = new Date().toISOString()
): StudentTest {
    const base = existing ?? emptyManualTest(test.id, studentId, now);
    return { ...base, absent: absent || undefined, updatedAt: now };
}

export function newScoreOnlyQuestion(label: string, points = 1): TestQuestion {
    return { id: nanoid(), prompt: label, type: 'open', points };
}

export function defaultScoreOnlyQuestions(count = 5): TestQuestion[] {
    return Array.from({ length: count }, (_, i) => newScoreOnlyQuestion(String(i + 1)));
}

/** Formats points the way the locale writes decimals, without trailing zeroes. */
export function formatPoints(value: number, locale?: string): string {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

export interface ScoreSheetCsvRow {
    name: string;
    studentNumber: string;
    points: (number | null)[];
    total: number | null;
    percentage: number | null;
    grade: string;
    /** Every norm-table column's grade, for a student whose year/track didn't pick one. */
    alternatives?: { label: string; grade: number | null }[];
    absent: boolean;
}

/** The sheet as CSV; students without a resolved norm column get one extra `Grade (<column>)` per column. */
export function buildScoreSheetCsv(columns: string[], rows: ScoreSheetCsvRow[]): string {
    const altLabels = [...new Set(rows.flatMap((r) => r.alternatives?.map((a) => a.label) ?? []))];
    const header = [
        'Student Name',
        'Student Number',
        ...columns,
        'Total',
        'Score %',
        'Grade',
        ...altLabels.map((l) => `Grade (${l})`),
        'Absent',
    ];
    const data = rows.map((r) => [
        r.name,
        r.studentNumber,
        ...r.points.map((p) => (p === null ? '' : p)),
        r.total ?? '',
        r.percentage === null ? '' : r.percentage.toFixed(1),
        r.grade,
        ...altLabels.map((l) => r.alternatives?.find((a) => a.label === l)?.grade ?? ''),
        r.absent ? 'yes' : '',
    ]);
    return Papa.unparse({ fields: header, data }, CSV_UNPARSE_OPTIONS);
}
