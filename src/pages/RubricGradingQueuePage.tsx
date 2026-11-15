import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowLeft,
    ArrowRight,
    BarChart3,
    Download,
    FileText,
    LayoutGrid,
    List,
    Search,
    UserRoundCheck,
    UsersRound,
} from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { EmptyState } from '../components/ui/EmptyState';
import ClassFilterChips from '../components/ui/ClassFilterChips';
import SegmentedToggle from '../components/ui/SegmentedToggle';
import GroupGradeModal from '../components/Rubric/GroupGradeModal';
import GradingQueueCard from '../components/Rubric/GradingQueueCard';
import GradingQueueRow from '../components/Rubric/GradingQueueRow';
import { queueStatus, type QueueStudentStatus } from '../components/Rubric/gradingQueueStatus';
import { useAuthoring, useClasses, useGrading, useSettings, useStudents } from '../context/AppContext';
import { useRubricPool } from '../hooks/useMaterialPool';
import { calcGradeSummary, type GradeSummary } from '../utils/gradeCalc';
import { studentsForRubric } from '../utils/rubricRoster';

type QueueFilter = 'all' | QueueStudentStatus;

const chipStyle = (active: boolean): CSSProperties => ({
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: 6,
    padding: '5px 12px',
    borderRadius: 999,
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'var(--bg-raised)',
    color: active ? 'var(--accent-fg)' : 'var(--text-muted)',
    whiteSpace: 'nowrap',
});

/**
 * The rubric's grading queue: the roster the teacher grades from, with the rubric already in the
 * URL. Cards are the default; list is a denser alternative. Both are scoped by the queue's own
 * class filter (not the global class selector) so narrowing the queue never changes Students,
 * Statistics or Export behind the teacher's back.
 */
