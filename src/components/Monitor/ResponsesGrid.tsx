import React, { useMemo, useState } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { scoreShortAnswerExact, scoreNumeric, autoScoreResponse } from '../../utils/testCalc';
import { parseClozeGaps, parseHotTextFragments } from '../../utils/clozeParse';
import { parseAudioResponse } from '../../utils/audioResponseCode';
import { buildColumnMeta, orderColumns, type ColumnSortRule } from '../../utils/responseGridOrder';
import type { Test, TestAnswer, TestQuestion } from '../../types';

export interface ResponsesGridStudentRow {
    studentId: string;
    displayName: string;
    /** Persisted answers (submitted/graded) merged with any live in-progress snapshot answers. */
    answers: TestAnswer[];
    /** Class name, for the collapsible class grouping. Rows without one fall into an "unassigned" group. */
    className?: string;
    /** Sections this student actually routed through (mst placement) — cells outside it render as "not presented". */
    sectionPath?: string[];
}

export interface ResponsesGridProps {
    test: Test;
    rows: ResponsesGridStudentRow[];
    /** Column ordering from the sort/filter modal. Defaults to the test's authored order. */
    sortRules?: ColumnSortRule[];
}

type CellState = 'correct' | 'incorrect' | 'ungraded' | 'empty';

function cellState(question: TestQuestion, answer: TestAnswer | undefined): CellState {
    if (!answer || answer.response.trim() === '') return 'empty';
    if (answer.pointsEarned !== undefined) {
        return answer.pointsEarned >= question.points ? 'correct' : 'incorrect';
    }
    if (question.type === 'multiple-choice') {
        const selected = question.options?.find((o) => o.id === answer.response);
        return selected?.isCorrect ? 'correct' : 'incorrect';
    }
    if (question.type === 'multiple-response') {
        let selected: string[] = [];
        try {
            selected = JSON.parse(answer.response) as string[];
        } catch {
            /* ignore malformed response */
        }
        if (selected.length === 0) return 'empty';
        return autoScoreResponse(question, answer.response) >= question.points ? 'correct' : 'incorrect';
    }
    if (question.type === 'true-false') {
        return autoScoreResponse(question, answer.response) >= question.points ? 'correct' : 'incorrect';
    }
    if (question.type === 'short-answer') {
        const score = scoreShortAnswerExact(question, answer.response);
        if (score === null) return 'ungraded';
        return score > 0 ? 'correct' : 'incorrect';
    }
    if (question.type === 'numeric') {
        const score = scoreNumeric(question, answer.response);
        if (score === null) return 'ungraded';
        return score > 0 ? 'correct' : 'incorrect';
    }
    if (question.type === 'cloze' || question.type === 'cloze-dropdown') {
        let answers: Record<string, string> = {};
        try {
            answers = JSON.parse(answer.response) as Record<string, string>;
        } catch {
            /* ignore malformed response */
        }
        if (!Object.values(answers).some((v) => v.trim() !== '')) return 'empty';
        return autoScoreResponse(question, answer.response) >= question.points ? 'correct' : 'incorrect';
    }
    if (question.type === 'matching' || question.type === 'categorize') {
        let answers: Record<string, string> = {};
        try {
            answers = JSON.parse(answer.response) as Record<string, string>;
        } catch {
            /* ignore malformed response */
        }
        if (Object.keys(answers).length === 0) return 'empty';
        return autoScoreResponse(question, answer.response) >= question.points ? 'correct' : 'incorrect';
    }
    if (question.type === 'ordering') {
        let order: string[] = [];
        try {
            order = JSON.parse(answer.response) as string[];
        } catch {
            /* ignore malformed response */
        }
        if (order.length === 0) return 'empty';
        return autoScoreResponse(question, answer.response) >= question.points ? 'correct' : 'incorrect';
    }
    if (question.type === 'hot-text') {
        let selected: number[] = [];
        try {
            selected = JSON.parse(answer.response) as number[];
        } catch {
            /* ignore malformed response */
        }
        if (selected.length === 0) return 'empty';
        return autoScoreResponse(question, answer.response) >= question.points ? 'correct' : 'incorrect';
    }
    return 'ungraded';
}

const CELL_COLORS: Record<CellState, string> = {
    correct: 'var(--green)',
    incorrect: 'var(--red)',
    ungraded: 'var(--yellow)',
    empty: 'transparent',
};

