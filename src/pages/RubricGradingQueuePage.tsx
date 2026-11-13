import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BarChart3, Download, FileText, Search, UserRoundCheck, UsersRound } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { EmptyState } from '../components/ui/EmptyState';
import GroupGradeModal from '../components/Rubric/GroupGradeModal';
import { useAuthoring, useClasses, useGrading, useSettings, useStudents } from '../context/AppContext';
import { useRubricPool } from '../hooks/useMaterialPool';
import { studentsForRubric } from '../utils/rubricRoster';

/**
 * The rubric's grading queue: the roster the teacher grades from, with the rubric already in the
 * URL. Every student row links straight to the grading screen, so choosing the rubric happens once.
 */
export default function RubricGradingQueuePage() {
    const { rubricId } = useParams<{ rubricId: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { students } = useStudents();
    const { classes } = useClasses();
    const { rubrics: ownRubrics } = useAuthoring();
    const { studentRubrics, createGroupStudentRubrics, updateStudentGroup } = useGrading();
    const { settings } = useSettings();
    const { rubrics } = useRubricPool(ownRubrics);

    const [search, setSearch] = useState('');
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
    const isGraded = (id: string) => {
        const sr = gradeByStudent.get(id);
        return !!sr && (!!sr.gradedAt || sr.entries.some((e) => e.levelId !== null));
    };

    const gradedCount = roster.filter((s) => isGraded(s.id)).length;

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return roster;
        return roster.filter((s) => s.name.toLowerCase().includes(q));
    }, [roster, search]);

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

    const activeClassStudents = settings.activeClassId
        ? students.filter((s) => s.classId === settings.activeClassId)
        : roster;

    return (
        <>
            <Topbar
                title={t('rubricQueue.title', { name: rubric.name })}
                actions={
                    <>
                        <Link to={`/rubrics/${rubric.id}`} className="btn btn-ghost btn-sm">
                            <ArrowLeft size={15} /> {t('rubricQueue.back_to_rubric')}
                        </Link>
                        <button className="btn btn-secondary btn-sm" onClick={() => setGroupModalOpen(true)}>
                            <UsersRound size={15} /> {t('rubricList.action_group_grade')}
                        </button>
                        <Link to={`/rubrics/${rubric.id}/peer-review`} className="btn btn-secondary btn-sm">
                            <UserRoundCheck size={15} /> {t('rubricList.action_peer_review')}
                        </Link>
                        <Link to={`/statistics?rubric=${rubric.id}`} className="btn btn-secondary btn-sm">
                            <BarChart3 size={15} /> {t('rubricList.action_statistics')}
                        </Link>
                        <Link to={`/export?rubric=${rubric.id}`} className="btn btn-secondary btn-sm">
                            <Download size={15} /> {t('rubricList.action_export')}
                        </Link>
                    </>
                }
            />
            <div className="page-content fade-in">
                {groups.length > 0 && (
                    <div className="card" style={{ marginBottom: 16 }}>
                        <h2 style={{ margin: '0 0 10px', fontSize: '0.95rem', fontWeight: 700 }}>
                            {t('rubricQueue.groups_title')}
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {groups.map((group) => {
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
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                        marginBottom: 16,
                    }}
                >
                    <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 360 }}>
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
                    <span className="text-muted text-sm" role="status">
                        {t('rubricQueue.progress', { graded: gradedCount, total: roster.length })}
                    </span>
                </div>

                {roster.length === 0 ? (
                    <EmptyState
                        icon={FileText}
                        title={t('rubricQueue.no_students')}
                        description={t('rubricQueue.no_students_hint')}
                    />
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th scope="col">{t('rubricQueue.col_student')}</th>
                                    <th scope="col">{t('rubricQueue.col_class')}</th>
                                    <th scope="col">{t('rubricQueue.col_status')}</th>
                                    <th scope="col">{t('common.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((s) => {
                                    const graded = isGraded(s.id);
                                    const notHandedIn = gradeByStudent.get(s.id)?.notHandedIn;
                                    return (
                                        <tr key={s.id}>
                                            <td style={{ fontWeight: 500 }}>
                                                {s.name}
                                                {gradeByStudent.get(s.id)?.groupId && (
                                                    <span className="badge badge-blue" style={{ marginLeft: 8 }}>
                                                        {gradeByStudent.get(s.id)?.groupName ??
                                                            t('rubricQueue.in_group')}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="text-muted text-sm">
                                                {classById.get(s.classId ?? '')?.name ?? '—'}
                                            </td>
                                            <td>
                                                {notHandedIn ? (
                                                    <span className="badge badge-yellow">
                                                        {t('rubricQueue.not_handed_in')}
                                                    </span>
                                                ) : graded ? (
                                                    <span className="badge badge-green">{t('rubricQueue.graded')}</span>
                                                ) : (
                                                    <span className="badge badge-blue">
                                                        {t('rubricQueue.not_graded')}
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <Link
                                                    to={`/rubrics/${rubric.id}/grade/${s.id}`}
                                                    className="btn btn-primary btn-sm"
                                                >
                                                    {graded
                                                        ? t('rubricQueue.action_open')
                                                        : t('rubricQueue.action_grade')}
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {groupModalOpen && (
                <GroupGradeModal
                    rubric={rubric}
                    students={activeClassStudents}
                    classes={classes}
                    studentRubrics={studentRubrics}
                    showClassNames={!settings.activeClassId}
                    onClose={() => setGroupModalOpen(false)}
                    onStart={(studentIds, groupName) => {
                        const srs = groupName.trim()
                            ? createGroupStudentRubrics(rubric.id, studentIds, groupName)
                            : createGroupStudentRubrics(rubric.id, studentIds);
                        setGroupModalOpen(false);
                        if (srs[0]) navigate(`/rubrics/${rubric.id}/grade/${srs[0].studentId}`);
                    }}
                />
            )}

            {editingGroup && (
                <GroupGradeModal
                    rubric={rubric}
                    students={roster}
                    classes={classes}
                    studentRubrics={studentRubrics}
                    showClassNames={!settings.activeClassId}
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