export default function RubricGradingQueuePage() {
    const { rubricId } = useParams<{ rubricId: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { students } = useStudents();
    const { classes } = useClasses();
    const { rubrics: ownRubrics, gradeScales = [] } = useAuthoring();
    const { studentRubrics, createGroupStudentRubrics, updateStudentGroup } = useGrading();
    const { settings, updateSettings } = useSettings();
    const { rubrics } = useRubricPool(ownRubrics);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<QueueFilter>('all');
    const [groupModalOpen, setGroupModalOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<{
        groupId: string;
        memberIds: string[];
        name: string;
    } | null>(null);

    const rubric = rubrics.find((r) => r.id === rubricId);

    const roster = useMemo(
        () => (rubricId ? studentsForRubric(rubricId, students, classes) : []),
        [rubricId, students, classes]
    );

    const gradeByStudent = useMemo(() => {
        const map = new Map<string, (typeof studentRubrics)[number]>();
        for (const sr of studentRubrics) {
            if (sr.rubricId === rubricId && !sr.isPeerReview) map.set(sr.studentId, sr);
        }
        return map;
    }, [studentRubrics, rubricId]);

    // Existing groups for this rubric, so a teacher can see (and rename or re-member) what was
    // already grouped instead of re-running the picker from memory.
    const groups = useMemo(() => {
        const byGroup = new Map<string, { groupId: string; name?: string; memberIds: string[] }>();
        for (const sr of gradeByStudent.values()) {
            if (!sr.groupId) continue;
            const entry = byGroup.get(sr.groupId) ?? {
                groupId: sr.groupId,
                name: sr.groupName,
                memberIds: [],
            };
            entry.memberIds.push(sr.studentId);
            if (sr.groupName) entry.name = sr.groupName;
            byGroup.set(sr.groupId, entry);
        }
        return [...byGroup.values()];
    }, [gradeByStudent]);

    const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
    const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

    // Only classes that actually appear in this rubric's roster: an empty chip would filter the
    // queue down to nothing.
    const classOptions = useMemo(() => {
        const used = new Set(roster.map((s) => s.classId).filter((id): id is string => Boolean(id)));
        return classes.filter((c) => used.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
    }, [roster, classes]);

    const effectiveClassId =
        settings.gradeQueueClassId && classOptions.some((c) => c.id === settings.gradeQueueClassId)
            ? settings.gradeQueueClassId
            : undefined;
    const scopeLabel =
        (effectiveClassId ? classById.get(effectiveClassId)?.name : undefined) ?? t('search.all_classes');

    const classCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const s of roster) {
            if (s.classId) counts[s.classId] = (counts[s.classId] ?? 0) + 1;
        }
        return counts;
    }, [roster]);

    const scopedRoster = useMemo(
        () => (effectiveClassId ? roster.filter((s) => s.classId === effectiveClassId) : roster),
        [roster, effectiveClassId]
    );

    const statusCounts = useMemo(() => {
        const counts: Record<QueueFilter, number> = {
            all: scopedRoster.length,
            graded: 0,
            ungraded: 0,
            notHandedIn: 0,
        };
        for (const s of scopedRoster) counts[queueStatus(gradeByStudent.get(s.id))] += 1;
        return counts;
    }, [scopedRoster, gradeByStudent]);

    const total = scopedRoster.length;
    const gradedCount = statusCounts.graded;
    const percentage = total > 0 ? Math.round((gradedCount / total) * 100) : 0;
    const remaining = total - gradedCount;
    const nextStudent = scopedRoster.find((s) => queueStatus(gradeByStudent.get(s.id)) !== 'graded');

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return scopedRoster.filter((s) => {
            if (statusFilter !== 'all' && queueStatus(gradeByStudent.get(s.id)) !== statusFilter) return false;
            return !q || s.name.toLowerCase().includes(q);
        });
    }, [scopedRoster, gradeByStudent, statusFilter, search]);

    const rubricGradeScale = useMemo(() => {
        if (!rubric) return null;
        const scaleId = rubric.gradeScaleId ?? settings.defaultGradeScaleId;
        return gradeScales.find((scale) => scale.id === scaleId) ?? gradeScales[0] ?? null;
    }, [rubric, gradeScales, settings.defaultGradeScaleId]);

    const summaryByStudent = useMemo(() => {
        const map = new Map<string, GradeSummary>();
        if (!rubric || !rubricGradeScale) return map;
        for (const [studentId, sr] of gradeByStudent) {
            if (queueStatus(sr) !== 'graded') continue;
            map.set(studentId, calcGradeSummary(sr, rubric.criteria, rubricGradeScale, rubric));
        }
        return map;
    }, [gradeByStudent, rubric, rubricGradeScale]);

    // Groups follow the class filter: a group with no members in this class would otherwise list
    // students the queue is not showing.
    const scopedGroups = useMemo(() => {
        if (!effectiveClassId) return groups;
        const scopedIds = new Set(scopedRoster.map((s) => s.id));
        return groups
            .map((group) => ({ ...group, memberIds: group.memberIds.filter((id) => scopedIds.has(id)) }))
            .filter((group) => group.memberIds.length > 0);
    }, [groups, effectiveClassId, scopedRoster]);

    const statusFor = (id: string) => queueStatus(gradeByStudent.get(id));
    const groupNameFor = (id: string) => {
        const sr = gradeByStudent.get(id);
        return sr?.groupId ? (sr.groupName ?? t('rubricQueue.in_group')) : undefined;
    };
    const classLabelFor = (id: string) => classById.get(id)?.name;

    const handleClassChange = (classId: string) => {
        updateSettings({ gradeQueueClassId: classId === 'all' ? undefined : classId });
        // A status filter carried into another class often shows an empty queue for no clear reason.
        setStatusFilter('all');
    };

    const clearFilters = () => {
        setSearch('');
        setStatusFilter('all');
    };

    if (!rubric) {
        return (
            <>
                <Topbar title={t('rubricQueue.not_found_title')} />
                <div className="page-content">
                    <EmptyState
                        icon={FileText}
                        title={t('rubricQueue.not_found_title')}
                        description={t('rubricQueue.not_found_hint')}
                        action={{
                            label: t('rubricQueue.back_to_rubrics'),
                            icon: ArrowLeft,
                            onClick: () => navigate('/rubrics'),
                        }}
                    />
                </div>
            </>
        );
    }

    const layout = settings.gradeQueueLayout ?? 'cards';
    const statusChips: { id: QueueFilter; label: string }[] = [
        { id: 'all', label: t('rubricQueue.status_all') },
        { id: 'graded', label: t('rubricQueue.graded') },
        { id: 'ungraded', label: t('rubricQueue.not_graded') },
        { id: 'notHandedIn', label: t('rubricQueue.not_handed_in') },
    ];

    return (
        <>
            <Topbar
                title={t('rubricQueue.title', { name: rubric.name })}
                actions={
                    <>
                        <Link
                            to={`/rubrics/${rubric.id}`}
                            className="btn btn-ghost btn-sm"
                            aria-label={t('rubricQueue.back_to_rubric')}
                            title={t('rubricQueue.back_to_rubric')}
                        >
                            <ArrowLeft size={15} />{' '}
                            <span className="queue-action-label">{t('rubricQueue.back_to_rubric')}</span>
                        </Link>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setGroupModalOpen(true)}
                            aria-label={t('rubricList.action_group_grade')}
                            title={t('rubricList.action_group_grade')}
                        >
                            <UsersRound size={15} />{' '}
                            <span className="queue-action-label">{t('rubricList.action_group_grade')}</span>
                        </button>
                        <Link
                            to={`/rubrics/${rubric.id}/peer-review`}
                            className="btn btn-secondary btn-sm"
                            aria-label={t('rubricList.action_peer_review')}
                            title={t('rubricList.action_peer_review')}
                        >
                            <UserRoundCheck size={15} />{' '}
                            <span className="queue-action-label">{t('rubricList.action_peer_review')}</span>
                        </Link>
                        <Link
                            to={`/statistics?rubric=${rubric.id}`}
                            className="btn btn-secondary btn-sm"
                            aria-label={t('rubricList.action_statistics')}
                            title={t('rubricList.action_statistics')}
                        >
                            <BarChart3 size={15} />{' '}
                            <span className="queue-action-label">{t('rubricList.action_statistics')}</span>
                        </Link>
                        <Link
                            to={`/export?rubric=${rubric.id}`}
                            className="btn btn-secondary btn-sm"
                            aria-label={t('rubricList.action_export')}
                            title={t('rubricList.action_export')}
                        >
                            <Download size={15} />{' '}
                            <span className="queue-action-label">{t('rubricList.action_export')}</span>
                        </Link>
                    </>
                }
            />
            <div className="page-content fade-in">
                <section
                    className="card"
                    aria-labelledby="queue-summary-title"
                    style={{ marginBottom: 16, padding: 24 }}
                >
                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 24,
                        }}
                    >
                        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                            <p
                                style={{
                                    margin: '0 0 4px',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                    color: 'var(--text-dim)',
                                }}
                            >
                                {t('rubricQueue.title_short')} · {scopeLabel}
                                {rubric.subject ? ` · ${rubric.subject}` : ''}
                            </p>
                            <h2
                                id="queue-summary-title"
                                style={{ margin: '0 0 10px', fontSize: '1.45rem', fontWeight: 700 }}
                            >
                                {t('rubricQueue.summary_title', { graded: gradedCount, total })}
                            </h2>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                                <span className="badge badge-blue">
                                    {t('rubricList.criteria_badge', { count: rubric.criteria.length })}
                                </span>
                            </div>
                            {total > 0 && (
                                <div
                                    style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        alignItems: 'center',
                                        gap: 10,
                                        marginTop: 16,
                                    }}
                                >
                                    {nextStudent ? (
                                        <>
                                            <Link
                                                to={`/rubrics/${rubric.id}/grade/${nextStudent.id}`}
                                                className="btn btn-primary"
                                            >
                                                {t('rubricQueue.grade_next', { name: nextStudent.name })}
                                                <ArrowRight size={16} />
                                            </Link>
                                            <span className="text-muted text-sm">
                                                {t('rubricQueue.remaining_hint', { count: remaining })}
                                            </span>
                                        </>
                                    ) : (
                                        <button type="button" className="btn btn-primary" disabled>
                                            {t('rubricQueue.all_graded')}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        <div
                            className="grading-queue-ring"
                            role="img"
                            aria-label={t('rubricQueue.summary_title', { graded: gradedCount, total })}
                            style={{
                                width: 142,
                                height: 142,
                                flexShrink: 0,
                                borderRadius: '50%',
                                background: `conic-gradient(from -90deg, var(--accent) ${percentage}%, var(--bg-elevated) 0)`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <div
                                style={{
                                    width: 116,
                                    height: 116,
                                    borderRadius: '50%',
                                    background: 'var(--bg-card)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 2,
                                }}
                            >
                                <span style={{ fontSize: '1.65rem', fontWeight: 700, lineHeight: 1 }}>
                                    {percentage}%
                                </span>
                                <span className="text-muted text-xs">{t('rubricQueue.graded')}</span>
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 28,
                            marginTop: 20,
                            paddingTop: 16,
                            borderTop: '1px solid var(--border)',
                        }}
                    >
                        {[
                            { label: t('rubricQueue.graded'), value: gradedCount },
                            { label: t('rubricQueue.not_graded'), value: statusCounts.ungraded },
                            { label: t('rubricQueue.not_handed_in'), value: statusCounts.notHandedIn },
                        ].map((stat) => (
                            <div key={stat.label}>
                                <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{stat.value}</div>
                                <div className="text-muted text-xs">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {scopedGroups.length > 0 && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h2 style={{ margin: '0 0 10px', fontSize: '0.95rem', fontWeight: 700 }}>
                            {t('rubricQueue.groups_title')}
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {scopedGroups.map((group) => {
                                const members = group.memberIds
                                    .map((id) => studentById.get(id)?.name)
                                    .filter((name): name is string => Boolean(name));
                                return (
                                    <div
                                        key={group.groupId}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            flexWrap: 'wrap',
                                        }}
                                    >
                                        <span style={{ fontWeight: 600 }}>
                                            {group.name || t('rubricQueue.group_unnamed')}
                                        </span>
                                        <span className="text-muted text-sm" style={{ flex: 1, minWidth: 160 }}>
                                            {members.join(', ')}
                                        </span>
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() =>
                                                setEditingGroup({
                                                    groupId: group.groupId,
                                                    memberIds: group.memberIds,
                                                    name: group.name ?? '',
                                                })
                                            }
                                        >
                                            {t('rubricQueue.group_edit')}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 12,
                        marginBottom: 12,
                    }}
                >
                    <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                        <ClassFilterChips
                            classes={classOptions}
                            selectedClassId={effectiveClassId ?? 'all'}
                            onChange={handleClassChange}
                            ariaLabel={t('rubricQueue.filter_class')}
                            allLabel={t('search.all_classes')}
                            allValue="all"
                            counts={classCounts}
                            allCount={roster.length}
                        />
                    </div>
                    <SegmentedToggle
                        ariaLabel={t('common.view')}
                        value={layout}
                        onChange={(value) => updateSettings({ gradeQueueLayout: value })}
                        options={[
                            { value: 'cards', label: t('common.view_cards'), icon: <LayoutGrid size={14} /> },
                            { value: 'list', label: t('common.view_list'), icon: <List size={14} /> },
                        ]}
                        size="sm"
                    />
                </div>

                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 10,
                        marginBottom: 16,
                    }}
                >
                    <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 360 }}>
                        <Search
                            size={15}
                            aria-hidden="true"
                            style={{
                                position: 'absolute',
                                left: 12,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: 'var(--text-dim)',
                            }}
                        />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('rubricQueue.search')}
                            aria-label={t('rubricQueue.search')}
                            style={{ paddingLeft: 36, width: '100%' }}
                        />
                    </div>
                    <div
                        role="group"
                        aria-label={t('rubricQueue.filter_status')}
                        style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
                    >
                        {statusChips.map((chip) => (
                            <button
                                key={chip.id}
                                type="button"
                                aria-pressed={statusFilter === chip.id}
                                onClick={() => setStatusFilter(chip.id)}
                                style={chipStyle(statusFilter === chip.id)}
                            >
                                {chip.label}
                                <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>{statusCounts[chip.id]}</span>
                            </button>
                        ))}
                    </div>
                    <span className="text-muted text-sm" role="status" style={{ marginLeft: 'auto' }}>
                        {t('rubricQueue.showing_count', { shown: visible.length, total })}
                    </span>
                </div>

                {roster.length === 0 ? (
                    <EmptyState
                        icon={FileText}
                        title={t('rubricQueue.no_students')}
                        description={t('rubricQueue.no_students_hint')}
                    />
                ) : visible.length === 0 ? (
                    <EmptyState
                        icon={Search}
                        title={t('rubricQueue.no_matches')}
                        description={t('rubricQueue.no_matches_hint')}
                        action={{ label: t('rubricQueue.clear_filters'), onClick: clearFilters }}
                    />
                ) : layout === 'list' ? (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th scope="col">{t('rubricQueue.col_student')}</th>
                                    <th scope="col" className="queue-col-class">
                                        {t('rubricQueue.col_class')}
                                    </th>
                                    <th scope="col">{t('rubricQueue.col_status')}</th>
                                    <th scope="col" className="queue-col-score">
                                        {t('rubricQueue.col_score')}
                                    </th>
                                    <th scope="col">{t('common.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((s) => (
                                    <GradingQueueRow
                                        key={s.id}
                                        student={s}
                                        classLabel={classLabelFor(s.classId ?? '')}
                                        groupName={groupNameFor(s.id)}
                                        status={statusFor(s.id)}
                                        summary={summaryByStudent.get(s.id)}
                                        href={`/rubrics/${rubric.id}/grade/${s.id}`}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
                            gap: 14,
                        }}
                    >
                        {visible.map((s) => (
                            <GradingQueueCard
                                key={s.id}
                                student={s}
                                classLabel={classLabelFor(s.classId ?? '')}
                                groupName={groupNameFor(s.id)}
                                status={statusFor(s.id)}
                                summary={summaryByStudent.get(s.id)}
                                href={`/rubrics/${rubric.id}/grade/${s.id}`}
                            />
                        ))}
                    </div>
                )}
            </div>

            {groupModalOpen && (
                <GroupGradeModal
                    rubric={rubric}
                    students={scopedRoster}
                    classes={classes}
                    studentRubrics={studentRubrics}
                    showClassNames={!effectiveClassId}
                    onClose={() => setGroupModalOpen(false)}
                    onStart={(studentIds, groupName) => {
                        const srs = createGroupStudentRubrics(
                            rubric.id,
                            studentIds,
                            groupName.trim() || undefined,
                            rubric.criteria
                        );
                        setGroupModalOpen(false);
                        if (srs[0]) navigate(`/rubrics/${rubric.id}/grade/${srs[0].studentId}`);
                    }}
                />
            )}

            {editingGroup && (
                <GroupGradeModal
                    rubric={rubric}
                    students={scopedRoster}
                    classes={classes}
                    studentRubrics={studentRubrics}
                    showClassNames={!effectiveClassId}
                    initialStudentIds={editingGroup.memberIds}
                    initialName={editingGroup.name}
                    mode="edit"
                    onClose={() => setEditingGroup(null)}
                    onStart={(studentIds, groupName) => {
                        updateStudentGroup(editingGroup.groupId, studentIds, groupName);
                        setEditingGroup(null);
                    }}
                />
            )}
        </>
    );
}