/** Earned/max contribution of one cell. Ungraded and not-presented cells contribute nothing (excluded from averages). */
function cellPoints(question: TestQuestion, answer: TestAnswer | undefined): { earned: number; max: number } | null {
    const state = cellState(question, answer);
    if (state === 'ungraded') return null;
    if (state === 'empty') return { earned: 0, max: question.points };
    const earned = answer?.pointsEarned ?? autoScoreResponse(question, answer!.response);
    return { earned, max: question.points };
}

function pct(earned: number, max: number): number | undefined {
    return max > 0 ? (earned / max) * 100 : undefined;
}

/** Difficulty ramp for the thin bar under an average %: high = green, mid = yellow, low = red. */
function avgColor(p: number): string {
    return p >= 80 ? 'var(--green)' : p >= 50 ? 'var(--yellow)' : 'var(--red)';
}

function formatPct(p: number | undefined): string {
    return p === undefined ? '—' : `${Math.round(p)}%`;
}

function answerDisplayText(
    question: TestQuestion,
    answer: TestAnswer | undefined,
    t: (key: string, options?: Record<string, unknown>) => string
): string {
    if (!answer || answer.response.trim() === '') return '';
    if (question.type === 'multiple-choice') {
        return question.options?.find((o) => o.id === answer.response)?.text ?? answer.response;
    }
    if (question.type === 'multiple-response') {
        try {
            const selected = JSON.parse(answer.response) as string[];
            return selected
                .map((id) => question.options?.find((o) => o.id === id)?.text)
                .filter((text): text is string => !!text)
                .join(', ');
        } catch {
            return '';
        }
    }
    if (question.type === 'true-false') {
        return t(`tests.true_false_${answer.response}`);
    }
    if (question.type === 'cloze' || question.type === 'cloze-dropdown') {
        try {
            const answers = JSON.parse(answer.response) as Record<string, string>;
            const gaps = parseClozeGaps(question.prompt);
            return gaps
                .map((gap) => answers[gap.index] ?? '')
                .filter((v) => v.trim() !== '')
                .join(', ');
        } catch {
            return '';
        }
    }
    if (question.type === 'hot-text') {
        try {
            const selected = new Set(JSON.parse(answer.response) as number[]);
            const fragments = parseHotTextFragments(question.hotTextPassage ?? '').filter(
                (s) => s.type === 'fragment' && selected.has(s.index)
            );
            return fragments.map((f) => f.text).join(', ');
        } catch {
            return '';
        }
    }
    if (question.type === 'audio-response') {
        const audio = parseAudioResponse(answer.response);
        return audio ? t('tests.monitor.grid.audio_recorded', { seconds: audio.durationSec }) : '';
    }
    return answer.response;
}

const stickyLeft: React.CSSProperties = {
    position: 'sticky',
    left: 0,
    background: 'var(--bg-elevated)',
    zIndex: 1,
};

