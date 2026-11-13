import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowDownToLine, ClipboardPaste, Copy, Eraser, UserCheck, UserX } from 'lucide-react';
import type { Class, GradeScale, Student, StudentTest, Test, TestAnswer } from '../../../types';
import { scoreTestAnswer } from '../../../utils/testCalc';
import { stripHtmlTags } from '../../../utils/exportDataPrep';
import { scoreStudentTest } from '../../../utils/studentTestScore';
import { normTierLabel, resolveTestGrade } from '../../../utils/testGradingNorm';
import {
    applyCellEdit,
    formatPoints,
    isSheetComplete,
    parsePastedGrid,
    parsePoints,
    setAbsent,
    validateCell,
} from '../../../utils/scoreSheet';
import { pValueColor } from '../ItemAnalysisPanel';
import { asTextColor } from './qualityColors';
import type { ItemQuality } from '../../../utils/testQualityMetrics';
import { useToast } from '../../../hooks/useToast';
import ContextMenu, { useContextMenu } from '../../ui/ContextMenu';
import type { ContextMenuItem } from '../../ui/ContextMenu';

interface Props {
    test: Test;
    students: Student[];
    classes: Class[];
    /** The latest submission per student id (absent when the student has none yet). */
    sheetByStudent: Map<string, StudentTest>;
    scale: GradeScale | null;
    items: ItemQuality[];
    onSave: (studentTests: StudentTest[]) => void;
    /** False for a student in a class shared with me as "Can view": their row is read-only. */
    canEdit?: (student: Student) => boolean;
}

const cellBorder = '1px solid var(--border)';
const stickyHead: React.CSSProperties = { position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 2 };
const stickyName: React.CSSProperties = { position: 'sticky', left: 0, background: 'var(--bg-elevated)', zIndex: 1 };
// Crosshair highlight for the focused cell — darkens the selected row +
// column so it is visible at a glance which student/question is being
// graded. Theme-safe via color-mix on --accent.
const selectedHeadBg = 'color-mix(in srgb, var(--accent) 24%, var(--bg-elevated))';
const bandCellBg = 'color-mix(in srgb, var(--accent) 10%, transparent)';
const focusedCellBg = 'color-mix(in srgb, var(--accent) 22%, transparent)';

function latestAnswer(st: StudentTest | undefined, questionId: string): TestAnswer | undefined {
    if (!st) return undefined;
    for (let i = st.answers.length - 1; i >= 0; i--) if (st.answers[i].questionId === questionId) return st.answers[i];
    return undefined;
}

