import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CEFR_LEVELS } from '../../data/cefrDescriptors';
import type { CefrLevel, StaircaseStep } from '../../types';

export interface LevelResponsesGridStudentRow {
    studentId: string;
    displayName: string;
    className?: string;
    /** Adaptive trace — one step per question asked, each tagged with the CEFR level it probed. */
    levelPath: StaircaseStep[];
    /** Provisional CEFR estimate for the TOTALS column. */
    estimatedLevel?: CefrLevel;
}

export interface LevelResponsesGridProps {
    rows: LevelResponsesGridStudentRow[];
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
export default function LevelResponsesGrid({ rows }: LevelResponsesGridProps) {
    const { t } = useTranslation();
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const levels = useMemo(() => {
        const present = new Set<CefrLevel>();
        for (const row of rows) for (const step of row.levelPath) present.add(step.level);
        return CEFR_LEVELS.filter((l) => present.has(l));
    }, [rows]);

    const groups = useMemo(() => {
        const byClass = new Map<string, LevelResponsesGridStudentRow[]>();
        for (const row of rows) {
            const key = row.className ?? '';
            (byClass.get(key) ?? byClass.set(key, []).get(key)!).push(row);
        }
        return Array.from(byClass.entries()).map(([label, groupRows]) => ({ label, rows: groupRows }));
    }, [rows]);
    const showGroupHeaders = groups.length > 1 || (groups.length === 1 && groups[0].label !== '');

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
                        {levels.map((level) => (
                            <th key={level} style={{ ...th, textAlign: 'center', color: 'var(--accent)' }}>
                                {level}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {groups.map((group) => {
                        const isCollapsed = collapsed.has(group.label);
                        return (
                            <React.Fragment key={group.label || '__ungrouped'}>
                                {showGroupHeaders && (
                                    <tr style={{ background: 'var(--bg-panel)' }}>
                                        <td
                                            colSpan={levels.length + 2}
                                            style={{ ...stickyLeft, background: 'var(--bg-panel)', padding: '4px 8px' }}
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
