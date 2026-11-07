import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CEFR_LEVELS } from '../../data/cefrDescriptors';
import CompletionBar from './CompletionBar';
import type { CefrLevel, StaircaseStep } from '../../types';

export interface LevelResponsesGridStudentRow {
    studentId: string;
    displayName: string;
    /** Class identity for grouping — duplicate class names must not merge, so grouping keys on this, not the label. */
    classId?: string;
    /** Class name, shown as the group label. */
    className?: string;
    /** Adaptive trace — one step per question asked, each tagged with the CEFR level it probed. */
    levelPath: StaircaseStep[];
    /** Provisional CEFR estimate for the TOTALS column. */
    estimatedLevel?: CefrLevel;
    /** Questions answered so far; falls back to the trace length. Live runs report it before hand-in. */
    questionsAnswered?: number;
    /** A finished run is complete however few questions it took to converge. */
    finished?: boolean;
}

export interface LevelResponsesGridProps {
    rows: LevelResponsesGridStudentRow[];
    /** Upper bound on questions per run; adaptive runs may stop earlier once the level converges. */
    maxQuestions?: number;
    showProgress?: boolean;
    showClassProgress?: boolean;
}

function levelStats(steps: StaircaseStep[], level: CefrLevel): { correct: number; attempted: number } {
    const at = steps.filter((s) => s.level === level);
    return { correct: at.filter((s) => s.correct).length, attempted: at.length };
}

const stickyLeft: React.CSSProperties = {
    position: 'sticky',
    left: 0,
    background: 'var(--bg-elevated)',
    zIndex: 1,
};

/**
 * Adaptive placement (staircase / generator) grid. Every student sees a different set of
 * questions, so columns align on CEFR level rather than question identity: each cell is a
 * green-over-red bar of correct/attempted at that level, and TOTALS shows the estimated level.
 */
