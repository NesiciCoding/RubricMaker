import React from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Unlink2 } from 'lucide-react';
import CardGrip from '../ui/CardGrip';
import type { ActivityRow, CellData, Class } from '../../types';
import { SCHOOL_YEAR_LABELS } from '../../data/schoolYears';
import './activityDashboard.css';

const SECTION_LABELS: Record<string, string> = {
    rubric: 'activityDashboard.section_rubrics',
    test: 'activityDashboard.section_tests',
    essay: 'activityDashboard.section_essays',
};

interface Props {
    activities: ActivityRow[];
    visibleClasses: Class[];
    matrix: Record<string, Record<string, CellData>>;
    compact: boolean;
    onCompactChange: (compact: boolean) => void;
    onToggleRubricLink: (classId: string, rubricId: string, linked: boolean) => void;
    onAssignRubric: (classId: string, rubricId: string) => void;
    onAssignEssay: (classId: string, teacherKey: string) => void;
    onOpenActivity: (activity: ActivityRow) => void;
    onDragEnd: (result: DropResult) => void;
}

function scoreClass(score: number | undefined): string {
    if (score === undefined) return '';
    if (score >= 80) return 'is-high';
    if (score < 50) return 'is-low';
    return '';
}

export default function ActivityDashboardGrid({
    activities,
    visibleClasses,
    matrix,
    compact,
    onCompactChange,
    onToggleRubricLink,
    onAssignRubric,
    onAssignEssay,
    onOpenActivity,
    onDragEnd,
}: Props) {
    const { t } = useTranslation();
    const kinds: Array<'rubric' | 'test' | 'essay'> = ['rubric', 'test', 'essay'];
    const cefrHelp = t('activityDashboard.cefr_help');

    return (
        <section className="card ad-grid-card" data-tour="ad-grid">
            <div className="ad-grid-head">
                <div>
                    <h2 className="ad-grid-title">{t('activityDashboard.grid_title')}</h2>
                    <p className="ad-grid-help">{t('activityDashboard.grid_help')}</p>
                </div>
                <div className="ad-density" role="group" aria-label={t('activityDashboard.density_label')}>
                    <button
                        type="button"
                        className={`ad-density-btn${compact ? '' : ' is-active'}`}
                        aria-pressed={!compact}
                        onClick={() => onCompactChange(false)}
                    >
                        {t('activityDashboard.comfortable')}
                    </button>
                    <button
                        type="button"
                        className={`ad-density-btn${compact ? ' is-active' : ''}`}
                        aria-pressed={compact}
                        onClick={() => onCompactChange(true)}
                    >
                        {t('activityDashboard.compact')}
                    </button>
                </div>
            </div>

            <div className="ad-legend" title={cefrHelp}>
                <span className="ad-legend-key">{t('activityDashboard.legend_counts')}</span>
                <span className="ad-legend-key">{t('activityDashboard.legend_score')}</span>
                <span className="ad-legend-key">
                    <span className="ad-cefr ad-cefr-b1">B1</span>
                    <span className="ad-cefr-sep">/</span>
                    <span className="ad-cefr ad-cefr-set">B1</span>
                    {t('activityDashboard.legend_cefr')}
                </span>
            </div>

            <div className="ad-table-wrap">
                <table className={`ad-table${compact ? ' is-compact' : ''}`}>
                    <thead>
                        <tr>
                            <th className="ad-activity-head" data-tour="ad-activity">
                                {t('activityDashboard.col_activity')}
                            </th>
                            {visibleClasses.map((cls, clsIndex) => (
                                <th
                                    key={cls.id}
                                    className="ad-class-head"
                                    data-tour={clsIndex === 0 ? 'ad-cell' : undefined}
                                >
                                    {cls.name}
                                    {(cls.year || cls.voTrack) && (
                                        <span className="ad-class-meta">
                                            {[cls.year && SCHOOL_YEAR_LABELS[cls.year], cls.voTrack?.toUpperCase()]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </span>
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <DragDropContext onDragEnd={onDragEnd}>
                        {kinds.map((kind) => {
                            const rows = activities.filter((activity) => activity.kind === kind);
                            if (rows.length === 0) return null;
                            return (
                                <Droppable droppableId={`ad-${kind}`} key={kind}>
                                    {(droppableProvided) => (
                                        <tbody ref={droppableProvided.innerRef} {...droppableProvided.droppableProps}>
                                            <tr>
                                                <td className="ad-group-row" colSpan={visibleClasses.length + 1}>
                                                    {t(SECTION_LABELS[kind])}
                                                </td>
                                            </tr>
                                            {rows.map((activity, idx) => (
                                                <Draggable
                                                    key={activity.id}
                                                    draggableId={`${kind}:${activity.id}`}
                                                    index={idx}
                                                >
                                                    {(dragProvided) => (
                                                        <tr
                                                            ref={dragProvided.innerRef}
                                                            {...dragProvided.draggableProps}
                                                            className="ad-activity-row"
                                                            style={dragProvided.draggableProps.style}
                                                        >
                                                            <td className="ad-activity-cell" title={activity.name}>
                                                                <div className="ad-activity-inner">
                                                                    <CardGrip
                                                                        {...dragProvided.dragHandleProps}
                                                                        label={t('rubricList.drag_to_reorder')}
                                                                        size={13}
                                                                        style={{ margin: '-5px 1px -5px -5px' }}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        className="ad-activity-name"
                                                                        onClick={() => onOpenActivity(activity)}
                                                                    >
                                                                        {activity.name}
                                                                    </button>
                                                                </div>
                                                            </td>

                                                            {visibleClasses.map((cls) => {
                                                                const cell =
                                                                    matrix[`${activity.kind}:${activity.id}`]?.[cls.id];
                                                                if (!cell) return <td key={cls.id} className="ad-td" />;
                                                                if (cell.totalStudents === 0) {
                                                                    return (
                                                                        <td key={cls.id} className="ad-td">
                                                                            <span
                                                                                className="ad-cell-empty"
                                                                                title={t(
                                                                                    'activityDashboard.no_students'
                                                                                )}
                                                                            >
                                                                                —
                                                                            </span>
                                                                        </td>
                                                                    );
                                                                }
                                                                if (activity.kind === 'rubric' && !cell.isLinked) {
                                                                    return (
                                                                        <td key={cls.id} className="ad-td">
                                                                            <div className="ad-unlinked">
                                                                                <span>
                                                                                    {t('activityDashboard.not_linked')}
                                                                                </span>
                                                                                <button
                                                                                    type="button"
                                                                                    className="btn btn-primary btn-sm ad-link-btn"
                                                                                    onClick={() =>
                                                                                        onToggleRubricLink(
                                                                                            cls.id,
                                                                                            activity.id,
                                                                                            false
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    {t('activityDashboard.link')}
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    );
                                                                }

                                                                const isRubric = activity.kind === 'rubric';
                                                                const isTest = activity.kind === 'test';
                                                                const gradedBase = isRubric
                                                                    ? cell.totalStudents
                                                                    : isTest
                                                                      ? cell.totalStudents
                                                                      : cell.submittedCount;
                                                                const countLabel = isRubric
                                                                    ? t('activityDashboard.graded_of_total', {
                                                                          graded: cell.gradedCount,
                                                                          total: cell.totalStudents,
                                                                      })
                                                                    : isTest
                                                                      ? t('activityDashboard.submitted_of_total', {
                                                                            submitted: cell.submittedCount,
                                                                            total: cell.totalStudents,
                                                                        })
                                                                      : t('activityDashboard.assigned_of_total', {
                                                                            assigned: cell.submittedCount,
                                                                            total: cell.totalStudents,
                                                                        });
                                                                const splitLabel = isTest
                                                                    ? t('activityDashboard.graded_of_total', {
                                                                          graded: cell.gradedCount,
                                                                          total: cell.totalStudents,
                                                                      })
                                                                    : t('activityDashboard.graded_of_assigned', {
                                                                          graded: cell.gradedCount,
                                                                          total: cell.submittedCount,
                                                                      });
                                                                const pct =
                                                                    gradedBase > 0
                                                                        ? Math.min(
                                                                              100,
                                                                              (cell.gradedCount / gradedBase) * 100
                                                                          )
                                                                        : 0;
                                                                const complete =
                                                                    gradedBase > 0 && cell.gradedCount >= gradedBase;
                                                                const score = cell.averageScore;

                                                                return (
                                                                    <td key={cls.id} className="ad-td">
                                                                        <div
                                                                            className={`ad-cell${complete ? ' is-complete' : ''}`}
                                                                        >
                                                                            <div className="ad-cell-top">
                                                                                <span
                                                                                    className="ad-count"
                                                                                    title={countLabel}
                                                                                >
                                                                                    {isRubric
                                                                                        ? `${cell.gradedCount}/${cell.totalStudents}`
                                                                                        : `${cell.submittedCount}/${cell.totalStudents}`}
                                                                                </span>
                                                                                <span
                                                                                    className={`ad-score ${scoreClass(score)}`}
                                                                                    title={
                                                                                        score === undefined
                                                                                            ? t(
                                                                                                  'activityDashboard.no_scores'
                                                                                              )
                                                                                            : t(
                                                                                                  'activityDashboard.average_score'
                                                                                              )
                                                                                    }
                                                                                >
                                                                                    {score === undefined
                                                                                        ? '—'
                                                                                        : `${Math.round(score)}%`}
                                                                                </span>
                                                                            </div>
                                                                            {!isRubric && (
                                                                                <div className="ad-split">
                                                                                    {splitLabel}
                                                                                </div>
                                                                            )}
                                                                            <div className="ad-progress">
                                                                                <span
                                                                                    className="ad-progress-fill"
                                                                                    style={{ width: `${pct}%` }}
                                                                                />
                                                                            </div>
                                                                            <div className="ad-cell-foot">
                                                                                <span
                                                                                    className="ad-cefr-pair"
                                                                                    title={cefrHelp}
                                                                                    aria-label={`${t(
                                                                                        'activityDashboard.most_common_cefr'
                                                                                    )}: ${
                                                                                        cell.mostCommonCefrLevel ?? '—'
                                                                                    }; ${t(
                                                                                        'activityDashboard.set_level'
                                                                                    )}: ${cell.setCefrLevel ?? '—'}`}
                                                                                >
                                                                                    <span
                                                                                        className={`ad-cefr${
                                                                                            cell.mostCommonCefrLevel
                                                                                                ? ` ad-cefr-${cell.mostCommonCefrLevel.toLowerCase()}`
                                                                                                : ''
                                                                                        }`}
                                                                                    >
                                                                                        {cell.mostCommonCefrLevel ??
                                                                                            '—'}
                                                                                    </span>
                                                                                    <span className="ad-cefr-sep">
                                                                                        /
                                                                                    </span>
                                                                                    <span
                                                                                        className={`ad-cefr ad-cefr-set${
                                                                                            cell.setCefrLevel
                                                                                                ? ` ad-cefr-${cell.setCefrLevel.toLowerCase()}`
                                                                                                : ''
                                                                                        }`}
                                                                                    >
                                                                                        {cell.setCefrLevel ?? '—'}
                                                                                    </span>
                                                                                </span>
                                                                                {isRubric && (
                                                                                    <button
                                                                                        type="button"
                                                                                        className="ad-icon-btn"
                                                                                        aria-label={t(
                                                                                            'activityDashboard.unlink'
                                                                                        )}
                                                                                        title={t(
                                                                                            'activityDashboard.unlink'
                                                                                        )}
                                                                                        onClick={() =>
                                                                                            onToggleRubricLink(
                                                                                                cls.id,
                                                                                                activity.id,
                                                                                                true
                                                                                            )
                                                                                        }
                                                                                    >
                                                                                        <Unlink2 size={12} />
                                                                                    </button>
                                                                                )}
                                                                            </div>

                                                                            <div className="ad-cell-actions">
                                                                                {isRubric &&
                                                                                    cell.gradedCount <
                                                                                        cell.totalStudents && (
                                                                                        <button
                                                                                            type="button"
                                                                                            className="ad-action-btn"
                                                                                            title={t(
                                                                                                'gradingTasks.assign_title'
                                                                                            )}
                                                                                            onClick={() =>
                                                                                                onAssignRubric(
                                                                                                    cls.id,
                                                                                                    activity.id
                                                                                                )
                                                                                            }
                                                                                        >
                                                                                            <ClipboardList size={11} />
                                                                                            {t(
                                                                                                'gradingTasks.assign_button'
                                                                                            )}
                                                                                        </button>
                                                                                    )}
                                                                                {isRubric &&
                                                                                    cell.gradedCount >=
                                                                                        cell.totalStudents && (
                                                                                        <button
                                                                                            type="button"
                                                                                            className="ad-action-btn is-quiet"
                                                                                            onClick={() =>
                                                                                                onOpenActivity(activity)
                                                                                            }
                                                                                        >
                                                                                            {t(
                                                                                                'activityDashboard.review'
                                                                                            )}
                                                                                        </button>
                                                                                    )}
                                                                                {isTest && (
                                                                                    <button
                                                                                        type="button"
                                                                                        className="ad-action-btn is-quiet"
                                                                                        onClick={() =>
                                                                                            onOpenActivity(activity)
                                                                                        }
                                                                                    >
                                                                                        {t('activityDashboard.open')}
                                                                                    </button>
                                                                                )}
                                                                                {activity.kind === 'essay' && (
                                                                                    <button
                                                                                        type="button"
                                                                                        className={`ad-action-btn${
                                                                                            cell.submittedCount >=
                                                                                            cell.totalStudents
                                                                                                ? ' is-quiet'
                                                                                                : ''
                                                                                        }`}
                                                                                        disabled={
                                                                                            cell.submittedCount >=
                                                                                            cell.totalStudents
                                                                                        }
                                                                                        onClick={() =>
                                                                                            onAssignEssay(
                                                                                                cls.id,
                                                                                                activity.id
                                                                                            )
                                                                                        }
                                                                                    >
                                                                                        {cell.submittedCount >=
                                                                                        cell.totalStudents
                                                                                            ? t(
                                                                                                  'activityDashboard.all_assigned'
                                                                                              )
                                                                                            : t(
                                                                                                  'activityDashboard.assign'
                                                                                              )}
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    )}
                                                </Draggable>
                                            ))}
                                            {droppableProvided.placeholder}
                                        </tbody>
                                    )}
                                </Droppable>
                            );
                        })}
                    </DragDropContext>
                </table>
            </div>
        </section>
    );
}
