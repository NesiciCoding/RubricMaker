import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, FileText, Users } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useApp } from '../context/AppContext';
import Topbar from '../components/Layout/Topbar';
import CriterionHeatmap from '../components/Statistics/CriterionHeatmap';
import { aggregatePeerReviews } from '../utils/peerReviewAggregator';

export default function PeerReviewAnalyticsPage() {
    const { rubricId } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { rubrics, students, peerReviews, studentRubrics } = useApp();

    const [selectedRound, setSelectedRound] = useState<number | 'all'>('all');

    const rubric = rubrics.find((r) => r.id === rubricId);

    const analytics = useMemo(() => {
        if (!rubric) return null;
        return aggregatePeerReviews(rubric, peerReviews, studentRubrics);
    }, [rubric, peerReviews, studentRubrics]);

    const rounds = analytics?.rounds.map((r) => r.round) ?? [];

    const filteredAnalytics = useMemo(() => {
        if (!rubric) return null;
        if (selectedRound === 'all') return analytics;
        const filtered = peerReviews.filter((pr) => (pr.round ?? 1) === selectedRound);
        return aggregatePeerReviews(rubric, filtered, studentRubrics);
    }, [rubric, peerReviews, studentRubrics, analytics, selectedRound]);

    if (!rubric) {
        return (
            <div className="page-content center">
                <div className="text-center">
                    <AlertCircle size={48} className="text-muted" style={{ marginBottom: 16 }} />
                    <h3>{t('peerAnalytics.rubric_not_found')}</h3>
                    <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => navigate(-1)}>
                        {t('gradeStudent.action_back')}
                    </button>
                </div>
            </div>
        );
    }

    if (!analytics || analytics.totalReviews === 0) {
        return (
            <>
                <Topbar title={t('peerAnalytics.title', { rubricName: rubric.name })} />
                <div className="page-content fade-in">
                    <div className="card" style={{ marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                            <FileText size={20} style={{ color: 'var(--accent)' }} />
                            <h2 style={{ margin: 0 }}>{rubric.name}</h2>
                        </div>
                        <p className="text-muted text-sm">{rubric.description}</p>
                    </div>
                    <div className="card">
                        <p className="text-muted text-sm" style={{ textAlign: 'center', padding: '24px 0' }}>
                            {t('peerAnalytics.empty_state')}
                        </p>
                    </div>
                </div>
            </>
        );
    }

    const stats = filteredAnalytics ?? analytics;

    const heatmapCriteria = rubric.criteria.map((c) => ({ id: c.id, title: c.title }));
    const heatmapStudents = [{ id: 'feedback', name: t('peerAnalytics.heatmap_row_label') }];
    const maxComments = Math.max(...stats.criteria.map((c) => c.commentCount), 1);
    const heatmapScores: Record<string, Record<string, number>> = {
        feedback: {},
    };
    stats.criteria.forEach((c) => {
        heatmapScores.feedback[c.criterionId] = Math.round((c.commentCount / maxComments) * 100);
    });

    const reviewerRows = stats.reviewers.map((r) => {
        const student = r.reviewerId ? students.find((s) => s.id === r.reviewerId) : undefined;
        return {
            ...r,
            name: student ? student.name : t('peerAnalytics.anonymous_reviewer'),
        };
    });

    const trendData = analytics.rounds.map((r) => ({
        round: t('peerReview.round_n', { n: r.round }),
        consistency: r.consistency !== null ? Number(r.consistency.toFixed(2)) : 0,
        leniencyBias: r.leniencyBias !== null ? Number(r.leniencyBias.toFixed(2)) : 0,
    }));

    return (
        <>
            <Topbar title={t('peerAnalytics.title', { rubricName: rubric.name })} />
            <div className="page-content fade-in">
                <div className="card" style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <FileText size={20} style={{ color: 'var(--accent)' }} />
                        <h2 style={{ margin: 0 }}>{rubric.name}</h2>
                    </div>
                    <p className="text-muted text-sm">{rubric.description}</p>
                    <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                        <span className="text-sm text-muted">
                            {t('peerAnalytics.total_reviews', { count: analytics.totalReviews })}
                        </span>
                        <span className="text-sm text-muted">
                            {t('peerAnalytics.total_comparisons', { count: analytics.totalComparisons })}
                        </span>
                        {analytics.totalMissingBaseline > 0 && (
                            <span className="text-sm text-muted">
                                {t('peerAnalytics.missing_baseline', { count: analytics.totalMissingBaseline })}
                            </span>
                        )}
                    </div>
                </div>

                {/* Round selector */}
                {rounds.length > 0 && (
                    <div className="card" style={{ marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                {t('peerAnalytics.filter_round')}:
                            </span>
                            <button
                                className={`btn btn-sm ${selectedRound === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setSelectedRound('all')}
                            >
                                {t('peerAnalytics.all_rounds')}
                            </button>
                            {rounds.map((round) => (
                                <button
                                    key={round}
                                    className={`btn btn-sm ${selectedRound === round ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setSelectedRound(round)}
                                >
                                    {t('peerReview.round_n', { n: round })}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Criterion feedback heatmap */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <h3 style={{ marginBottom: 16 }}>{t('peerAnalytics.feedback_heatmap')}</h3>
                    <p className="text-muted text-xs" style={{ marginBottom: 12 }}>
                        {t('peerAnalytics.feedback_heatmap_hint')}
                    </p>
                    <CriterionHeatmap students={heatmapStudents} criteria={heatmapCriteria} scores={heatmapScores} />
                </div>

                {/* Reviewer table */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <h3 style={{ marginBottom: 16 }}>
                        <Users size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                        {t('peerAnalytics.reviewers')}
                    </h3>
                    {reviewerRows.length === 0 ? (
                        <p className="text-muted text-sm">{t('peerAnalytics.no_reviewers')}</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>{t('peerAnalytics.reviewer_name')}</th>
                                        <th>{t('peerAnalytics.review_count')}</th>
                                        <th>{t('peerAnalytics.consistency')}</th>
                                        <th>{t('peerAnalytics.leniency_bias')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reviewerRows.map((r) => (
                                        <tr key={r.reviewerId ?? 'anonymous'}>
                                            <td>{r.name}</td>
                                            <td>{r.reviewCount}</td>
                                            <td>
                                                {r.consistency !== null
                                                    ? r.consistency.toFixed(2)
                                                    : t('peerAnalytics.no_baseline')}
                                            </td>
                                            <td>
                                                {r.leniencyBias !== null
                                                    ? (r.leniencyBias > 0 ? '+' : '') + r.leniencyBias.toFixed(2)
                                                    : t('peerAnalytics.no_baseline')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Round-over-round trend */}
                {trendData.length > 1 && (
                    <div className="card">
                        <h3 style={{ marginBottom: 16 }}>{t('peerAnalytics.round_trend')}</h3>
                        <ResponsiveContainer width="100%" height={260}>
                            <LineChart data={trendData} margin={{ top: 10, right: 24, bottom: 10, left: -10 }}>
                                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} vertical={false} />
                                <XAxis dataKey="round" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 8,
                                    }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="consistency"
                                    name={t('peerAnalytics.consistency')}
                                    stroke="var(--accent)"
                                    strokeWidth={2.5}
                                    dot={{ r: 4 }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="leniencyBias"
                                    name={t('peerAnalytics.leniency_bias')}
                                    stroke="var(--teal, #14b8a6)"
                                    strokeWidth={2}
                                    strokeDasharray="5 4"
                                    dot={{ r: 3 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </>
    );
}
