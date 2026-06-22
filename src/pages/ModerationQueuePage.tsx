import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { getModerationQueue } from '../utils/coGradingModerationQueue';

export default function ModerationQueuePage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { rubrics, studentRubrics, peerReviews, students, saveStudentRubric, deletePeerReview } = useApp();
    const [threshold, setThreshold] = useState(2);

    const queue = useMemo(
        () => getModerationQueue(rubrics, studentRubrics, peerReviews, students, threshold),
        [rubrics, studentRubrics, peerReviews, students, threshold]
    );

    function resolveKeepBaseline(secondMarkerEntryId: string) {
        deletePeerReview(secondMarkerEntryId);
    }

    function resolveAcceptSecondMarker(baselineId: string, secondMarkerEntryId: string) {
        const secondMarker = peerReviews.find((pr) => pr.id === secondMarkerEntryId);
        const baseline = studentRubrics.find((sr) => sr.id === baselineId);
        if (!secondMarker || !baseline) return;
        saveStudentRubric({
            ...baseline,
            entries: secondMarker.entries,
            overallComment: secondMarker.overallComment,
            globalModifier: secondMarker.globalModifier,
        });
        deletePeerReview(secondMarkerEntryId);
    }

    return (
        <>
            <Topbar title={t('coGrading.moderation_title')} />
            <div className="page-content fade-in">
                <div className="form-group" style={{ maxWidth: 280, marginBottom: 20 }}>
                    <label htmlFor="moderation-threshold">{t('coGrading.threshold_label')}</label>
                    <input
                        id="moderation-threshold"
                        type="number"
                        min={0}
                        step={0.5}
                        value={threshold}
                        onChange={(e) => setThreshold(Number(e.target.value) || 0)}
                    />
                </div>

                {queue.length === 0 ? (
                    <div className="empty-state">
                        <UserCheck size={40} />
                        <h3>{t('coGrading.moderation_empty')}</h3>
                        <p className="text-muted text-sm">{t('coGrading.moderation_empty_desc')}</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {queue.map((item) => {
                            const rubric = rubrics.find((r) => r.id === item.rubricId);
                            const student = students.find((s) => s.id === item.studentId);
                            return (
                                <div key={item.secondMarkerEntry.id} className="card">
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            marginBottom: 10,
                                        }}
                                    >
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <AlertTriangle size={15} style={{ color: 'var(--orange, #f59e0b)' }} />
                                                <h3 style={{ margin: 0 }}>{student?.name ?? item.studentId}</h3>
                                            </div>
                                            <div className="text-muted text-xs" style={{ marginTop: 4 }}>
                                                {rubric?.name} ·{' '}
                                                {t('coGrading.second_marker_label', { name: item.secondMarkerId })}
                                            </div>
                                        </div>
                                        <span className="badge badge-orange">
                                            {t('coGrading.delta_badge', { delta: item.totalAbsDelta.toFixed(1) })}
                                        </span>
                                    </div>

                                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                                        <thead>
                                            <tr style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                <th style={{ textAlign: 'left', padding: '4px 8px' }}>
                                                    {t('coGrading.col_criterion')}
                                                </th>
                                                <th style={{ textAlign: 'right', padding: '4px 8px' }}>
                                                    {t('coGrading.col_baseline')}
                                                </th>
                                                <th style={{ textAlign: 'right', padding: '4px 8px' }}>
                                                    {t('coGrading.col_second_marker')}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {item.criteria.map((c) => (
                                                <tr
                                                    key={c.criterionId}
                                                    style={{
                                                        borderTop: '1px solid var(--border)',
                                                        fontWeight: Math.abs(c.delta) > 0 ? 600 : 400,
                                                    }}
                                                >
                                                    <td style={{ padding: '4px 8px', fontSize: '0.85rem' }}>
                                                        {c.title}
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: '4px 8px',
                                                            textAlign: 'right',
                                                            fontSize: '0.85rem',
                                                        }}
                                                    >
                                                        {c.baselinePoints}
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: '4px 8px',
                                                            textAlign: 'right',
                                                            fontSize: '0.85rem',
                                                        }}
                                                    >
                                                        {c.secondMarkerPoints}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() =>
                                                navigate(`/rubrics/${item.rubricId}/grade/${item.studentId}`)
                                            }
                                        >
                                            {t('coGrading.action_view_baseline')}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => resolveKeepBaseline(item.secondMarkerEntry.id)}
                                        >
                                            {t('coGrading.action_keep_baseline')}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-primary btn-sm"
                                            onClick={() =>
                                                resolveAcceptSecondMarker(item.baseline.id, item.secondMarkerEntry.id)
                                            }
                                        >
                                            {t('coGrading.action_accept_second_marker')}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}
