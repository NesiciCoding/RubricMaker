import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, ListChecks, Search, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { EmptyState } from '../components/ui/EmptyState';
import SegmentedToggle from '../components/ui/SegmentedToggle';
import { SkeletonRow } from '../components/ui/Skeleton';
import { useSettings } from '../context/AppContext';
import { useStoreSelector } from '../context/useStore';
import { useOwnOrSharedItem } from '../hooks/useSharedMaterials';
import { calcGradeSummary, type GradeSummary } from '../utils/gradeCalc';
import type { GradeScale, Student, StudentRubric } from '../types';

type Filter = 'all' | 'ungraded';

interface QueueRow {
    student: Student;
    grade: StudentRubric | undefined;
    summary: GradeSummary | undefined;
}

/**
 * Rubric-first grading entry point: `/rubrics/:rubricId/grade`.
 *
 * The rubric card's “Grade students” button used to drop the teacher on `/students`, where they had
 * to pick a student and then pick the same rubric again from the student's grade menu. The rubric
 * is already known here, so this page shows that rubric's classes with each student's progress and
 * goes straight into `/rubrics/:rubricId/grade/:studentId`.
 */
export default function RubricGradingQueuePage() {
    const { rubricId } = useParams<{ rubricId: string }>();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { settings } = useSettings();
    const {
        students: allStudents,
        studentRubrics: allStudentRubrics,
        classes,
        rubrics,
        gradeScales,
    } = useStoreSelector((s) => ({
        students: s.students,
        studentRubrics: s.studentRubrics,
        classes: s.classes,
        rubrics: s.rubrics,
        gradeScales: s.gradeScales,
    }));
    const { item: rubric, loading: rubricLoading } = useOwnOrSharedItem(
        'rubric',
        rubricId,
        rubrics.find((r) => r.id === rubricId)
    );

    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<Filter>('all');

    // Same scoping as GradeStudent's "next student" walk: the classes this rubric is linked to.
    // With no linked class, fall back to the class the teacher is currently filtering by, then to
    // the whole roster — a sprawling school-wide list would be useless as a starting point.
    const rows: QueueRow[] = useMemo(() => {
        if (!rubric) return [];
        const linkedClassIds = classes.filter((c) => c.rubricIds?.includes(rubric.id)).map((c) => c.id);
        let eligible = allStudents.filter((s) => !s.archivedAt);
        if (linkedClassIds.length > 0) {
            eligible = eligible.filter((s) => linkedClassIds.includes(s.classId));
        } else if (settings.activeClassId) {
            eligible = eligible.filter((s) => s.classId === settings.activeClassId);
        }
        const gradeScale = resolveScale(rubric.gradeScaleId, gradeScales, settings.defaultGradeScaleId);
        return [...eligible]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((student) => {
                const grade = allStudentRubrics.find(
                    (sr) => sr.rubricId === rubric.id && sr.studentId === student.id && !sr.deletedAt
                );
                return {
                    student,
                    grade,
                    summary: grade ? calcGradeSummary(grade, rubric.criteria, gradeScale, rubric) : undefined,
                };
            });
    }, [
        rubric,
        classes,
        allStudents,
        allStudentRubrics,
        gradeScales,
        settings.activeClassId,
        settings.defaultGradeScaleId,
    ]);

    const visibleRows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return rows.filter((row) => {
            if (filter === 'ungraded' && row.grade) return false;
            if (!needle) return true;
            const className = classes.find((c) => c.id === row.student.classId)?.name ?? '';
            return row.student.name.toLowerCase().includes(needle) || className.toLowerCase().includes(needle);
        });
    }, [rows, search, filter, classes]);

    const gradedCount = rows.filter((row) => row.grade).length;
    const firstUngraded = rows.find((row) => !row.grade);
    const showClassColumn = new Set(rows.map((row) => row.student.classId)).size > 1;

    function openStudent(studentId: string) {
        navigate(`/rubrics/${rubricId}/grade/${studentId}`);
    }

    if (!rubric && rubricLoading) {
        return (
            <>
                <Topbar title={t('gradingQueue.title')} />
                <div className="page-content fade-in" aria-busy="true">
                    <SkeletonRow />
                    <SkeletonRow />
                </div>
            </>
        );
    }

    if (!rubric) {
        return (
            <>
                <Topbar title={t('gradingQueue.title')} />
                <div className="page-content">
                    <EmptyState
                        icon={ListChecks}
                        title={t('gradingQueue.not_found')}
                        titleLevel={2}
                        description={t('gradingQueue.not_found_desc')}
                        action={{
                            label: t('gradingQueue.back_to_rubrics'),
                            icon: ArrowLeft,
                            onClick: () => navigate('/rubrics'),
                        }}
                    />
                </div>
            </>
        );
    }

    const progressPct = rows.length ? (gradedCount / rows.length) * 100 : 0;

    return (
        <>
            <Topbar
                title={t('gradingQueue.title_with_name', { name: rubric.name })}
                actions={
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/rubrics/${rubric.id}`)}>
                        <ArrowLeft size={15} /> {t('gradingQueue.back_to_rubric')}
                    </button>
                }
            />
            <div className="page-content fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {rows.length === 0 ? (
                    <EmptyState
                        icon={Users}
                        title={t('gradingQueue.empty_title')}
                        titleLevel={2}
                        description={t('gradingQueue.empty_desc')}
                        action={{
                            label: t('gradingQueue.back_to_rubric'),
                            icon: ArrowLeft,
                            onClick: () => navigate(`/rubrics/${rubric.id}`),
                        }}
                    />
                ) : (
                    <>
                        <div
                            className="card"
                            style={{
                                display: 'flex',
                                gap: 16,
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                padding: 16,
                            }}
                        >
                            <div style={{ flex: '1 1 220px', minWidth: 200 }}>
                                <div className="text-muted text-xs">{t('gradingQueue.progress_label')}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                                        {t('gradingQueue.progress', { graded: gradedCount, total: rows.length })}
                                    </span>
                                    <div
                                        role="progressbar"
                                        aria-valuemin={0}
                                        aria-valuemax={rows.length}
                                        aria-valuenow={gradedCount}
                                        aria-label={t('gradingQueue.progress_label')}
                                        style={{
                                            flex: 1,
                                            height: 8,
                                            minWidth: 90,
                                            borderRadius: 4,
                                            background: 'var(--border)',
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: `${progressPct}%`,
                                                height: '100%',
                                                borderRadius: 4,
                                                background: 'var(--accent)',
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                            {firstUngraded ? (
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => openStudent(firstUngraded.student.id)}
                                >
                                    <ChevronRight size={15} />
                                    {t('gradingQueue.continue_cta', { name: firstUngraded.student.name })}
                                </button>
                            ) : (
                                <span className="badge badge-green">{t('gradingQueue.all_graded')}</span>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                            <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 360 }}>
                                <Search
                                    size={15}
                                    style={{
                                        position: 'absolute',
                                        left: 12,
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        color: 'var(--text-dim)',
                                    }}
                                />
                                <input
                                    type="text"
                                    placeholder={t('gradingQueue.search_placeholder')}
                                    aria-label={t('gradingQueue.search_placeholder')}
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    style={{ paddingLeft: 36, width: '100%' }}
                                />
                            </div>
                            <SegmentedToggle
                                ariaLabel={t('gradingQueue.filter_label')}
                                value={filter}
                                onChange={(value) => setFilter(value as Filter)}
                                options={[
                                    { value: 'all', label: t('gradingQueue.filter_all') },
                                    { value: 'ungraded', label: t('gradingQueue.filter_ungraded') },
                                ]}
                            />
                        </div>

                        {visibleRows.length === 0 ? (
                            <EmptyState
                                icon={Search}
                                title={t('gradingQueue.no_matches')}
                                titleLevel={2}
                                description=""
                            />
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>{t('gradingQueue.col_student')}</th>
                                            {showClassColumn && <th>{t('gradingQueue.col_class')}</th>}
                                            <th>{t('gradingQueue.col_status')}</th>
                                            <th>{t('common.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleRows.map(({ student, grade, summary }) => {
                                            const className =
                                                classes.find((c) => c.id === student.classId)?.name ?? '—';
                                            return (
                                                <tr
                                                    key={student.id}
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={() => openStudent(student.id)}
                                                >
                                                    <td style={{ fontWeight: 500 }}>{student.name}</td>
                                                    {showClassColumn && (
                                                        <td className="text-muted text-sm">{className}</td>
                                                    )}
                                                    <td>
                                                        {grade?.notHandedIn ? (
                                                            <span className="badge badge-yellow">
                                                                {t('gradingQueue.status_not_handed_in')}
                                                            </span>
                                                        ) : grade && summary ? (
                                                            <span className="badge badge-green">
                                                                {t('gradingQueue.status_graded', {
                                                                    letter: summary.letterGrade,
                                                                    percentage: Math.round(summary.modifiedPercentage),
                                                                })}
                                                            </span>
                                                        ) : (
                                                            <span className="badge">
                                                                {t('gradingQueue.status_not_graded')}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            type="button"
                                                            className={`btn btn-sm ${grade ? 'btn-secondary' : 'btn-primary'}`}
                                                            onClick={() => openStudent(student.id)}
                                                        >
                                                            {/* The visible label stays first so WCAG 2.5.3
                                                                (label in name) holds; the student's name is
                                                                announced from visually hidden text. */}
                                                            {grade
                                                                ? t('gradingQueue.open_again')
                                                                : t('gradingQueue.open')}
                                                            <span className="sr-only"> · {student.name}</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    );
}

function resolveScale(
    gradeScaleId: string | undefined,
    scales: GradeScale[],
    defaultGradeScaleId: string | undefined
): GradeScale | null {
    const id = gradeScaleId ?? defaultGradeScaleId;
    if (!id || id === 'none') return null;
    return scales.find((s) => s.id === id) ?? scales[0] ?? null;
}