export default function LevelResponsesGrid({
    rows,
    maxQuestions,
    showProgress = false,
    showClassProgress = false,
}: LevelResponsesGridProps) {
    const { t } = useTranslation();
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const levels = useMemo(() => {
        const present = new Set<CefrLevel>();
        for (const row of rows) for (const step of row.levelPath) present.add(step.level);
        return CEFR_LEVELS.filter((l) => present.has(l));
    }, [rows]);

    const groups = useMemo(() => {
        const byClass = new Map<string, { key: string; label: string; rows: LevelResponsesGridStudentRow[] }>();
        for (const row of rows) {
            const key = row.classId ?? '';
            const group = byClass.get(key) ?? { key, label: row.className ?? '', rows: [] };
            group.rows.push(row);
            byClass.set(key, group);
        }
        return Array.from(byClass.values());
    }, [rows]);
    const showGroupHeaders = groups.length > 1 || (groups.length === 1 && groups[0].key !== '');

    const progressOf = (row: LevelResponsesGridStudentRow) => {
        const answered = row.questionsAnswered ?? row.levelPath.length;
        const total = row.finished ? answered : Math.max(maxQuestions ?? answered, answered);
        return { answered, total };
    };

    const finishedCount = rows.filter((r) => r.finished).length;

    const th: React.CSSProperties = {
        padding: '6px 8px',
        borderBottom: '1px solid var(--border)',
        whiteSpace: 'nowrap',
    };

    function renderBar(correct: number, attempted: number, key: string) {
        return (
            <td key={key} style={{ padding: '4px 8px', textAlign: 'center', minWidth: 54 }}>
                {attempted === 0 ? (
                    <div style={{ height: 14, borderRadius: 3, border: '1px solid var(--border)' }} />
                ) : (
                    <>
                        <div
                            title={t('tests.monitor.grid.level_accuracy', { correct, attempted })}
                            style={{
                                height: 14,
                                borderRadius: 3,
                                background: 'var(--red)',
                                overflow: 'hidden',
                            }}
                        >
                            <div
                                style={{
                                    height: '100%',
                                    width: `${(correct / attempted) * 100}%`,
                                    background: 'var(--green)',
                                }}
                            />
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {correct}/{attempted}
                        </div>
                    </>
                )}
            </td>
        );
    }

    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
                <thead>
                    <tr>
                        <th style={{ ...th, ...stickyLeft, textAlign: 'left', color: 'var(--text-muted)' }}>
                            {t('tests.monitor.grid.student')}
                        </th>
                        <th style={{ ...th, textAlign: 'center', color: 'var(--text-muted)' }}>
                            {t('tests.monitor.grid.estimated_level')}
                        </th>
                        {showProgress && (
                            <th style={{ ...th, textAlign: 'center', color: 'var(--text-muted)' }}>
                                {t('tests.monitor.grid.progress')}
                            </th>
                        )}
                        {levels.map((level) => (
                            <th key={level} style={{ ...th, textAlign: 'center', color: 'var(--accent-text)' }}>
                                {level}
                            </th>
                        ))}
                    </tr>
                    {showClassProgress && (
                        <tr style={{ background: 'var(--bg-elevated)' }} data-testid="class-progress-row">
                            <td style={{ ...stickyLeft, padding: '4px 8px', fontWeight: 700 }}>
                                {t('tests.monitor.grid.class_reached')}
                            </td>
                            <td style={{ padding: '4px 8px' }}>
                                <CompletionBar
                                    value={finishedCount}
                                    max={rows.length}
                                    text={t('tests.monitor.grid.progress_value', {
                                        answered: finishedCount,
                                        total: rows.length,
                                    })}
                                    label={t('tests.monitor.grid.class_finished_aria', {
                                        finished: finishedCount,
                                        total: rows.length,
                                    })}
                                />
                            </td>
                            {showProgress && <td />}
                            {levels.map((level) => {
                                const reached = rows.filter((r) => r.levelPath.some((s) => s.level === level)).length;
                                const percent = rows.length > 0 ? Math.round((reached / rows.length) * 100) : 0;
                                return (
                                    <td key={`cp-${level}`} style={{ padding: '4px 8px' }}>
                                        <CompletionBar
                                            value={reached}
                                            max={rows.length}
                                            text={`${percent}%`}
                                            label={t('tests.monitor.grid.class_reached_aria', {
                                                reached,
                                                total: rows.length,
                                                level,
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
                        return (
                            <React.Fragment key={group.key || '__ungrouped'}>
                                {showGroupHeaders && (
                                    <tr style={{ background: 'var(--bg-panel)' }}>
                                        <td
                                            colSpan={levels.length + (showProgress ? 3 : 2)}
                                            style={{ ...stickyLeft, background: 'var(--bg-panel)', padding: '4px 8px' }}
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
                                                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                                {group.label || t('tests.monitor.grid.no_class')}
                                            </button>
                                        </td>
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
                                            <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                                                {row.estimatedLevel ? (
                                                    <span className="badge badge-blue">{row.estimatedLevel}</span>
                                                ) : (
                                                    <span className="text-muted">—</span>
                                                )}
                                            </td>
                                            {showProgress &&
                                                (() => {
                                                    const p = progressOf(row);
                                                    return (
                                                        <td style={{ padding: '4px 8px' }}>
                                                            <CompletionBar
                                                                value={p.answered}
                                                                max={p.total}
                                                                text={t('tests.monitor.grid.progress_value', p)}
                                                                label={
                                                                    row.finished
                                                                        ? t(
                                                                              'tests.monitor.grid.progress_finished_aria',
                                                                              {
                                                                                  count: p.answered,
                                                                              }
                                                                          )
                                                                        : t(
                                                                              'tests.monitor.grid.progress_adaptive_aria',
                                                                              p
                                                                          )
                                                                }
                                                            />
                                                        </td>
                                                    );
                                                })()}
                                            {levels.map((level) => {
                                                const { correct, attempted } = levelStats(row.levelPath, level);
                                                return renderBar(correct, attempted, `${row.studentId}-${level}`);
                                            })}
                                        </tr>
                                    ))}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
