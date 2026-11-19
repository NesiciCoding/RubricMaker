import { escapeHtml } from './exportDataPrep';

export type SessionExportStatus = 'submitted' | 'opened' | 'late';

/** One monitored student, reduced to the figures an integrity question three weeks later needs. */
export interface SessionExportStudent {
    name: string;
    status?: SessionExportStatus;
    /** Handed in, whether or not a persisted attempt exists yet. */
    finished: boolean;
    tabSwitchCount: number;
    copyCount: number;
    cutCount: number;
    pasteCount: number;
    wordCount?: number;
    /** Epoch ms of the newest snapshot that carried draft text, so the age is honest to the minute. */
    draftAt?: number;
    /** Epoch ms of the last change the monitor saw — the stall baseline. */
    lastChangeAt?: number;
    /** Epoch ms of the last signal of any kind. */
    lastSignalAt?: number;
    /** Nudges this teacher sent, oldest first. */
    nudges: { at: string; message: string }[];
}

export interface SessionExportMeta {
    title: string;
    kind: 'test' | 'essay';
    /** Epoch ms the file was produced. */
    at: number;
}

export type SessionExportTranslate = (key: string, options?: Record<string, unknown>) => string;

/** Whole minutes since `at`; undefined when the monitor never saw that signal. */
export function minutesSince(at: number | undefined, now: number): number | undefined {
    if (at === undefined || !Number.isFinite(at)) return undefined;
    return Math.max(0, Math.floor((now - at) / 60_000));
}

function clockTime(at: number | string | undefined): string {
    if (at === undefined) return '';
    const date = new Date(at);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** A spreadsheet reads a cell starting with one of these as a formula; names and messages are not trusted. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function cell(value: string | number | undefined): string {
    if (value === undefined) return '';
    // Counts and ages are real numbers; only literal text is neutralised.
    const text = typeof value === 'string' && FORMULA_PREFIX.test(value) ? `'${value}` : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function statusLabel(student: SessionExportStudent, t: SessionExportTranslate): string {
    if (student.finished) return t('tests.monitor.export.status_submitted');
    if (student.status === 'opened') return t('tests.monitor.export.status_opened');
    return '';
}

function nudgeLog(student: SessionExportStudent): string {
    return student.nudges.map((nudge) => `${clockTime(nudge.at)} ${nudge.message}`.trim()).join(' · ');
}

const COLUMN_KEYS = [
    'student',
    'status',
    'tab_switches',
    'copy',
    'cut',
    'paste',
    'stalled',
    'draft_age',
    'words',
    'nudges',
    'nudge_log',
    'last_signal',
] as const;

/**
 * The exam-file CSV: one row per student, counts and ages rather than content, so it can sit in a
 * student's file without carrying anyone's writing.
 */
export function buildSessionCsv(
    students: SessionExportStudent[],
    meta: SessionExportMeta,
    t: SessionExportTranslate,
    now: number
): string {
    const header = COLUMN_KEYS.map((key) => cell(t(`tests.monitor.export.column_${key}`)));
    const lines = [header.join(',')];
    for (const student of students) {
        lines.push(
            [
                cell(student.name),
                cell(statusLabel(student, t)),
                cell(student.tabSwitchCount),
                cell(student.copyCount),
                cell(student.cutCount),
                cell(student.pasteCount),
                cell(minutesSince(student.lastChangeAt, now) ?? ''),
                cell(minutesSince(student.draftAt, now) ?? ''),
                cell(student.wordCount ?? ''),
                cell(student.nudges.length),
                cell(nudgeLog(student)),
                cell(clockTime(student.lastSignalAt)),
            ].join(',')
        );
    }
    // A spreadsheet's own line ending, and a trailing one so every row is a line.
    return `${lines.join('\r\n')}\r\n`;
}

function summaryRow(student: SessionExportStudent, t: SessionExportTranslate, now: number): string {
    const cells = [
        student.name,
        statusLabel(student, t),
        String(student.tabSwitchCount),
        String(minutesSince(student.lastChangeAt, now) ?? '—'),
        String(minutesSince(student.draftAt, now) ?? '—'),
        String(student.wordCount ?? '—'),
        String(student.nudges.length),
    ];
    return `<tr>${cells
        .map(
            (value) =>
                `<td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:12px">${escapeHtml(value)}</td>`
        )
        .join('')}</tr>`;
}

/**
 * Short printable summary of the same session — the sheet a teacher attaches next to the CSV.
 * Deliberately a fragment: `printHtml()` supplies the document and sanitises it.
 */
export function buildSessionSummaryHtml(
    students: SessionExportStudent[],
    meta: SessionExportMeta,
    t: SessionExportTranslate,
    now: number
): string {
    const total = (pick: (student: SessionExportStudent) => number) =>
        students.reduce((sum, student) => sum + pick(student), 0);
    const headings = [
        t('tests.monitor.export.column_student'),
        t('tests.monitor.export.column_status'),
        t('tests.monitor.export.column_tab_switches'),
        t('tests.monitor.export.column_stalled'),
        t('tests.monitor.export.column_draft_age'),
        t('tests.monitor.export.column_words'),
        t('tests.monitor.export.column_nudges'),
    ];
    const totals = [
        t('tests.monitor.export.summary_students', { count: students.length }),
        t('tests.monitor.export.summary_tab_switches', { count: total((s) => s.tabSwitchCount) }),
        t('tests.monitor.export.summary_words', { count: total((s) => s.wordCount ?? 0) }),
        t('tests.monitor.export.summary_nudges', { count: total((s) => s.nudges.length) }),
    ].join(' · ');

    return `<div style="font-family:Arial, Helvetica, sans-serif;color:#0f172a">
  <h1 style="margin:0 0 4px;font-size:18px">${escapeHtml(meta.title)} — ${escapeHtml(
      t('tests.monitor.export.summary_title')
  )}</h1>
  <p style="margin:0 0 12px;font-size:11px;color:#64748b">${escapeHtml(totals)}</p>
  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr>${headings
          .map(
              (heading) =>
                  `<th style="padding:4px 8px;text-align:left;border-bottom:2px solid #0f172a;font-size:11px;text-transform:uppercase;letter-spacing:0.04em">${escapeHtml(
                      heading
                  )}</th>`
          )
          .join('')}</tr>
    </thead>
    <tbody>${students.map((student) => summaryRow(student, t, now)).join('')}</tbody>
  </table>
  <p style="margin:16px 0 0;font-size:10px;color:#94a3b8">${escapeHtml(
      t('tests.monitor.export.summary_generated', { time: clockTime(meta.at) })
  )}</p>
</div>`;
}
