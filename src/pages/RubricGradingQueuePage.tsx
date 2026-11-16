import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowLeft,
    ArrowRight,
    BarChart3,
    CheckSquare,
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
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { queueProgress } from '../components/Rubric/gradingQueueStatus';
import { useAuthoring, useClasses, useGrading, useSettings, useStudents } from '../context/AppContext';
import { gradeLinkSearch, useGradingQueueView } from '../hooks/useGradingQueueView';
import { useConfirm } from '../hooks/useConfirm';
import { useToast } from '../hooks/useToast';
import { calcGradeSummary, type GradeSummary } from '../utils/gradeCalc';
import { pickNextStudent, type QueueStatusFilter } from '../utils/gradingQueue';
import { clearNotHandedIn, hasAnyScore, markNotHandedIn } from '../utils/notHandedIn';
import { nanoid } from '../utils/nanoid';
import type { ScoreEntry, StudentRubric } from '../types';

type QueueFilter = QueueStatusFilter;

const scrollKey = (rubricId: string, query: string) => `rm_queue_scroll:${rubricId}:${query}`;

function readScroll(key: string): { top: number; focus?: string } | null {
    try {
        const raw = sessionStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function writeScroll(key: string, value: { top: number; focus?: string }) {
    try {
        sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* a private window or full quota only loses scroll restoration */
    }
}

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
    const { gradeScales = [] } = useAuthoring();
    const { studentRubrics, createGroupStudentRubrics, updateStudentGroup, saveStudentRubric } = useGrading();
    const { settings, updateSettings } = useSettings();
    const { showToast } = useToast();
    const { confirm, dialogProps: confirmProps } = useConfirm();
    const { rubric, roster, gradeByStudent, classOptions, filters, view, filterQuery, setFilters } =
        useGradingQueueView(rubricId);
    const { search, status: statusFilter, groupId, classId: effectiveClassId } = filters;
    const { scopedRoster, scopedGroups, chipBase, visible, statusOf } = view;

    const [groupModalOpen, setGroupModalOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<{
        groupId: string;
        memberIds: string[];
        name: string;
    } | null>(null);
    const [selecting, setSelecting] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
    const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
    const scopeLabel =
        (effectiveClassId ? classById.get(effectiveClassId)?.name : undefined) ?? t('search.all_classes');

    const classCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const s of roster) {
            if (s.classId) counts[s.classId] = (counts[s.classId] ?? 0) + 1;
        }
        return counts;
    }, [roster]);

    const totalCriteria = rubric?.criteria.length ?? 0;
    const summaryCounts = useMemo(() => {
        const counts: Record<QueueFilter, number> = {
            all: scopedRoster.length,
            graded: 0,
            inProgress: 0,
            ungraded: 0,
            notHandedIn: 0,
        };
        for (const s of scopedRoster) counts[statusOf(s.id)] += 1;
        return counts;
    }, [scopedRoster, statusOf]);
    const chipCounts = useMemo(() => {
        const counts: Record<QueueFilter, number> = {
            all: chipBase.length,
            graded: 0,
            inProgress: 0,
            ungraded: 0,
            notHandedIn: 0,
        };
        for (const s of chipBase) counts[statusOf(s.id)] += 1;
        return counts;
    }, [chipBase, statusOf]);

    const total = scopedRoster.length;
    const gradedCount = summaryCounts.graded;
    const percentage = total > 0 ? Math.round((gradedCount / total) * 100) : 0;
    const remaining = total - gradedCount;
    const next = pickNextStudent(visible, null, statusOf);
    const nextStudent = next?.student;

    const rubricGradeScale = useMemo(() => {
        if (!rubric) return null;
        const scaleId = rubric.gradeScaleId ?? settings.defaultGradeScaleId;
        return gradeScales.find((scale) => scale.id === scaleId) ?? gradeScales[0] ?? null;
    }, [rubric, gradeScales, settings.defaultGradeScaleId]);

    const summaryByStudent = useMemo(() => {
        const map = new Map<string, GradeSummary>();
        if (!rubric || !rubricGradeScale) return map;
        for (const [studentId, sr] of gradeByStudent) {
            if (statusOf(studentId) !== 'graded') continue;
            map.set(studentId, calcGradeSummary(sr, rubric.criteria, rubricGradeScale, rubric));
        }
        return map;
    }, [gradeByStudent, rubric, rubricGradeScale, statusOf]);

    const groupProgress = (memberIds: string[]) => ({
        graded: memberIds.filter((id) => statusOf(id) === 'graded').length,
        members: memberIds.length,
    });

    const statusFor = (id: string) => statusOf(id);
    const progressFor = (id: string) =>
        statusOf(id) === 'inProgress' ? queueProgress(gradeByStudent.get(id), totalCriteria) : undefined;
    const groupNameFor = (id: string) => {
        const sr = gradeByStudent.get(id);
        return sr?.groupId ? (sr.groupName ?? t('rubricQueue.in_group')) : undefined;
    };
    const classLabelFor = (id: string) => classById.get(id)?.name;
    const query = filterQuery();
    const hrefFor = (studentId: string) =>
        `/rubrics/${rubric?.id ?? rubricId}/grade/${studentId}${gradeLinkSearch(query)}`;

    // A selection from one view must never carry into another: the filters decide who is visible,
    // and a bulk write only ever touches visible students.
    useEffect(() => {
        setSelected(new Set());
    }, [query]);

    const visibleIds = useMemo(() => new Set(visible.map((s) => s.id)), [visible]);
    const selectedVisible = useMemo(() => [...selected].filter((id) => visibleIds.has(id)), [selected, visibleIds]);
    const allVisibleSelected = visible.length > 0 && selectedVisible.length === visible.length;
    const toggleSelected = (id: string) =>
        setSelected((prev) => {
            const nextSet = new Set(prev);
            if (nextSet.has(id)) nextSet.delete(id);
            else nextSet.add(id);
            return nextSet;
        });
    const stopSelecting = () => {
        setSelecting(false);
        setSelected(new Set());
    };

    // Restore scroll and focus when coming back from grading to the same view (#1179).
    const scrollRef = useRef<HTMLDivElement>(null);
    const stateKey = scrollKey(rubricId ?? '', query);
    useLayoutEffect(() => {
        const saved = readScroll(stateKey);
        if (!saved) return;
        const container = scrollRef.current?.closest('.page-content') as HTMLElement | null;
        if (container) container.scrollTop = saved.top;
        if (saved.focus) {
            document
                .querySelector<HTMLElement>(`[data-queue-student="${CSS.escape(saved.focus)}"] a`)
                ?.focus({ preventScroll: true });
        }
    }, [stateKey, visible.length]);
    const rememberPosition = (studentId: string) => {
        const container = scrollRef.current?.closest('.page-content') as HTMLElement | null;
        writeScroll(stateKey, { top: container?.scrollTop ?? 0, focus: studentId });
    };

    const bulkWrite = async (direction: 'mark' | 'restore') => {
        if (!rubric) return;
        const targets = selectedVisible
            .map((id) => ({ id, sr: gradeByStudent.get(id) }))
            .filter(({ sr }) => (direction === 'mark' ? !sr?.notHandedIn : !!sr?.notHandedIn));
        if (targets.length === 0) return;
        if (direction === 'mark') {
            const ok = await confirm({
                title: t('rubricQueue.bulk_nhi_confirm_title'),
                message: t('rubricQueue.bulk_nhi_confirm_message', { count: targets.length }),
                confirmLabel: t('rubricQueue.bulk_mark_nhi'),
                cancelLabel: t('common.cancel'),
                danger: true,
            });
            if (!ok) return;
        }
        const canned = t('gradeStudent.not_handed_in_comment');
        const now = new Date().toISOString();
        for (const { id, sr } of targets) {
            if (direction === 'mark') {
                const base: StudentRubric =
                    sr ??
                    ({
                        id: nanoid(),
                        rubricId: rubric.id,
                        studentId: id,
                        entries: rubric.criteria.map((c): ScoreEntry => ({
                            criterionId: c.id,
                            levelId: null,
                            comment: '',
                            checkedSubItems: [],
                        })),
                        overallComment: '',
                        isPeerReview: false,
                        rubricSnapshot: structuredClone(rubric),
                        gradeScaleSnapshot: rubricGradeScale ? structuredClone(rubricGradeScale) : undefined,
                    } satisfies StudentRubric);
                // Keep the original grade date: it drives "Date graded", period reports and recent activity.
                saveStudentRubric({ ...markNotHandedIn(base, canned), gradedAt: base.gradedAt ?? now });
            } else if (sr) {
                const cleared = clearNotHandedIn(sr, canned);
                // A record that only existed to carry the mark goes back to untouched, not "in progress".
                saveStudentRubric(hasAnyScore(cleared) ? cleared : { ...cleared, gradedAt: undefined });
            }
        }
        showToast(
            t(direction === 'mark' ? 'rubricQueue.bulk_nhi_done' : 'rubricQueue.bulk_restore_done', {
                count: targets.length,
            }),
            'success'
        );
        stopSelecting();
    };

    const handleClassChange = (classId: string) => {
        updateSettings({ gradeQueueClassId: classId === 'all' ? undefined : classId });
        // A status or group filter carried into another class often shows an empty queue for no clear reason.
        setFilters({ classId: classId === 'all' ? undefined : classId, status: 'all', groupId: undefined });
    };

    const clearFilters = () => setFilters({ search: '', status: 'all', groupId: undefined });

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
        { id: 'inProgress', label: t('rubricQueue.in_progress') },
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
                <div ref={scrollRef} />
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
                                                to={hrefFor(nextStudent.id)}
                                                className="btn btn-primary"
                                                onClick={() => rememberPosition(nextStudent.id)}
                                            >
                                                {t('rubricQueue.grade_next', { name: nextStudent.name })}
                                                <ArrowRight size={16} />
                                            </Link>
                                            <span className="text-muted text-sm">
                                                {next?.reason === 'notHandedIn'
                                                    ? t('rubricQueue.next_not_handed_in_hint')
                                                    : t('rubricQueue.remaining_hint', { count: remaining })}
                                            </span>
                                        </>
                                    ) : (
                                        <button type="button" className="btn btn-primary" disabled>
                                            {visible.length === 0 && total > 0
                                                ? t('rubricQueue.no_next_in_view')
                                                : t('rubricQueue.all_graded')}
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
                            { label: t('rubricQueue.in_progress'), value: summaryCounts.inProgress },
                            { label: t('rubricQueue.not_graded'), value: summaryCounts.ungraded },
                            { label: t('rubricQueue.not_handed_in'), value: summaryCounts.notHandedIn },
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
                                        <span className="badge badge-blue">
                                            {t('rubricQueue.group_progress', groupProgress(group.memberIds))}
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
                            onChange={(e) => setFilters({ search: e.target.value })}
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
                                onClick={() => setFilters({ status: chip.id })}
                                style={chipStyle(statusFilter === chip.id)}
                            >
                                {chip.label}
                                <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>{chipCounts[chip.id]}</span>
                            </button>
                        ))}
                    </div>
                    <span className="text-muted text-sm" role="status" style={{ marginLeft: 'auto' }}>
                        {t('rubricQueue.showing_count', { shown: visible.length, total })}
                    </span>
                    {roster.length > 0 && (
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            aria-pressed={selecting}
                            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
                        >
                            <CheckSquare size={14} /> {t('rubricQueue.select_mode')}
                        </button>
                    )}
                </div>

                {scopedGroups.length > 0 && (
                    <div
                        role="group"
                        aria-label={t('rubricQueue.filter_group')}
                        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}
                    >
                        <button
                            type="button"
                            aria-pressed={!groupId}
                            onClick={() => setFilters({ groupId: undefined })}
                            style={chipStyle(!groupId)}
                        >
                            {t('rubricQueue.group_all')}
                        </button>
                        {scopedGroups.map((group) => {
                            const progress = groupProgress(group.memberIds);
                            return (
                                <button
                                    key={group.groupId}
                                    type="button"
                                    aria-pressed={groupId === group.groupId}
                                    onClick={() =>
                                        setFilters({ groupId: groupId === group.groupId ? undefined : group.groupId })
                                    }
                                    style={chipStyle(groupId === group.groupId)}
                                >
                                    {group.name || t('rubricQueue.group_unnamed')}
                                    <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>
                                        {t('rubricQueue.group_progress', progress)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {selecting && (
                    <div
                        role="region"
                        aria-label={t('rubricQueue.bulk_bar')}
                        style={{
                            position: 'sticky',
                            bottom: 8,
                            zIndex: 20,
                            order: 99,
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: 10,
                            padding: '10px 14px',
                            marginBottom: 12,
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            background: 'var(--bg-panel)',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                        }}
                    >
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                            <input
                                type="checkbox"
                                checked={allVisibleSelected}
                                disabled={visible.length === 0}
                                onChange={() =>
                                    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((s) => s.id)))
                                }
                            />
                            {t('rubricQueue.select_all_visible')}
                        </label>
                        <span className="text-muted text-sm" role="status">
                            {t('rubricQueue.selected_count', { count: selectedVisible.length })}
                        </span>
                        <span style={{ flex: 1 }} />
                        <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={selectedVisible.length === 0}
                            onClick={() => bulkWrite('mark')}
                        >
                            {t('rubricQueue.bulk_mark_nhi')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={selectedVisible.length === 0}
                            onClick={() => bulkWrite('restore')}
                        >
                            {t('rubricQueue.bulk_restore')}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={stopSelecting}>
                            {t('common.cancel')}
                        </button>
                    </div>
                )}

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
                                        progress={progressFor(s.id)}
                                        href={hrefFor(s.id)}
                                        onOpen={() => rememberPosition(s.id)}
                                        selectable={selecting}
                                        selected={selected.has(s.id)}
                                        onToggleSelected={() => toggleSelected(s.id)}
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
                                progress={progressFor(s.id)}
                                href={hrefFor(s.id)}
                                onOpen={() => rememberPosition(s.id)}
                                selectable={selecting}
                                selected={selected.has(s.id)}
                                onToggleSelected={() => toggleSelected(s.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            <ConfirmDialog {...confirmProps} />

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
