import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { useDbStatus } from '../hooks/useDbStatus';
import {
    buildReconciledEntries,
    DEFAULT_MODERATION_THRESHOLD_POINTS,
    getModerationQueue,
    ModerationQueueItem,
} from '../utils/coGradingModerationQueue';
import type { DbUser } from '../services/database';

export default function ModerationQueuePage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const {
        rubrics,
        studentRubrics,
        peerReviews,
        students,
        settings,
        saveStudentRubric,
        deletePeerReview,
        fetchSchoolMembers,
    } = useApp();
    const dbStatus = useDbStatus();
    const [threshold, setThreshold] = useState(DEFAULT_MODERATION_THRESHOLD_POINTS);
    const [colleagues, setColleagues] = useState<DbUser[]>([]);

    useEffect(() => {
        if (!dbStatus.isConnected || !settings.schoolId) {
            setColleagues([]);
            return;
        }
        fetchSchoolMembers(settings.schoolId).then(setColleagues);
    }, [dbStatus.isConnected, settings.schoolId, fetchSchoolMembers]);

    function resolveReviewerName(reviewerId: string) {
        const colleague = colleagues.find((c) => c.id === reviewerId);
        return colleague ? colleague.displayName || colleague.email || reviewerId : reviewerId;
    }

    const colleagueIds = useMemo(() => colleagues.map((c) => c.id), [colleagues]);

    const queue = useMemo(() => {
        const items = getModerationQueue(
            rubrics,
            studentRubrics,
            peerReviews,
            students,
            threshold,
            colleagueIds.length > 0 ? colleagueIds : undefined
        );
        // Oldest-pending-first: the longest-waiting disputes are the most urgent.
        return [...items].sort((a, b) =>
            (a.secondMarkerEntry.gradedAt ?? '').localeCompare(b.secondMarkerEntry.gradedAt ?? '')
        );
    }, [rubrics, studentRubrics, peerReviews, students, threshold, colleagueIds]);

    function pendingDays(item: ModerationQueueItem): number | null {
        if (!item.secondMarkerEntry.gradedAt) return null;
        return Math.floor((Date.now() - new Date(item.secondMarkerEntry.gradedAt).getTime()) / 86_400_000);
    }

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

    function resolveReconcile(item: ModerationQueueItem) {
        saveStudentRubric({ ...item.baseline, entries: buildReconciledEntries(item) });
        deletePeerReview(item.secondMarkerEntry.id);
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
                                                {t('coGrading.second_marker_label', {
                                                    name: resolveReviewerName(item.secondMarkerId),
                                                })}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                            {pendingDays(item) !== null && (
                                                <span
                                                    className="badge"
                                                    style={{
                                                        color:
                                                            pendingDays(item)! >= 5
                                                                ? 'var(--red)'
                                                                : pendingDays(item)! >= 2
                                                                  ? 'var(--yellow, #f59e0b)'
                                                                  : undefined,
                                                    }}
                                                >
                                                    {t('coGrading.pending_days', { count: pendingDays(item)! })}
                                                </span>
                                            )}
                                            <span className="badge badge-orange">
                                                {t('coGrading.delta_badge', { delta: item.totalAbsDelta.toFixed(1) })}
                                            </span>
                                        </div>
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
                                            className="btn btn-secondary btn-sm"
                                            onClick={() =>
                                                resolveAcceptSecondMarker(item.baseline.id, item.secondMarkerEntry.id)
                                            }
                                        >
                                            {t('coGrading.action_accept_second_marker')}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-primary btn-sm"
                                            onClick={() => resolveReconcile(item)}
                                        >
                                            {t('coGrading.action_reconcile')}
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
