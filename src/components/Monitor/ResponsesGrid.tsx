import React, { useMemo, useState } from 'react';
import {
    X,
    ChevronDown,
    ChevronRight,
    Flag,
    TrendingUp,
    TrendingDown,
    MoveRight,
    AlertTriangle,
    BatteryMedium,
    ClipboardCopy,
    Hourglass,
    Send,
    ShieldCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cellState, cellPoints, isAnswered, type CellState } from '../../utils/responseCells';
import { parseClozeGaps, parseHotTextFragments, plainQuestionPromptText } from '../../utils/clozeParse';
import { parseErrorPicks, parsePlacedWords } from '../../utils/answerResponseParsers';
import { parseErrorPassage } from '../../../supabase/functions/_shared/testScoring';
import { parseAudioResponse } from '../../utils/audioResponseCode';
import { buildColumnMeta, orderColumns, type ColumnSortRule } from '../../utils/responseGridOrder';
import Modal from '../ui/Modal';
import CompletionBar from './CompletionBar';
import PresenceBadge from './PresenceBadge';
import type { PaceTrend } from '../../utils/monitorSignals';
import type { PresenceState, ProctorFlagSummary } from '../../utils/proctorAggregator';
import type { ProctorEvent, Test, TestAnswer, TestQuestion } from '../../types';

/** Live proctoring state folded into a matrix row instead of a separate list of cards. */
export interface ResponsesGridProctor {
    presence: PresenceState;
    status?: 'submitted' | 'opened' | 'late';
    flags: ProctorFlagSummary;
    /** Merged persisted + live event log, newest last; the expandable detail row shows the tail. */
    events: ProctorEvent[];
    /** Whole minutes without progress once the stall flag is on. */
    stalledMinutes?: number | null;
    /** One-line human summary, e.g. "Handed in · 82% done". */
    statusSummary?: string;
    onNudge?: () => void;
}

export interface ResponsesGridStudentRow {
    studentId: string;
    displayName: string;
    /** Persisted answers (submitted/graded) merged with any live in-progress snapshot answers. */
    answers: TestAnswer[];
    /** Class identity for grouping — duplicate class names must not merge, so grouping keys on this, not the label. */
    classId?: string;
    /** Class name, shown as the group label. Rows without a classId fall into an "unassigned" group. */
    className?: string;
    /** Sections this student actually routed through (mst placement) — cells outside it render as "not presented". */
    sectionPath?: string[];
    /** Ahead / on pace / behind against the class median; omitted when the pace indicator is off. */
    pace?: PaceTrend;
    /** Presence + proctoring signals; when set, the grid grows the signal column and the in-row log. */
    proctor?: ResponsesGridProctor;
}

const PACE_ICON: Record<PaceTrend, { Icon: typeof TrendingUp; color: string }> = {
    ahead: { Icon: TrendingUp, color: 'var(--green-text)' },
    on_pace: { Icon: MoveRight, color: 'var(--text-muted)' },
    behind: { Icon: TrendingDown, color: 'var(--red-text)' },
};

export interface ResponsesGridProps {
    test: Test;
    rows: ResponsesGridStudentRow[];
    /** Column ordering from the sort/filter modal. Defaults to the test's authored order. */
    sortRules?: ColumnSortRule[];
    /** Adds a per-student "answered / presented" column, independent of correctness. */
    showProgress?: boolean;
    /** Adds a row above the students showing what share of the class has answered each question. */
    showClassProgress?: boolean;
    /** Marks the halfway question and the final question (in the test's authored order) on the header. */
    showMilestones?: boolean;
}

const TAB_SWITCH_WARNING_THRESHOLD = 3;
const BATTERY_WARNING_LEVEL = 20;
const DETAIL_EVENT_LIMIT = 12;