export default function ResponsesGrid({ test, rows, sortRules }: ResponsesGridProps) {
    const { t } = useTranslation();
    const [galleryQuestion, setGalleryQuestion] = useState<TestQuestion | null>(null);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const questionsById = useMemo(() => new Map(test.questions.map((q) => [q.id, q])), [test.questions]);

    // A cell counts for a student only if it was presented — always true for a standard test,
    // and gated by the routed section path for an mst placement test.
    const isPresented = (row: ResponsesGridStudentRow, q: TestQuestion): boolean =>
        !row.sectionPath || !q.sectionId || row.sectionPath.includes(q.sectionId);

    // Per-question class averages, over presented students only.
    const avgByQuestion = useMemo(() => {
        const acc = new Map<string, number | undefined>();
        for (const q of test.questions) {
            let earned = 0;
            let max = 0;
            for (const row of rows) {
                if (!isPresented(row, q)) continue;
                const cp = cellPoints(
                    q,
                    row.answers.find((a) => a.questionId === q.id)
                );
                if (!cp) continue;
                earned += cp.earned;
                max += cp.max;
            }
            acc.set(q.id, pct(earned, max));
        }
        return acc;
    }, [test.questions, rows]);

    const orderedColumns = useMemo(
        () => orderColumns(buildColumnMeta(test, avgByQuestion), sortRules ?? [{ key: 'original', dir: 'asc' }]),
        [test, avgByQuestion, sortRules]
    );

    const studentTotal = (row: ResponsesGridStudentRow): number | undefined => {
        let earned = 0;
        let max = 0;
        for (const q of test.questions) {
            if (!isPresented(row, q)) continue;
            const cp = cellPoints(
                q,
                row.answers.find((a) => a.questionId === q.id)
            );
            if (!cp) continue;
            earned += cp.earned;
            max += cp.max;
        }
        return pct(earned, max);
    };

    // Group rows by class; a single implicit group (no class names set) renders without a header band.
    const groups = useMemo(() => {
        const byClass = new Map<string, ResponsesGridStudentRow[]>();
        for (const row of rows) {
            const key = row.className ?? '';
            (byClass.get(key) ?? byClass.set(key, []).get(key)!).push(row);
        }
        return Array.from(byClass.entries()).map(([label, groupRows]) => ({ label, rows: groupRows }));
    }, [rows]);
    const showGroupHeaders = groups.length > 1 || (groups.length === 1 && groups[0].label !== '');

    const overallAvg = useMemo(() => {
        const vals = rows.map(studentTotal).filter((v): v is number => v !== undefined);
        return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : undefined;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, test.questions]);

    function groupAverages(groupRows: ResponsesGridStudentRow[]) {
        const perQuestion = new Map<string, number | undefined>();
        for (const q of test.questions) {
            let earned = 0;
            let max = 0;
            for (const row of groupRows) {
                if (!isPresented(row, q)) continue;
                const cp = cellPoints(
                    q,
                    row.answers.find((a) => a.questionId === q.id)
                );
                if (!cp) continue;
                earned += cp.earned;
                max += cp.max;
            }
            perQuestion.set(q.id, pct(earned, max));
        }
        const totals = groupRows.map(studentTotal).filter((v): v is number => v !== undefined);
        const total = totals.length ? totals.reduce((s, v) => s + v, 0) / totals.length : undefined;
        return { perQuestion, total };
    }

    const th: React.CSSProperties = {
        padding: '6px 8px',
        borderBottom: '1px solid var(--border)',
        whiteSpace: 'nowrap',
    };

    function renderAvgCell(p: number | undefined, key: string) {
        return (
            <td key={key} style={{ padding: '4px 8px', textAlign: 'center', minWidth: 46 }}>
                <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{formatPct(p)}</div>
                {p !== undefined && (
                    <div style={{ height: 3, borderRadius: 2, marginTop: 2, background: avgColor(p) }} />
                )}
            </td>
        );
    }

    function renderCell(row: ResponsesGridStudentRow, q: TestQuestion) {
        if (!isPresented(row, q)) {
            return (
                <td key={q.id} style={{ padding: '4px 8px', textAlign: 'center' }}>
                    <div
                        aria-label={t('tests.monitor.grid.state.absent')}
                        title={t('tests.monitor.grid.state.absent')}
                        style={{
                            height: 14,
                            borderRadius: 3,
                            background:
                                'repeating-linear-gradient(45deg,var(--bg),var(--bg) 3px,var(--bg-elevated) 3px,var(--bg-elevated) 6px)',
                            opacity: 0.6,
                        }}
                    />
                </td>
            );
        }
        const state = cellState(
            q,
            row.answers.find((a) => a.questionId === q.id)
        );
        return (
            <td key={q.id} style={{ padding: '4px 8px', textAlign: 'center' }}>
                <div
                    aria-label={t(`tests.monitor.grid.state.${state}`)}
                    title={t(`tests.monitor.grid.state.${state}`)}
                    style={{
                        height: 14,
                        borderRadius: 3,
                        background: CELL_COLORS[state],
                        border: state === 'empty' ? '1px solid var(--border)' : 'none',
                    }}
                />
            </td>
        );
    }

    return (
        <>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
                    <thead>
                        <tr>
                            <th style={{ ...th, ...stickyLeft, textAlign: 'left', color: 'var(--text-muted)' }}>
                                {t('tests.monitor.grid.student')}
                            </th>
                            <th style={{ ...th, textAlign: 'center', color: 'var(--text-muted)' }}>
                                {t('tests.monitor.grid.totals')}
                            </th>
                            {orderedColumns.map((col) => {
                                const q = questionsById.get(col.id)!;
                                return (
                                    <th key={col.id} style={{ ...th, textAlign: 'center', color: 'var(--accent)' }}>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => setGalleryQuestion(q)}
                                            title={q.prompt}
                                            aria-label={q.prompt}
                                        >
                                            {t('tests.monitor.grid.question_short', { index: col.originalIndex + 1 })}
                                        </button>
                                    </th>
                                );
                            })}
                        </tr>
                        {/* Class-wide average row */}
                        <tr style={{ background: 'var(--bg-elevated)' }}>
                            <td style={{ ...stickyLeft, padding: '4px 8px', fontWeight: 700 }}>
                                {t('tests.monitor.grid.average')}
                            </td>
                            {renderAvgCell(overallAvg, 'avg-total')}
                            {orderedColumns.map((col) => renderAvgCell(avgByQuestion.get(col.id), `avg-${col.id}`))}
                        </tr>
                    </thead>
                    <tbody>
                        {groups.map((group) => {
                            const isCollapsed = collapsed.has(group.label);
                            const ga = showGroupHeaders ? groupAverages(group.rows) : null;
                            return (
                                <React.Fragment key={group.label || '__ungrouped'}>
                                    {showGroupHeaders && (
                                        <tr style={{ background: 'var(--bg-panel)' }}>
                                            <td
                                                style={{
                                                    ...stickyLeft,
                                                    background: 'var(--bg-panel)',
                                                    padding: '4px 8px',
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() =>
                                                        setCollapsed((prev) => {
                                                            const next = new Set(prev);
                                                            if (next.has(group.label)) next.delete(group.label);
                                                            else next.add(group.label);
                                                            return next;
                                                        })
                                                    }
                                                    style={{
                                                        fontWeight: 700,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 4,
                                                    }}
                                                >
                                                    {isCollapsed ? (
                                                        <ChevronRight size={14} />
                                                    ) : (
                                                        <ChevronDown size={14} />
                                                    )}
                                                    {group.label || t('tests.monitor.grid.no_class')}
                                                </button>
                                            </td>
                                            {renderAvgCell(ga!.total, `g-total-${group.label}`)}
                                            {orderedColumns.map((col) =>
                                                renderAvgCell(ga!.perQuestion.get(col.id), `g-${group.label}-${col.id}`)
                                            )}
                                        </tr>
                                    )}
                                    {!isCollapsed &&
                                        group.rows.map((row) => (
                                            <tr key={row.studentId}>
                                                <td
                                                    style={{
                                                        ...stickyLeft,
                                                        padding: '4px 8px',
                                                        whiteSpace: 'nowrap',
                                                        color: 'var(--text)',
                                                    }}
                                                >
                                                    {row.displayName}
                                                </td>
                                                <td
                                                    style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 600 }}
                                                >
                                                    {formatPct(studentTotal(row))}
                                                </td>
                                                {orderedColumns.map((col) =>
                                                    renderCell(row, questionsById.get(col.id)!)
                                                )}
                                            </tr>
                                        ))}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {galleryQuestion && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={t('tests.monitor.grid.gallery_title', {
                        index: test.questions.findIndex((q) => q.id === galleryQuestion.id) + 1,
                    })}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                    }}
                    onClick={() => setGalleryQuestion(null)}
                >
                    <div
                        style={{
                            background: 'var(--bg-elevated)',
                            borderRadius: 12,
                            padding: 20,
                            maxWidth: 560,
                            width: '90%',
                            maxHeight: '80vh',
                            overflowY: 'auto',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: 12,
                            }}
                        >
                            <div>
                                <div
                                    style={{
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        color: 'var(--accent)',
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    {t('tests.monitor.grid.gallery_title', {
                                        index: test.questions.findIndex((q) => q.id === galleryQuestion.id) + 1,
                                    })}
                                </div>
                                <p style={{ margin: '6px 0 0', color: 'var(--text)' }}>{galleryQuestion.prompt}</p>
                            </div>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                onClick={() => setGalleryQuestion(null)}
                                aria-label={t('common.close')}
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {rows.map((row) => {
                                const answer = row.answers.find((a) => a.questionId === galleryQuestion.id);
                                const text = answerDisplayText(galleryQuestion, answer, t);
                                return (
                                    <div
                                        key={row.studentId}
                                        style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}
                                    >
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)' }}>
                                            {row.displayName}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: '0.85rem',
                                                color: text ? 'var(--text)' : 'var(--text-dim)',
                                            }}
                                        >
                                            {text || t('tests.monitor.grid.no_answer')}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
