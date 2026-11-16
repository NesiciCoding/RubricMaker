import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Avatar from '../ui/Avatar';
import type { GradeSummary } from '../../utils/gradeCalc';
import type { Student } from '../../types';
import {
    QUEUE_STATUS_BADGE,
    QUEUE_STATUS_LABEL,
    type QueueProgress,
    type QueueStudentStatus,
} from './gradingQueueStatus';

interface Props {
    student: Student;
    classLabel?: string;
    groupName?: string;
    status: QueueStudentStatus;
    summary?: GradeSummary;
    progress?: QueueProgress;
    href: string;
    onOpen?: () => void;
    selectable?: boolean;
    selected?: boolean;
    onToggleSelected?: () => void;
}

/** One student row in the queue's compact list view. */
export default function GradingQueueRow({
    student,
    classLabel,
    groupName,
    status,
    summary,
    progress,
    href,
    onOpen,
    selectable,
    selected,
    onToggleSelected,
}: Props) {
    const { t } = useTranslation();
    const actionLabel = status === 'graded' ? t('rubricQueue.action_open') : t('rubricQueue.action_grade');
    const actionLabelForStudent =
        status === 'graded'
            ? t('rubricQueue.action_open_for', { name: student.name })
            : t('rubricQueue.action_grade_for', { name: student.name });

    return (
        <tr data-queue-student={student.id}>
            <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {selectable && (
                        <input
                            type="checkbox"
                            checked={!!selected}
                            onChange={onToggleSelected}
                            aria-label={t('rubricQueue.select_student', { name: student.name })}
                            style={{ width: 18, height: 18 }}
                        />
                    )}
                    <Avatar name={student.name} size={30} fontSize="0.8rem" />
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 500 }}>{student.name}</span>
                            {groupName && <span className="badge badge-blue">{groupName}</span>}
                        </div>
                        {classLabel && <span className="queue-row-class-inline text-muted text-sm">{classLabel}</span>}
                    </div>
                </div>
            </td>
            <td className="queue-col-class text-muted text-sm">{classLabel ?? '—'}</td>
            <td>
                <span className={`badge ${QUEUE_STATUS_BADGE[status]}`}>{t(QUEUE_STATUS_LABEL[status])}</span>
            </td>
            <td className="queue-col-score">
                {progress ? (
                    <span className="text-muted text-sm">
                        {t('rubricQueue.criteria_progress', { scored: progress.scored, total: progress.total })}
                    </span>
                ) : summary ? (
                    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontWeight: 700 }}>{summary.letterGrade || '—'}</span>
                        <span className="text-muted text-sm">{Math.round(summary.modifiedPercentage)}%</span>
                    </span>
                ) : (
                    <span className="text-muted">—</span>
                )}
            </td>
            <td>
                <Link to={href} onClick={onOpen} aria-label={actionLabelForStudent} className="btn btn-primary btn-sm">
                    {actionLabel}
                </Link>
            </td>
        </tr>
    );
}