function eventTime(at: string): string {
    return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const CELL_COLORS: Record<CellState, string> = {
    correct: 'var(--green)',
    incorrect: 'var(--red)',
    ungraded: 'var(--yellow)',
    empty: 'transparent',
};

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
    if (question.type === 'cloze' || question.type === 'cloze-dropdown' || question.type === 'cloze-bank') {
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
    if (question.type === 'error-correction') {
        const picks = parseErrorPicks(answer.response);
        return parseErrorPassage(question.errorPassage ?? '')
            .flatMap((s) =>
                s.type === 'fragment' && s.index in picks
                    ? [picks[s.index].trim() ? `${s.text} → ${picks[s.index].trim()}` : s.text]
                    : []
            )
            .join('; ');
    }
    if (question.type === 'sentence-builder') return parsePlacedWords(answer.response).join(' ');
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

export default function ResponsesGrid({
    test,
    rows,
    sortRules,
    showProgress = false,
    showClassProgress = false,
    showMilestones = false,
}: ResponsesGridProps) {
    const { t } = useTranslation();
    const [galleryQuestion, setGalleryQuestion] = useState<TestQuestion | null>(null);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [openDetail, setOpenDetail] = useState<Set<string>>(new Set());
    const showProctor = rows.some((row) => row.proctor);

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

    const columnCount = 1 + (showProctor ? 1 : 0) + 1 + (showProgress ? 1 : 0) + orderedColumns.length;

    function toggleDetail(studentId: string) {
        setOpenDetail((prev) => {
            const next = new Set(prev);
            if (next.has(studentId)) next.delete(studentId);
            else next.add(studentId);
            return next;
        });
    }

    const milestones = useMemo(() => {
        const count = test.questions.length;
        if (!showMilestones || count < 2) return null;
        return { halfwayIndex: Math.ceil(count / 2) - 1, lastIndex: count - 1 };
    }, [showMilestones, test.questions.length]);

    // The halfway divider only reads as "half the test" while columns are in authored order.
    const inAuthoredOrder = orderedColumns.every((col, i) => col.originalIndex === i);
    const dividerAfter = (originalIndex: number): React.CSSProperties =>
        milestones && inAuthoredOrder && originalIndex === milestones.halfwayIndex
            ? { borderRight: '2px dashed var(--accent)' }
            : {};

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

    const studentProgress = (row: ResponsesGridStudentRow): { answered: number; total: number } => {
        let answered = 0;
        let total = 0;
        for (const q of test.questions) {
            if (!isPresented(row, q)) continue;
            total++;
            if (
                isAnswered(
                    q,
                    row.answers.find((a) => a.questionId === q.id)
                )
            )
                answered++;
        }
        return { answered, total };
    };

    const classProgress = useMemo(() => {
        if (!showClassProgress) return null;
        const perQuestion = new Map<string, { answered: number; presented: number }>();
        for (const q of test.questions) {
            let answered = 0;
            let presented = 0;
            for (const row of rows) {
                if (!isPresented(row, q)) continue;
                presented++;
                if (
                    isAnswered(
                        q,
                        row.answers.find((a) => a.questionId === q.id)
                    )
                )
                    answered++;
            }
            perQuestion.set(q.id, { answered, presented });
        }
        const finished = rows.filter((row) => {
            const p = studentProgress(row);
            return p.total > 0 && p.answered === p.total;
        }).length;
        return { perQuestion, finished };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showClassProgress, test.questions, rows]);

    // Group rows by class identity (not the display name — duplicate names must stay separate);
    // a single implicit group (no classId set) renders without a header band.
    const groups = useMemo(() => {
        const byClass = new Map<string, { key: string; label: string; rows: ResponsesGridStudentRow[] }>();
        for (const row of rows) {
            const key = row.classId ?? '';
            const group = byClass.get(key) ?? { key, label: row.className ?? '', rows: [] };
            group.rows.push(row);
            byClass.set(key, group);
        }
        return Array.from(byClass.values());
    }, [rows]);
    const showGroupHeaders = groups.length > 1 || (groups.length === 1 && groups[0].key !== '');

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

    function renderSignals(row: ResponsesGridStudentRow) {
        const proctor = row.proctor;
        if (!proctor) return null;
        const battery = proctor.flags.battery;
        const clipboard = proctor.flags.copyCount + proctor.flags.cutCount + proctor.flags.pasteCount;
        const stalled = proctor.stalledMinutes ?? null;
        const flagged = proctor.flags.tabSwitchCount >= TAB_SWITCH_WARNING_THRESHOLD || stalled !== null;
        const quiet =
            proctor.flags.tabSwitchCount === 0 &&
            clipboard === 0 &&
            !battery &&
            !proctor.flags.sebActive &&
            stalled === null &&
            !row.pace;
        return (
            <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {proctor.flags.tabSwitchCount > 0 && (
                        <span
                            className={`badge ${flagged ? 'badge-red' : 'badge-yellow'}`}
                            title={t('tests.monitor.flags.tabSwitch', { count: proctor.flags.tabSwitchCount })}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                            <AlertTriangle size={11} aria-hidden="true" />
                            {t('tests.monitor.flags.tabSwitch', { count: proctor.flags.tabSwitchCount })}
                        </span>
                    )}
                    {clipboard > 0 && (
                        <span
                            className="badge badge-blue"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                            <ClipboardCopy size={11} aria-hidden="true" />
                            {t('tests.monitor.flags.clipboard', { count: clipboard })}
                        </span>
                    )}
                    {battery && (
                        <span
                            className={`badge ${battery.level <= BATTERY_WARNING_LEVEL ? 'badge-red' : ''}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            title={t('tests.monitor.flags.battery', {
                                level: battery.level,
                                charging: battery.charging ? '+' : '',
                            })}
                        >
                            <BatteryMedium size={11} aria-hidden="true" />
                            {t('tests.monitor.flags.battery', {
                                level: battery.level,
                                charging: battery.charging ? '+' : '',
                            })}
                        </span>
                    )}
                    {proctor.flags.sebActive && (
                        <span
                            className="badge badge-green"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                            <ShieldCheck size={11} aria-hidden="true" />
                            {t('tests.monitor.flags.seb')}
                        </span>
                    )}
                    {stalled !== null && (
                        <span
                            className="badge badge-yellow"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            title={t('tests.monitor.stalled_badge', { count: stalled })}
                        >
                            <Hourglass size={11} aria-hidden="true" />
                            {t('tests.monitor.stalled_badge', { count: stalled })}
                        </span>
                    )}
                    {row.pace &&
                        (() => {
                            const { Icon, color } = PACE_ICON[row.pace];
                            return (
                                <span
                                    className="badge"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color }}
                                >
                                    <Icon size={11} aria-hidden="true" />
                                    {t(`tests.monitor.pace.${row.pace}`)}
                                </span>
                            );
                        })()}
                    {quiet && <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>—</span>}
                    {proctor.onNudge && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={proctor.onNudge}
                            title={t('tests.monitor.nudge_button')}
                            aria-label={t('tests.monitor.nudge_button')}
                        >
                            <Send size={13} aria-hidden="true" />
                        </button>
                    )}
                </div>
            </td>
        );
    }

    function renderDetailRow(row: ResponsesGridStudentRow) {
        const proctor = row.proctor;
        if (!proctor || !openDetail.has(row.studentId)) return null;
        const recent = proctor.events.slice(-DETAIL_EVENT_LIMIT).reverse();
        return (
            <tr data-testid={`proctor-detail-${row.studentId}`}>
                <td
                    colSpan={columnCount}
                    style={{
                        padding: '8px 12px 10px',
                        background: 'var(--bg)',
                        borderBottom: '1px solid var(--border)',
                    }}
                >
                    {proctor.statusSummary && (
                        <p style={{ margin: '0 0 6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {proctor.statusSummary}
                        </p>
                    )}
                    <div
                        style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            color: 'var(--text-dim)',
                        }}
                    >
                        {t('tests.monitor.grid.detail_title')}
                    </div>
                    {recent.length === 0 ? (
                        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                            {t('tests.monitor.grid.detail_empty')}
                        </p>
                    ) : (
                        <ul
                            style={{
                                margin: '4px 0 0',
                                padding: 0,
                                listStyle: 'none',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                                gap: '2px 14px',
                                fontSize: '0.78rem',
                                color: 'var(--text)',
                            }}
                        >
                            {recent.map((event) => (
                                <li key={`${event.type}:${event.at}`}>
                                    <span style={{ color: 'var(--text-dim)' }}>{eventTime(event.at)}</span>{' '}
                                    {t(`tests.monitor.events.${event.type}`)}
                                    {(event.type === 'battery' || event.type === 'heartbeat') &&
                                    event.value !== undefined
                                        ? ` · ${String(event.value)}`
                                        : ''}
                                </li>
                            ))}
                        </ul>
                    )}
                </td>
            </tr>
        );
    }

    function renderAvgCell(p: number | undefined, key: string, divider: React.CSSProperties = {}) {
        return (
            <td key={key} style={{ padding: '4px 8px', textAlign: 'center', minWidth: 46, ...divider }}>
                <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{formatPct(p)}</div>
                {p !== undefined && (
                    <div style={{ height: 3, borderRadius: 2, marginTop: 2, background: avgColor(p) }} />
                )}
            </td>
        );
    }

    function renderCell(row: ResponsesGridStudentRow, q: TestQuestion, divider: React.CSSProperties) {
        if (!isPresented(row, q)) {
            return (
                <td key={q.id} style={{ padding: '4px 8px', textAlign: 'center', ...divider }}>
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
            <td key={q.id} style={{ padding: '4px 8px', textAlign: 'center', ...divider }}>
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
            <div style={{ overflowX: 'auto', flexShrink: 0 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
                    <thead>
                        <tr>
                            <th style={{ ...th, ...stickyLeft, textAlign: 'left', color: 'var(--text-muted)' }}>
                                {t('tests.monitor.grid.student')}
                            </th>
                            {showProctor && (
                                <th style={{ ...th, textAlign: 'left', color: 'var(--text-muted)' }}>
                                    {t('tests.monitor.grid.signals')}
                                </th>
                            )}
                            <th style={{ ...th, textAlign: 'center', color: 'var(--text-muted)' }}>
                                {t('tests.monitor.grid.totals')}
                            </th>
                            {showProgress && (
                                <th style={{ ...th, textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {t('tests.monitor.grid.progress')}
                                </th>
                            )}
                            {orderedColumns.map((col) => {
                                const q = questionsById.get(col.id)!;
                                const shortLabel = t('tests.monitor.grid.question_short', {
                                    index: col.originalIndex + 1,
                                });
                                const milestone =
                                    milestones?.halfwayIndex === col.originalIndex
                                        ? 'halfway'
                                        : milestones?.lastIndex === col.originalIndex
                                          ? 'final'
                                          : null;
                                const milestoneLabel = milestone
                                    ? t(`tests.monitor.grid.milestone_${milestone}`)
                                    : null;
                                const fullLabel = `${shortLabel}${milestoneLabel ? ` (${milestoneLabel})` : ''}: ${plainQuestionPromptText(q)}`;
                                return (
                                    <th
                                        key={col.id}
                                        style={{
                                            ...th,
                                            textAlign: 'center',
                                            color: 'var(--accent-text)',
                                            ...dividerAfter(col.originalIndex),
                                        }}
                                    >
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => setGalleryQuestion(q)}
                                            title={fullLabel}
                                            aria-label={fullLabel}
                                        >
                                            {shortLabel}
                                        </button>
                                        {milestoneLabel && (
                                            <div
                                                aria-hidden="true"
                                                data-testid={`milestone-${milestone}`}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: 3,
                                                    fontSize: '0.68rem',
                                                    fontWeight: 600,
                                                    color: 'var(--text-muted)',
                                                }}
                                            >
                                                <Flag size={10} />
                                                {milestoneLabel}
                                            </div>
                                        )}
                                    </th>
                                );
                            })}
                        </tr>
                        {/* Class-wide average row */}
                        <tr style={{ background: 'var(--bg-elevated)' }}>
                            <td style={{ ...stickyLeft, padding: '4px 8px', fontWeight: 700 }}>
                                {t('tests.monitor.grid.average')}
                            </td>
                            {showProctor && <td style={{ padding: '4px 8px' }} />}
                            {renderAvgCell(overallAvg, 'avg-total')}
                            {showProgress && <td />}
                            {orderedColumns.map((col) =>
                                renderAvgCell(
                                    avgByQuestion.get(col.id),
                                    `avg-${col.id}`,
                                    dividerAfter(col.originalIndex)
                                )
                            )}
                        </tr>
                        {classProgress && (
                            <tr style={{ background: 'var(--bg-elevated)' }} data-testid="class-progress-row">
                                <td style={{ ...stickyLeft, padding: '4px 8px', fontWeight: 700 }}>
                                    {t('tests.monitor.grid.class_progress')}
                                </td>
                                {showProctor && <td style={{ padding: '4px 8px' }} />}
                                <td style={{ padding: '4px 8px' }}>
                                    <CompletionBar
                                        value={classProgress.finished}
                                        max={rows.length}
                                        text={t('tests.monitor.grid.progress_value', {
                                            answered: classProgress.finished,
                                            total: rows.length,
                                        })}
                                        label={t('tests.monitor.grid.class_finished_aria', {
                                            finished: classProgress.finished,
                                            total: rows.length,
                                        })}
                                    />
                                </td>
                                {showProgress && <td />}
                                {orderedColumns.map((col) => {
                                    const cp = classProgress.perQuestion.get(col.id) ?? { answered: 0, presented: 0 };
                                    const percent =
                                        cp.presented > 0 ? Math.round((cp.answered / cp.presented) * 100) : 0;
                                    return (
                                        <td
                                            key={`cp-${col.id}`}
                                            style={{ padding: '4px 8px', ...dividerAfter(col.originalIndex) }}
                                        >
                                            <CompletionBar
                                                value={cp.answered}
                                                max={cp.presented}
                                                minWidth={46}
                                                text={cp.presented > 0 ? `${percent}%` : '—'}
                                                label={t('tests.monitor.grid.class_progress_aria', {
                                                    answered: cp.answered,
                                                    total: cp.presented,
                                                })}
                                            />
                                        </td>
                                    );
                                })}
                            </tr>
                        )}
                    </thead>
                    <tbody>
                        {groups.map((group) => {
                            const isCollapsed = collapsed.has(group.key);
                            const ga = showGroupHeaders ? groupAverages(group.rows) : null;
                            return (
                                <React.Fragment key={group.key || '__ungrouped'}>
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
                                                            if (next.has(group.key)) next.delete(group.key);
                                                            else next.add(group.key);
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
                                            {showProctor && (
                                                <td
                                                    style={{
                                                        ...stickyLeft,
                                                        background: 'var(--bg-panel)',
                                                        padding: '4px 8px',
                                                    }}
                                                />
                                            )}
                                            {renderAvgCell(ga!.total, `g-total-${group.key}`)}
                                            {showProgress && <td />}
                                            {orderedColumns.map((col) =>
                                                renderAvgCell(
                                                    ga!.perQuestion.get(col.id),
                                                    `g-${group.key}-${col.id}`,
                                                    dividerAfter(col.originalIndex)
                                                )
                                            )}
                                        </tr>
                                    )}
                                    {!isCollapsed &&
                                        group.rows.map((row) => {
                                            const flagged =
                                                !!row.proctor &&
                                                (row.proctor.flags.tabSwitchCount >= TAB_SWITCH_WARNING_THRESHOLD ||
                                                    (row.proctor.stalledMinutes ?? null) !== null);
                                            const detailOpen = openDetail.has(row.studentId);
                                            return (
                                                <React.Fragment key={row.studentId}>
                                                    <tr data-testid={`response-row-${row.studentId}`}>
                                                        <td
                                                            style={{
                                                                ...stickyLeft,
                                                                padding: '4px 8px',
                                                                whiteSpace: 'nowrap',
                                                                color: 'var(--text)',
                                                                borderLeft: flagged
                                                                    ? '3px solid var(--red)'
                                                                    : '3px solid transparent',
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: 6,
                                                                }}
                                                            >
                                                                {row.proctor && (
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-ghost btn-icon btn-sm"
                                                                        onClick={() => toggleDetail(row.studentId)}
                                                                        aria-expanded={detailOpen}
                                                                        aria-label={t(
                                                                            detailOpen
                                                                                ? 'tests.monitor.grid.detail_close'
                                                                                : 'tests.monitor.grid.detail_open',
                                                                            { name: row.displayName }
                                                                        )}
                                                                        title={t(
                                                                            detailOpen
                                                                                ? 'tests.monitor.grid.detail_close'
                                                                                : 'tests.monitor.grid.detail_open',
                                                                            { name: row.displayName }
                                                                        )}
                                                                    >
                                                                        {detailOpen ? (
                                                                            <ChevronDown size={14} />
                                                                        ) : (
                                                                            <ChevronRight size={14} />
                                                                        )}
                                                                    </button>
                                                                )}
                                                                <span
                                                                    style={{
                                                                        display: 'inline-flex',
                                                                        flexDirection: 'column',
                                                                        gap: 2,
                                                                    }}
                                                                >
                                                                    <span
                                                                        style={{
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: 6,
                                                                        }}
                                                                    >
                                                                        {row.displayName}
                                                                        {row.pace &&
                                                                            (() => {
                                                                                const { Icon, color } =
                                                                                    PACE_ICON[row.pace];
                                                                                const label = t(
                                                                                    `tests.monitor.pace.${row.pace}`
                                                                                );
                                                                                return (
                                                                                    <span
                                                                                        role="img"
                                                                                        aria-label={label}
                                                                                        title={label}
                                                                                        style={{
                                                                                            display: 'inline-flex',
                                                                                            color,
                                                                                        }}
                                                                                    >
                                                                                        <Icon
                                                                                            size={13}
                                                                                            aria-hidden="true"
                                                                                        />
                                                                                    </span>
                                                                                );
                                                                            })()}
                                                                    </span>
                                                                    {row.proctor && (
                                                                        <span
                                                                            style={{
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: 8,
                                                                            }}
                                                                        >
                                                                            <PresenceBadge
                                                                                presence={row.proctor.presence}
                                                                                status={row.proctor.status}
                                                                            />
                                                                            {row.proctor.statusSummary && (
                                                                                <span
                                                                                    data-testid="monitor-status-summary"
                                                                                    style={{
                                                                                        fontSize: '0.72rem',
                                                                                        color: 'var(--text-dim)',
                                                                                    }}
                                                                                >
                                                                                    {row.proctor.statusSummary}
                                                                                </span>
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        {showProctor && (renderSignals(row) ?? <td />)}
                                                        <td
                                                            style={{
                                                                padding: '4px 8px',
                                                                textAlign: 'center',
                                                                fontWeight: 600,
                                                            }}
                                                        >
                                                            {formatPct(studentTotal(row))}
                                                        </td>
                                                        {showProgress &&
                                                            (() => {
                                                                const p = studentProgress(row);
                                                                return (
                                                                    <td style={{ padding: '4px 8px' }}>
                                                                        <CompletionBar
                                                                            value={p.answered}
                                                                            max={p.total}
                                                                            text={t(
                                                                                'tests.monitor.grid.progress_value',
                                                                                p
                                                                            )}
                                                                            label={t(
                                                                                'tests.monitor.grid.progress_aria',
                                                                                p
                                                                            )}
                                                                        />
                                                                    </td>
                                                                );
                                                            })()}
                                                        {orderedColumns.map((col) =>
                                                            renderCell(
                                                                row,
                                                                questionsById.get(col.id)!,
                                                                dividerAfter(col.originalIndex)
                                                            )
                                                        )}
                                                    </tr>
                                                    {renderDetailRow(row)}
                                                </React.Fragment>
                                            );
                                        })}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {galleryQuestion && (
                <Modal
                    titleId="responses-gallery-title"
                    onClose={() => setGalleryQuestion(null)}
                    maxWidth={560}
                    style={{ maxHeight: '80vh', overflowY: 'auto' }}
                >
                    <div>
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
                                    id="responses-gallery-title"
                                    style={{
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        color: 'var(--accent-text)',
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    {t('tests.monitor.grid.gallery_title', {
                                        index: test.questions.findIndex((q) => q.id === galleryQuestion.id) + 1,
                                    })}
                                </div>
                                <p style={{ margin: '6px 0 0', color: 'var(--text)' }}>
                                    {plainQuestionPromptText(galleryQuestion)}
                                </p>
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
                                const presented = isPresented(row, galleryQuestion);
                                const answer = row.answers.find((a) => a.questionId === galleryQuestion.id);
                                const text = presented ? answerDisplayText(galleryQuestion, answer, t) : '';
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
                                            {text ||
                                                t(
                                                    presented
                                                        ? 'tests.monitor.grid.no_answer'
                                                        : 'tests.monitor.grid.state.absent'
                                                )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