export default function ScoreSheetGrid({
    test,
    students,
    classes,
    sheetByStudent,
    scale,
    items,
    onSave,
    canEdit,
}: Props) {
    const { t, i18n } = useTranslation();
    const { showToast } = useToast();
    const ctx = useContextMenu();
    const tableRef = useRef<HTMLTableElement>(null);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [focus, setFocus] = useState<{ row: number; col: number } | null>(null);
    const questions = test.questions;
    const classById = new Map(classes.map((c) => [c.id, c]));
    const allLabel = t('tests.norm.tier_all');

    function key(studentId: string, questionId: string) {
        return `${studentId}:${questionId}`;
    }

    function shown(st: StudentTest | undefined, questionIndex: number): string {
        const q = questions[questionIndex];
        const answer = latestAnswer(st, q.id);
        return answer ? formatPoints(scoreTestAnswer(q, answer), i18n.language) : '';
    }

    function focusCell(row: number, col: number) {
        const el = tableRef.current?.querySelector<HTMLInputElement>(`[data-cell="${row}-${col}"]`);
        el?.focus();
        el?.select();
    }

    /** Applies raw values to (row, col) cells, one save per touched student. */
    function commit(values: { row: number; col: number; raw: string }[]) {
        const touched = new Map<string, StudentTest | undefined>();
        for (const { row, col, raw } of values) {
            const student = students[row];
            const q = questions[col];
            if (!student || !q) continue;
            const validity = validateCell(raw, q.points);
            if (validity === 'invalid' || validity === 'over_max') continue;
            const current = touched.has(student.id) ? touched.get(student.id) : sheetByStudent.get(student.id);
            const before = latestAnswer(current, q.id);
            const next = validity === 'empty' ? null : parsePoints(raw)!;
            if (next === null && !before) continue;
            if (before && next !== null && before.pointsEarned === next) continue;
            touched.set(student.id, applyCellEdit(current, test, student.id, q.id, next));
        }
        const saved = [...touched.values()].filter((st): st is StudentTest => !!st);
        if (saved.length) onSave(saved);
    }

    const rowEditable = (student: Student) => canEdit?.(student) ?? true;

    /** The text a cell shows right now — an unblurred draft wins over the saved value. */
    function cellRaw(student: Student, col: number): string {
        return drafts[key(student.id, questions[col].id)] ?? shown(sheetByStudent.get(student.id), col);
    }

    function dropDrafts(keys: string[]) {
        if (!keys.length) return;
        setDrafts((d) => {
            const next = { ...d };
            for (const k of keys) delete next[k];
            return next;
        });
    }

    function copyText(text: string) {
        const write = navigator.clipboard?.writeText(text);
        if (!write) return;
        void write.then(() => showToast(t('tests.scoreSheet.menu_copied'), 'success')).catch(() => {});
    }

    function clearCell(row: number, col: number) {
        dropDrafts([key(students[row].id, questions[col].id)]);
        commit([{ row, col, raw: '' }]);
    }

    /** Spreadsheet fill-down: every editable, non-absent student below this cell gets the same points. */
    function fillDown(row: number, col: number) {
        const max = questions[col].points;
        const raw = cellRaw(students[row], col);
        if (validateCell(raw, max) !== 'ok') return;
        const targets: { row: number; col: number; raw: string }[] = [];
        const keys: string[] = [];
        for (let r = row + 1; r < students.length; r++) {
            const student = students[r];
            if (!rowEditable(student) || sheetByStudent.get(student.id)?.absent) continue;
            targets.push({ row: r, col, raw });
            keys.push(key(student.id, questions[col].id));
        }
        if (!targets.length) return;
        dropDrafts(keys);
        commit(targets);
        showToast(t('tests.scoreSheet.menu_filled'), 'success');
    }

    function clearRow(row: number) {
        const student = students[row];
        dropDrafts(questions.map((q) => key(student.id, q.id)));
        commit(questions.map((_, col) => ({ row, col, raw: '' })));
    }

    function cellMenu(row: number, col: number): ContextMenuItem[] {
        const student = students[row];
        const q = questions[col];
        const st = sheetByStudent.get(student.id);
        const absent = !!st?.absent;
        const raw = cellRaw(student, col);
        const validity = validateCell(raw, q.points);
        const editable = rowEditable(student);
        const hasValue = validity !== 'empty' && absent === false;
        return [
            {
                key: 'absent',
                label: absent ? t('tests.scoreSheet.menu_mark_present') : t('tests.scoreSheet.menu_mark_absent'),
                icon: absent ? <UserCheck size={14} aria-hidden /> : <UserX size={14} aria-hidden />,
                disabled: !editable,
                onSelect: () => onSave([setAbsent(st, test, student.id, !absent)]),
            },
            {
                key: 'clear',
                label: t('tests.scoreSheet.menu_clear_cell'),
                icon: <Eraser size={14} aria-hidden />,
                disabled: !editable || absent || !hasValue,
                onSelect: () => clearCell(row, col),
            },
            {
                key: 'copy',
                label: t('tests.scoreSheet.menu_copy_value'),
                icon: <Copy size={14} aria-hidden />,
                disabled: !hasValue,
                onSelect: () => copyText(raw.trim()),
            },
            {
                key: 'paste',
                label: t('tests.scoreSheet.menu_paste'),
                icon: <ClipboardPaste size={14} aria-hidden />,
                disabled: !editable || absent,
                onSelect: () => void pasteFromClipboard(row, col),
            },
            {
                key: 'fill',
                label: t('tests.scoreSheet.menu_fill_down'),
                icon: <ArrowDownToLine size={14} aria-hidden />,
                disabled: !editable || absent || validity !== 'ok' || row === students.length - 1,
                onSelect: () => fillDown(row, col),
            },
        ];
    }

    function rowMenu(row: number): ContextMenuItem[] {
        const student = students[row];
        const st = sheetByStudent.get(student.id);
        const absent = !!st?.absent;
        const editable = rowEditable(student);
        const hasAny = !!st && st.answers.length > 0;
        return [
            {
                key: 'absent',
                label: absent ? t('tests.scoreSheet.menu_mark_present') : t('tests.scoreSheet.menu_mark_absent'),
                icon: absent ? <UserCheck size={14} aria-hidden /> : <UserX size={14} aria-hidden />,
                disabled: !editable,
                onSelect: () => onSave([setAbsent(st, test, student.id, !absent)]),
            },
            {
                key: 'clear-row',
                label: t('tests.scoreSheet.menu_clear_row'),
                icon: <Eraser size={14} aria-hidden />,
                disabled: !editable || absent || !hasAny,
                onSelect: () => clearRow(row),
            },
            {
                key: 'copy-row',
                label: t('tests.scoreSheet.menu_copy_row'),
                icon: <Copy size={14} aria-hidden />,
                disabled: absent || !hasAny,
                onSelect: () => copyText(questions.map((_, col) => cellRaw(student, col).trim()).join('\t')),
            },
        ];
    }

    function handleBlur(row: number, col: number) {
        const k = key(students[row].id, questions[col].id);
        const raw = drafts[k];
        if (raw === undefined) return;
        if (validateCell(raw, questions[col].points) === 'ok' || raw.trim() === '') {
            commit([{ row, col, raw }]);
            setDrafts((d) => {
                const next = { ...d };
                delete next[k];
                return next;
            });
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) {
        const moves: Record<string, [number, number]> = {
            ArrowUp: [-1, 0],
            ArrowDown: [1, 0],
            Enter: [e.shiftKey ? -1 : 1, 0],
            ArrowLeft: [0, -1],
            ArrowRight: [0, 1],
        };
        const move = moves[e.key];
        if (!move) {
            if (e.key === 'Escape') {
                const k = key(students[row].id, questions[col].id);
                setDrafts((d) => {
                    const next = { ...d };
                    delete next[k];
                    return next;
                });
            }
            return;
        }
        const input = e.currentTarget;
        if (e.key === 'ArrowLeft' && input.selectionStart !== 0) return;
        if (e.key === 'ArrowRight' && input.selectionEnd !== input.value.length) return;
        e.preventDefault();
        const r = Math.min(Math.max(row + move[0], 0), students.length - 1);
        const c = Math.min(Math.max(col + move[1], 0), questions.length - 1);
        focusCell(r, c);
    }

    /** Writes a pasted block from (row, col), skipping rows that are absent or that I cannot edit. */
    function applyPastedGrid(grid: string[][], row: number, col: number) {
        const values: { row: number; col: number; raw: string }[] = [];
        grid.forEach((cells, dr) =>
            cells.forEach((raw, dc) => {
                const r = row + dr;
                const c = col + dc;
                const student = students[r];
                const q = questions[c];
                if (!student || !q || !rowEditable(student) || sheetByStudent.get(student.id)?.absent) return;
                values.push({ row: r, col: c, raw });
            })
        );
        if (!values.length) return;
        dropDrafts(values.map(({ row: r, col: c }) => key(students[r].id, questions[c].id)));
        commit(values);
    }

    function handlePaste(e: React.ClipboardEvent<HTMLInputElement>, row: number, col: number) {
        const grid = parsePastedGrid(e.clipboardData.getData('text'));
        // A single value keeps the browser's own paste; the input already handles that.
        if (grid.length <= 1 && (grid[0]?.length ?? 0) <= 1) return;
        e.preventDefault();
        applyPastedGrid(grid, row, col);
    }

    /** The menu's Paste: right-click no longer offers the browser's, so it reads the clipboard here. */
    async function pasteFromClipboard(row: number, col: number) {
        let text: string;
        try {
            text = (await navigator.clipboard?.readText()) ?? '';
        } catch {
            showToast(t('tests.scoreSheet.menu_paste_blocked'), 'error');
            return;
        }
        const grid = parsePastedGrid(text);
        if (!grid.length) return;
        applyPastedGrid(grid, row, col);
    }

    const colMeans = items.map((it) => it.mean);

    return (
        <div style={{ overflow: 'auto', maxHeight: '70vh', border: cellBorder, borderRadius: 8 }}>
            <table ref={tableRef} style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.85rem' }}>
                <caption className="sr-only">{t('tests.scoreSheet.grid_caption', { name: test.name })}</caption>
                <thead>
                    <tr>
                        <th
                            scope="col"
                            style={{
                                ...stickyHead,
                                ...stickyName,
                                zIndex: 3,
                                textAlign: 'left',
                                padding: '6px 10px',
                                borderBottom: cellBorder,
                                minWidth: 180,
                            }}
                        >
                            {t('tests.scoreSheet.col_student')}
                        </th>
                        {questions.map((q, qi) => {
                            const linkCount =
                                (q.linkedStandards?.length ?? 0) +
                                (q.linkedCefrDescriptors?.length ?? 0) +
                                (q.frameworkDescriptors?.length ?? 0);
                            const colSelected = focus?.col === qi;
                            return (
                                <th
                                    key={q.id}
                                    scope="col"
                                    title={test.scoreOnly ? undefined : stripHtmlTags(q.prompt).slice(0, 120)}
                                    style={{
                                        ...stickyHead,
                                        padding: '6px 4px',
                                        borderBottom: cellBorder,
                                        minWidth: 56,
                                        textAlign: 'center',
                                        background: colSelected ? selectedHeadBg : stickyHead.background,
                                    }}
                                >
                                    <div style={{ fontWeight: 700 }}>
                                        {test.scoreOnly
                                            ? q.prompt
                                            : t('tests.question_number', { number: questions.indexOf(q) + 1 })}
                                    </div>
                                    <div className="text-xs text-muted">/{formatPoints(q.points, i18n.language)}</div>
                                    {linkCount > 0 && (
                                        <div className="text-xs" style={{ color: 'var(--accent-text)' }}>
                                            {t('tests.scoreSheet.link_count', { count: linkCount })}
                                        </div>
                                    )}
                                </th>
                            );
                        })}
                        {(['col_total', 'col_percent', 'col_grade', 'col_absent'] as const).map((h) => (
                            <th
                                key={h}
                                scope="col"
                                style={{
                                    ...stickyHead,
                                    padding: '6px 8px',
                                    borderBottom: cellBorder,
                                    textAlign: 'right',
                                }}
                            >
                                {t(`tests.scoreSheet.${h}`)}
                                {h === 'col_total' && (
                                    <div className="text-xs text-muted">
                                        /
                                        {formatPoints(
                                            questions.reduce((s, q) => s + q.points, 0),
                                            i18n.language
                                        )}
                                    </div>
                                )}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {students.map((student, row) => {
                        const st = sheetByStudent.get(student.id);
                        const absent = !!st?.absent;
                        const hasAny = !!st && st.answers.length > 0;
                        const score = st && hasAny ? scoreStudentTest(test, st) : null;
                        const grade =
                            score && !absent
                                ? resolveTestGrade(test, {
                                      points: score.totalPoints,
                                      maxPoints: score.maxPoints,
                                      percentage: score.percentage,
                                      scale,
                                      student,
                                      cls: classById.get(student.classId),
                                  })
                                : null;
                        return (
                            <tr key={student.id} style={{ opacity: absent ? 0.55 : 1 }}>
                                <th
                                    scope="row"
                                    tabIndex={-1}
                                    onContextMenu={(e) =>
                                        ctx.open(e, rowMenu(row), t('tests.scoreSheet.menu_row_label'))
                                    }
                                    style={{
                                        ...stickyName,
                                        textAlign: 'left',
                                        padding: '4px 10px',
                                        borderBottom: cellBorder,
                                        fontWeight: focus?.row === row ? 700 : 500,
                                        background: focus?.row === row ? selectedHeadBg : stickyName.background,
                                    }}
                                >
                                    {student.name}
                                </th>
                                {questions.map((q, col) => {
                                    const k = key(student.id, q.id);
                                    const value = drafts[k] ?? shown(st, col);
                                    const validity = drafts[k] === undefined ? 'ok' : validateCell(drafts[k], q.points);
                                    const bad = validity === 'invalid' || validity === 'over_max';
                                    const isFocused = focus?.row === row && focus?.col === col;
                                    const inBand = !isFocused && (focus?.row === row || focus?.col === col);
                                    return (
                                        <td
                                            key={q.id}
                                            data-context-menu="cell"
                                            onContextMenu={(e) =>
                                                ctx.open(e, cellMenu(row, col), t('tests.scoreSheet.menu_cell_label'))
                                            }
                                            style={{
                                                borderBottom: cellBorder,
                                                padding: 2,
                                                background: isFocused ? focusedCellBg : inBand ? bandCellBg : undefined,
                                            }}
                                        >
                                            <input
                                                data-cell={`${row}-${col}`}
                                                inputMode="decimal"
                                                autoComplete="off"
                                                disabled={absent || !(canEdit?.(student) ?? true)}
                                                aria-label={t('tests.scoreSheet.cell_label', {
                                                    student: student.name,
                                                    question: test.scoreOnly ? q.prompt : col + 1,
                                                    max: formatPoints(q.points, i18n.language),
                                                })}
                                                aria-invalid={bad || undefined}
                                                title={
                                                    validity === 'over_max'
                                                        ? t('tests.scoreSheet.over_max', { max: q.points })
                                                        : validity === 'invalid'
                                                          ? t('tests.scoreSheet.invalid')
                                                          : undefined
                                                }
                                                value={value}
                                                onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
                                                onFocus={(e) => {
                                                    setFocus({ row, col });
                                                    e.target.select();
                                                }}
                                                onBlur={() => {
                                                    setFocus(null);
                                                    handleBlur(row, col);
                                                }}
                                                onKeyDown={(e) => handleKeyDown(e, row, col)}
                                                onPaste={(e) => handlePaste(e, row, col)}
                                                style={{
                                                    width: 52,
                                                    textAlign: 'center',
                                                    padding: '4px 2px',
                                                    border: bad ? '2px solid var(--red)' : '1px solid transparent',
                                                    outline: isFocused && !bad ? '2px solid var(--accent)' : undefined,
                                                    outlineOffset: -2,
                                                    background: bad
                                                        ? 'color-mix(in srgb, var(--red) 10%, transparent)'
                                                        : 'transparent',
                                                }}
                                            />
                                        </td>
                                    );
                                })}
                                <td
                                    style={{
                                        textAlign: 'right',
                                        padding: '4px 8px',
                                        borderBottom: cellBorder,
                                        fontWeight: 600,
                                    }}
                                >
                                    {score && !absent ? formatPoints(score.totalPoints, i18n.language) : '—'}
                                </td>
                                <td style={{ textAlign: 'right', padding: '4px 8px', borderBottom: cellBorder }}>
                                    {score && !absent ? `${score.percentage.toFixed(1)}%` : '—'}
                                </td>
                                <td
                                    style={{
                                        textAlign: 'right',
                                        padding: '4px 8px',
                                        borderBottom: cellBorder,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {grade ? (
                                        <>
                                            <GradeCell grade={grade} allLabel={allLabel} />
                                            {st && !isSheetComplete(test, st) && (
                                                <span
                                                    className="badge badge-yellow"
                                                    style={{ marginLeft: 6 }}
                                                    title={t('tests.scoreSheet.incomplete_hint')}
                                                >
                                                    {t('tests.scoreSheet.incomplete')}
                                                </span>
                                            )}
                                        </>
                                    ) : (
                                        '—'
                                    )}
                                </td>
                                <td style={{ textAlign: 'center', padding: '4px 8px', borderBottom: cellBorder }}>
                                    <input
                                        type="checkbox"
                                        checked={absent}
                                        disabled={!(canEdit?.(student) ?? true)}
                                        aria-label={t('tests.scoreSheet.absent_label', { student: student.name })}
                                        onChange={(e) => onSave([setAbsent(st, test, student.id, e.target.checked)])}
                                    />
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot>
                    <tr>
                        <th scope="row" style={{ ...stickyName, textAlign: 'left', padding: '6px 10px' }}>
                            {t('tests.scoreSheet.row_mean')}
                        </th>
                        {colMeans.map((m, i) => (
                            <td key={questions[i].id} style={{ textAlign: 'center', padding: '6px 2px' }}>
                                {m === null ? '—' : formatPoints(Math.round(m * 10) / 10, i18n.language)}
                            </td>
                        ))}
                        <td colSpan={4} />
                    </tr>
                    <tr>
                        <th scope="row" style={{ ...stickyName, textAlign: 'left', padding: '6px 10px' }}>
                            {t('tests.quality.p_value')}
                        </th>
                        {items.map((it) => (
                            <td
                                key={it.itemId}
                                style={{
                                    textAlign: 'center',
                                    padding: '6px 2px',
                                    fontWeight: 700,
                                    color: asTextColor(pValueColor(it.pValue)),
                                }}
                            >
                                {it.pValue === null ? '—' : it.pValue.toFixed(2)}
                            </td>
                        ))}
                        <td colSpan={4} />
                    </tr>
                </tfoot>
            </table>
            <ContextMenu {...ctx.menuProps} />
        </div>
    );
}

function GradeCell({ grade, allLabel }: { grade: ReturnType<typeof resolveTestGrade>; allLabel: string }) {
    const { t } = useTranslation();
    if (grade.alternatives) {
        return (
            <span
                title={t('tests.scoreSheet.tier_unresolved')}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    flexWrap: 'wrap',
                    justifyContent: 'flex-end',
                }}
            >
                <AlertTriangle size={13} style={{ color: 'var(--yellow-text)' }} aria-hidden />
                <span className="sr-only">{t('tests.scoreSheet.tier_unresolved')}</span>
                {grade.alternatives.map((alt) => (
                    <span key={alt.tier.id} className="badge badge-yellow">
                        {alt.grade === null ? '—' : alt.grade} · {normTierLabel(alt.tier, allLabel)}
                    </span>
                ))}
            </span>
        );
    }
    return (
        <span style={{ fontWeight: 700, color: grade.color }}>
            {grade.label}
            {grade.tier && (grade.tier.year || grade.tier.track || grade.tier.label) && (
                <span className="badge badge-blue" style={{ marginLeft: 6, fontWeight: 500 }}>
                    {normTierLabel(grade.tier, allLabel)}
                </span>
            )}
        </span>
    );
}
