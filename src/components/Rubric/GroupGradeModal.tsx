import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import Modal from '../ui/Modal';
import type { Class, Rubric, Student, StudentRubric } from '../../types';

export interface GroupGradeModalProps {
    rubric: Rubric;
    /** The roster to pick from — already narrowed to the active class by the caller when one is set. */
    students: Student[];
    classes: Class[];
    studentRubrics: StudentRubric[];
    /** Class names disambiguate same-named students, so they only earn their space without a class filter. */
    showClassNames: boolean;
    /** Editing an existing group: its current members and name are pre-filled. */
    initialStudentIds?: string[];
    initialName?: string;
    mode?: 'create' | 'edit';
    onClose: () => void;
    onStart: (studentIds: string[], groupName: string) => void;
}

/**
 * Shared "grade as a group" picker for the rubric card, the rubric editor and the grading queue.
 * Picking a student who already sits in a group pulls their current members back in, so re-running
 * the modal edits the existing group instead of minting a parallel one (and leaves the members it
 * drops ungrouped — see createGroupStudentRubrics).
 */
export default function GroupGradeModal({
    rubric,
    students,
    classes,
    studentRubrics,
    showClassNames,
    initialStudentIds,
    initialName,
    mode = 'create',
    onClose,
    onStart,
}: GroupGradeModalProps) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [groupName, setGroupName] = useState(initialName ?? '');
    const [selected, setSelected] = useState<Set<string>>(new Set(initialStudentIds ?? []));

    const gradeByStudent = useMemo(() => {
        const map = new Map<string, StudentRubric>();
        for (const sr of studentRubrics) {
            if (sr.rubricId === rubric.id && !sr.isPeerReview) map.set(sr.studentId, sr);
        }
        return map;
    }, [studentRubrics, rubric.id]);

    const classNameById = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);
    const selectableIds = useMemo(() => new Set(students.map((s) => s.id)), [students]);

    const groupSizes = useMemo(() => {
        const sizes = new Map<string, number>();
        for (const sr of gradeByStudent.values()) {
            if (!sr.groupId) continue;
            sizes.set(sr.groupId, (sizes.get(sr.groupId) ?? 0) + 1);
        }
        return sizes;
    }, [gradeByStudent]);

    const isGraded = (sr: StudentRubric | undefined) =>
        !!sr && (!!sr.gradedAt || !!sr.notHandedIn || sr.entries.some((e) => e.levelId !== null));

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return students;
        return students.filter((s) => {
            const className = classNameById.get(s.classId ?? '') ?? '';
            return s.name.toLowerCase().includes(q) || className.toLowerCase().includes(q);
        });
    }, [students, query, classNameById]);

    const gradedSelected = [...selected].some((id) => isGraded(gradeByStudent.get(id)));

    function toggle(student: Student) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(student.id)) {
                next.delete(student.id);
                return next;
            }
            next.add(student.id);
            const groupId = gradeByStudent.get(student.id)?.groupId;
            if (groupId) {
                for (const sr of gradeByStudent.values()) {
                    // Only members the teacher can actually see here: pulling in a classmate from a
                    // class outside the supplied roster would select a hidden member nobody can
                    // review or deselect before the group is saved.
                    if (sr.groupId === groupId && selectableIds.has(sr.studentId)) next.add(sr.studentId);
                }
            }
            return next;
        });
    }

    return (
        <Modal titleId="group-grade-title" onClose={onClose} maxWidth={520}>
            <div style={{ padding: 20 }}>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 4,
                    }}
                >
                    <h2 id="group-grade-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                        {mode === 'edit' ? t('rubricQueue.group_edit_title') : t('rubricList.group_grade_title')}
                    </h2>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label={t('common.close')}>
                        <X size={16} />
                    </button>
                </div>
                <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {t('rubricList.group_grade_help')}
                </p>
                <div style={{ marginBottom: 12 }}>
                    <label htmlFor="group-grade-name" style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>
                        {t('rubricList.group_grade_name_label')}
                    </label>
                    <input
                        id="group-grade-name"
                        type="text"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder={t('rubricList.group_grade_name_placeholder')}
                        style={{ width: '100%' }}
                    />
                </div>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                    <Search
                        size={14}
                        aria-hidden="true"
                        style={{
                            position: 'absolute',
                            left: 10,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--text-dim)',
                        }}
                    />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t('rubricList.group_grade_search')}
                        aria-label={t('rubricList.group_grade_search')}
                        style={{ width: '100%', paddingLeft: 32 }}
                    />
                </div>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        maxHeight: 320,
                        overflowY: 'auto',
                    }}
                >
                    {visible.map((s) => {
                        const sr = gradeByStudent.get(s.id);
                        const className = classNameById.get(s.classId ?? '');
                        return (
                            <label
                                key={s.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '6px 4px',
                                    fontSize: '0.9rem',
                                }}
                            >
                                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s)} />
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    {s.name}
                                    {showClassNames && className && (
                                        <span className="text-muted text-xs" style={{ marginLeft: 6 }}>
                                            {className}
                                        </span>
                                    )}
                                </span>
                                {isGraded(sr) && (
                                    <span className="badge badge-green">{t('rubricList.group_grade_graded')}</span>
                                )}
                                {sr?.groupId && groupSizes.get(sr.groupId)! > 1 && (
                                    <span className="badge badge-blue" title={t('rubricList.group_grade_in_group')}>
                                        {t('rubricList.group_grade_in_group')}
                                    </span>
                                )}
                            </label>
                        );
                    })}
                </div>
                {gradedSelected && (
                    <p
                        role="status"
                        style={{
                            margin: '10px 0 0',
                            fontSize: '0.8rem',
                            color: 'var(--text-muted)',
                        }}
                    >
                        {t('rubricList.group_grade_keeps_existing')}
                    </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                    <button className="btn btn-secondary btn-sm" onClick={onClose}>
                        {t('common.cancel')}
                    </button>
                    <button
                        className="btn btn-primary btn-sm"
                        disabled={selected.size < (mode === 'edit' ? 1 : 2)}
                        onClick={() => onStart([...selected], groupName)}
                    >
                        {mode === 'edit'
                            ? t('rubricList.group_grade_update_btn', { count: selected.size })
                            : t('rubricList.group_grade_start_btn', { count: selected.size })}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
