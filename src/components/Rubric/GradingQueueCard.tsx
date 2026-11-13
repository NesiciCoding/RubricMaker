import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Avatar from '../ui/Avatar';
import CardTile from '../ui/CardTile';
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

/**
 * One student tile in the rubric grading queue. The score is the rubric's own summary, so a
 * partially graded student shows the same percentage they will see on the grading screen.
 */
export default function GradingQueueCard({ student, classLabel, groupName, status, summary, href }: Props) {
    const { t } = useTranslation();
    const actionLabel = status === 'graded' ? t('rubricQueue.action_open') : t('rubricQueue.action_grade');
    const actionLabelForStudent =
        status === 'graded'
            ? t('rubricQueue.action_open_for', { name: student.name })
            : t('rubricQueue.action_grade_for', { name: student.name });
    const percentage = summary ? Math.max(0, Math.min(100, Math.round(summary.modifiedPercentage))) : 0;

    return (
        <CardTile width={292} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Avatar name={student.name} size={38} fontSize="0.95rem" />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                        title={student.name}
                        style={{
                            fontWeight: 600,
                            fontSize: '0.95rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {student.name}
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: 6,
                            marginTop: 3,
                        }}
                    >
                        {classLabel && <span className="text-muted text-xs">{classLabel}</span>}
                        {groupName && <span className="badge badge-blue">{groupName}</span>}
                    </div>
                </div>
                <span className={`badge ${QUEUE_STATUS_BADGE[status]}`}>{t(QUEUE_STATUS_LABEL[status])}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                {summary ? (
                    <>
                        <span style={{ fontSize: '1.35rem', fontWeight: 700, lineHeight: 1.1 }}>
                            {summary.letterGrade || '—'}
                        </span>
                        <span className="text-muted text-sm">{Math.round(summary.modifiedPercentage)}%</span>
                    </>
                ) : (
                    <span className="text-muted" style={{ fontSize: '1.1rem' }}>
                        —
                    </span>
                )}
            </div>

            <div
                aria-hidden="true"
                style={{
                    height: 6,
                    borderRadius: 999,
                    background: 'var(--bg-elevated)',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        height: '100%',
                        width: `${percentage}%`,
                        borderRadius: 999,
                        background: 'var(--accent)',
                    }}
                />
            </div>

            <Link
                to={href}
                aria-label={actionLabelForStudent}
                className={`btn ${status === 'graded' ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                style={{ justifyContent: 'center' }}
            >
                {actionLabel}
            </Link>
        </CardTile>
    );
}
