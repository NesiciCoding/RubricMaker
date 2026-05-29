import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { BookOpen, Copy, Check, TrendingUp, MessageSquare, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Joyride, STATUS } from 'react-joyride';
import { useApp } from '../context/AppContext';
import { calcGradeSummary } from '../utils/gradeCalc';
import CefrProgressChart from '../components/Statistics/CefrProgressChart';
import { CEFR_LEVELS } from '../data/cefrDescriptors';
import { getStudentPortalTutorialSteps } from '../data/StudentPortalTutorialSteps';
import type { CefrLevel, CefrSkill } from '../types';

export default function StudentPortalPage() {
    const { studentId } = useParams<{ studentId: string }>();
    const { students, classes, rubrics, studentRubrics, gradeScales, settings, selfAssessments } = useApp();
    const { t, i18n } = useTranslation();
    const [linkCopied, setLinkCopied] = useState(false);

    const tourKey = `rm_portal_tour_seen_${studentId}`;
    const [tourRun, setTourRun] = useState(() => localStorage.getItem(tourKey) !== 'true');
    const tourSteps = useMemo(() => getStudentPortalTutorialSteps(t), [t, i18n.language]);

    const handleTourCallback = (data: { status: string }) => {
        if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
            localStorage.setItem(tourKey, 'true');
            setTourRun(false);
        }
    };

    const student = students.find((s) => s.id === studentId);
    const cls = classes.find((c) => c.id === student?.classId);

    const history = useMemo(() => {
        if (!student) return [];
        const srs = studentRubrics.filter(
            (sr) => sr.studentId === student.id && sr.gradedAt && !sr.isPeerReview && !sr.notHandedIn
        );
        return [...srs]
            .sort((a, b) => new Date(a.gradedAt!).getTime() - new Date(b.gradedAt!).getTime())
            .map((sr) => {
                const liveR = rubrics.find((r) => r.id === sr.rubricId);
                const rubric = sr.rubricSnapshot ?? liveR;
                if (!rubric) return null;
                const scale =
                    gradeScales.find((g) => g.id === (rubric.gradeScaleId ?? settings.defaultGradeScaleId)) ??
                    gradeScales[0];
                const summary = calcGradeSummary(sr, rubric.criteria, scale);
                return {
                    sr,
                    rubric,
                    scale,
                    summary,
                    dateStr: new Date(sr.gradedAt!).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                    }),
                    score: parseFloat(summary.modifiedPercentage.toFixed(1)),
                };
            })
            .filter(Boolean) as {
                sr: (typeof studentRubrics)[0];
                rubric: (typeof rubrics)[0];
                scale: (typeof gradeScales)[0];
                summary: ReturnType<typeof calcGradeSummary>;
                dateStr: string;
                score: number;
            }[];
    }, [student, studentRubrics, rubrics, gradeScales, settings]);

    interface CefrEntry {
        level: CefrLevel;
        skill: CefrSkill;
        avgScore: number;
        count: number;
        achieved: boolean;
        threshold: number;
    }

    const cefrProgress = useMemo((): CefrEntry[] => {
        if (!student) return [];
        const cefrHistory = history.filter((h) => h.rubric.cefrTargetLevel);
        const groups = new Map<string, { scores: number[]; thresholds: number[]; skill: CefrSkill; level: CefrLevel }>();
        for (const h of cefrHistory) {
            const level = h.rubric.cefrTargetLevel as CefrLevel;
            const skill = (h.rubric.cefrSkill ?? 'writing') as CefrSkill;
            const key = `${skill}__${level}`;
            if (!groups.has(key)) groups.set(key, { scores: [], thresholds: [], skill, level });
            groups.get(key)!.scores.push(h.score);
            groups.get(key)!.thresholds.push(h.rubric.cefrAchieveThreshold ?? 70);
        }
        return Array.from(groups.values())
            .map((g) => {
                const avgScore = g.scores.reduce((a, b) => a + b, 0) / g.scores.length;
                const threshold = g.thresholds.reduce((a, b) => a + b, 0) / g.thresholds.length;
                return { level: g.level, skill: g.skill, avgScore, count: g.scores.length, achieved: avgScore >= threshold, threshold };
            })
            .sort((a, b) => CEFR_LEVELS.indexOf(a.level) - CEFR_LEVELS.indexOf(b.level));
    }, [student, history]);

    const selfAssess = selfAssessments.filter((sa) => sa.studentId === studentId);

    if (!student) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <BookOpen size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
                    <p>{t('studentPortal.not_found')}</p>
                </div>
            </div>
        );
    }

    const avgScore = history.length > 0 ? history.reduce((acc, h) => acc + h.score, 0) / history.length : null;
    const portalUrl = `${window.location.origin}${window.location.pathname}#/portal/${student.id}`;

    function handleCopyLink() {
        navigator.clipboard.writeText(portalUrl);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
    }

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 60 }}>
            <Joyride
                steps={tourSteps}
                run={tourRun}
                continuous
                showProgress
                showSkipButton
                callback={handleTourCallback}
                styles={{
                    tooltipContainer: {
                        textAlign: 'left',
                    },
                }}
            />
            {/* Header */}
            <div style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', padding: '20px 24px' }}>
                <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>{student.name}</h1>
                        {cls && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 2 }}>{cls.name}</div>}
                    </div>
                    <button className="btn btn-ghost btn-sm" data-tour="portal-copy-link" onClick={handleCopyLink} title={t('studentPortal.copy_link')}>
                        {linkCopied ? <Check size={14} /> : <Copy size={14} />}
                        {linkCopied ? t('studentPortal.link_copied') : t('studentPortal.copy_link')}
                    </button>
                </div>
            </div>

            <div data-tour="portal-content" style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* Summary stats */}
                <div data-tour="portal-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                    <StatCard icon={<BookOpen size={16} />} label={t('studentPortal.stat_rubrics')} value={String(history.length)} />
                    {avgScore !== null && (
                        <StatCard icon={<TrendingUp size={16} />} label={t('studentPortal.stat_average')} value={`${avgScore.toFixed(1)}%`} />
                    )}
                    {selfAssess.length > 0 && (
                        <StatCard icon={<Star size={16} />} label={t('studentPortal.stat_self_assessments')} value={String(selfAssess.length)} />
                    )}
                </div>

                {/* Grade history chart */}
                {history.length > 1 && (
                    <Section title={t('studentPortal.grade_history')}>
                        <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={history} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                <XAxis dataKey="dateStr" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} interval="preserveStartEnd" />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} unit="%" />
                                <Tooltip
                                    contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}
                                    formatter={(value: unknown) => [`${value}%`, t('studentPortal.score')]}
                                />
                                <Line type="monotone" dataKey="score" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </Section>
                )}

                {/* CEFR progress */}
                {cefrProgress.length > 0 && (
                    <Section title={t('studentPortal.cefr_progress')}>
                        <CefrProgressChart entries={cefrProgress} />
                    </Section>
                )}

                {/* Rubric grades list */}
                {history.length > 0 && (
                    <Section title={t('studentPortal.rubric_grades')}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[...history].reverse().map((h) => (
                                <div
                                    key={h.sr.id}
                                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{h.rubric.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{h.dateStr}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{h.summary.modifiedPercentage.toFixed(1)}%</div>
                                            {h.summary.letterGrade && (
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{h.summary.letterGrade}</div>
                                            )}
                                        </div>
                                    </div>
                                    {h.sr.overallComment && (
                                        <div style={{ marginTop: 8, fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                            <MessageSquare size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                                            <span>{h.sr.overallComment}</span>
                                        </div>
                                    )}
                                    {/* Criterion-level feedback */}
                                    {h.sr.entries.some((e) => e.comment) && (
                                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {h.sr.entries
                                                .filter((e) => e.comment)
                                                .map((e) => {
                                                    const criterion = h.rubric.criteria.find((c: { id: string }) => c.id === e.criterionId);
                                                    return (
                                                        <div key={e.criterionId} style={{ fontSize: '0.8rem', padding: '6px 10px', background: 'var(--bg)', borderRadius: 6, borderLeft: '3px solid var(--accent)' }}>
                                                            {criterion && <span style={{ fontWeight: 600, marginRight: 6 }}>{criterion.title}:</span>}
                                                            {e.comment}
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </Section>
                )}

                {history.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>
                        <BookOpen size={36} style={{ marginBottom: 12, opacity: 0.3 }} />
                        <p>{t('studentPortal.no_grades_yet')}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ color: 'var(--accent)', flexShrink: 0 }}>{icon}</div>
            <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{value}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</div>
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</h3>
            {children}
        </div>
    );
}
