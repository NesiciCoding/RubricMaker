import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Avatar from '../ui/Avatar';
import type { GradeSummary } from '../../utils/gradeCalc';
import type { Student } from '../../types';
import { QUEUE_STATUS_BADGE, QUEUE_STATUS_LABEL, type QueueStudentStatus } from './gradingQueueStatus';

interface Props {
    student: Student;
    classLabel?: string;
    groupName?: string;
    status: QueueStudentStatus;
    summary?: GradeSummary;
    href: string;
}

/** One student row in the queue's compact list view. */
export default function GradingQueueRow({ student, classLabel, groupName, status, summary, href }: Props) {
    const { t } = useTranslation();
    const actionLabel = status === 'graded' ? t('rubricQueue.action_open') : t('rubricQueue.action_grade');
    const actionLabelForStudent =
        status === 'graded'
            ? t('rubricQueue.action_open_for', { name: student.name })
            : t('rubricQueue.action_grade_for', { name: student.name });

    return (
        <tr>
            <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                {summary ? (
                    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontWeight: 700 }}>{summary.letterGrade || '—'}</span>
                        <span className="text-muted text-sm">{Math.round(summary.modifiedPercentage)}%</span>
                    </span>
                ) : (
                    <span className="text-muted">—</span>
                )}
            </td>
            <td>
                <Link to={href} aria-label={actionLabelForStudent} className="btn btn-primary btn-sm">
                    {actionLabel}
                </Link>
            </td>
        </tr>
    );
}
