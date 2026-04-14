import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { ArrowLeft, User, FileText, Download, TrendingUp, Loader, BookOpen, Link, CheckCircle, AlertTriangle, ClipboardCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { calcGradeSummary } from '../utils/gradeCalc';
import { exportSinglePdf } from '../utils/pdfExport';
import { getStudentGoalScores } from '../utils/learningGoalsAggregator';
import LearningGoalChart from '../components/Statistics/LearningGoalChart';
import CefrBadge from '../components/CEFR/CefrBadge';
import { CEFR_LEVELS, CEFR_SKILL_LABELS, CEFR_LEVEL_COLORS } from '../data/cefrDescriptors';
import { VO_TRACK_LABELS, VO_TRACK_COLORS } from '../data/voTracks';
import type { CefrLevel, CefrSkill } from '../types';
export default function StudentProfilePage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { students, classes, rubrics, studentRubrics, gradeScales, settings, selfAssessments } = useApp();
    const [exportingId, setExportingId] = useState<string | null>(null);
    const [copiedSALink, setCopiedSALink] = useState<string | null>(null);
    const { t, i18n } = useTranslation();
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';

    const student = students.find(s => s.id === id);
    const cls = classes.find(c => c.id === student?.classId);

    const history = useMemo(() => {
        if (!student) return [];
        const srs = studentRubrics.filter(sr => sr.studentId === student.id && sr.gradedAt);
        // Sort ascending by gradedAt for chronological chart
        const sorted = [...srs].sort((a, b) => new Date(a.gradedAt!).getTime() - new Date(b.gradedAt!).getTime());

        return sorted.map(sr => {
            const liveR = rubrics.find(r => r.id === sr.rubricId);
            const rubric = sr.rubricSnapshot || liveR;
            if (!rubric) return null;
            const scale = gradeScales.find(g => g.id === (rubric.gradeScaleId ?? settings.defaultGradeScaleId)) ?? gradeScales[0];
            const summary = calcGradeSummary(sr, rubric.criteria, scale);
            return {
                sr,
                rubric,
                scale,
                summary,
                dateStr: new Date(sr.gradedAt!).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                score: parseFloat(summary.modifiedPercentage.toFixed(1))
            };
        }).filter(Boolean) as { sr: any, rubric: any, scale: any, summary: any, dateStr: string, score: number }[];
    }, [student, studentRubrics, rubrics, gradeScales, settings]);

    const goals = useMemo(() => {
        if (!student) return [];
        return getStudentGoalScores(student.id, studentRubrics, rubrics);
    }, [student, studentRubrics, rubrics]);

    // ── CEFR progress ──────────────────────────────────────────────────────────
    // A student "achieves" a CEFR level when they score ≥ 70% on a rubric with that target level.
    const CEFR_ACHIEVE_THRESHOLD = 70;

    interface CefrEntry { level: CefrLevel; skill: CefrSkill; avgScore: number; count: number; achieved: boolean; lastDate: string }

    const cefrProgress = useMemo((): CefrEntry[] => {
        if (!student) return [];
        // Only consider rubrics that have a cefrTargetLevel set
        const cefrHistory = history.filter(h => h.rubric.cefrTargetLevel);

        // Group by skill + level
        type GroupKey = string;
        const groups = new Map<GroupKey, { scores: number[]; skill: CefrSkill; level: CefrLevel; lastDate: string }>();

        for (const h of cefrHistory) {
            const level = h.rubric.cefrTargetLevel as CefrLevel;
            const skill = (h.rubric.cefrSkill || 'writing') as CefrSkill;
            const key = `${skill}__${level}`;
            if (!groups.has(key)) {
                groups.set(key, { scores: [], skill, level, lastDate: h.dateStr });
            }
            groups.get(key)!.scores.push(h.score);
            groups.get(key)!.lastDate = h.dateStr;
        }

        return Array.from(groups.values()).map(g => ({
            level: g.level,
            skill: g.skill,
            avgScore: g.scores.reduce((a, b) => a + b, 0) / g.scores.length,
            count: g.scores.length,
            achieved: g.scores.reduce((a, b) => a + b, 0) / g.scores.length >= CEFR_ACHIEVE_THRESHOLD,
            lastDate: g.lastDate,
        })).sort((a, b) => CEFR_LEVELS.indexOf(a.level) - CEFR_LEVELS.indexOf(b.level));
    }, [student, history]);

    if (!student) {
        return (
            <>
                <Topbar title="Student Profile" actions={
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate('/students')}><ArrowLeft size={14} /> Back</button>
                } />
                <div className="page-content fade-in"><div className="empty-state">Student not found</div></div>
            </>
        );
    }

    const avgScore = history.length > 0
        ? history.reduce((acc, h) => acc + h.score, 0) / history.length
        : 0;

    const highestScore = history.length > 0
        ? Math.max(...history.map(h => h.score))
        : 0;

    function handleCopySALink(rubricId: string) {
        const url = `${window.location.origin}/rubrics/${rubricId}/self-assess/${student!.id}`;
        navigator.clipboard.writeText(url);
        setCopiedSALink(rubricId);
        setTimeout(() => setCopiedSALink(null), 2000);
    }

    const handleExport = async (h: any) => {
        setExportingId(h.sr.id);
        try {
            await exportSinglePdf(h.sr, h.rubric, student, h.scale, { orientation: h.rubric.format?.orientation || 'portrait' });
        } finally {
            setExportingId(null);
        }
    };

    return (
        <>
            <Topbar title="Student Profile" actions={
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/students')}>
                    <ArrowLeft size={15} /> Back to Roster
                </button>
            } />
            <div className="page-content fade-in">
                {/* Header Profile Area */}
                <div className="card" style={{ marginBottom: 24, display: 'flex', gap: 20, alignItems: 'center' }}>
                    <div style={{
                        width: 72, height: 72, borderRadius: '50%', background: 'var(--accent-soft)',
                        color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.8rem', fontWeight: 700
                    }}>
                        {student.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h2 style={{ margin: '0 0 6px', fontSize: '1.6rem' }}>{student.name}</h2>
                        <div style={{ display: 'flex', gap: 16, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><User size={14} /> {student.email || 'No email provided'}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FileText size={14} /> {cls?.name || 'Unknown Class'}
                                {cls?.voTrack && (
                                    <span style={{
                                        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                        background: VO_TRACK_COLORS[cls.voTrack], color: '#fff',
                                    }}>
                                        {VO_TRACK_LABELS[cls.voTrack]}
                                    </span>
                                )}
                            </span>
                        </div>
                    </div>
                </div>

                {history.length === 0 ? (
                    <div className="empty-state">
                        <TrendingUp size={36} />
                        <p>No graded rubrics yet for this student.</p>
                    </div>
                ) : (
                    <>
                        <div className="grid-3" style={{ marginBottom: 24 }}>
                            <div className="card" style={{ borderTop: '3px solid var(--accent)' }}>
                                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--accent)' }}>{avgScore.toFixed(1)}%</div>
                                <div className="text-muted text-sm" style={{ marginTop: 4 }}>Average Score</div>
                            </div>
                            <div className="card" style={{ borderTop: '3px solid var(--green)' }}>
                                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--green)' }}>{highestScore.toFixed(1)}%</div>
                                <div className="text-muted text-sm" style={{ marginTop: 4 }}>Highest Score</div>
                            </div>
                            <div className="card" style={{ borderTop: '3px solid var(--purple)' }}>
                                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--purple)' }}>{history.length}</div>
                                <div className="text-muted text-sm" style={{ marginTop: 4 }}>Rubrics Graded</div>
                            </div>
                        </div>

                        {history.length > 1 && (
                            <div className="card" style={{ marginBottom: 24 }}>
                                <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <TrendingUp size={18} /> Performance Timeline
                                </h3>
                                <ResponsiveContainer width="100%" height={260}>
                                    <LineChart data={history} margin={{ top: 10, right: 10, bottom: 20, left: -20 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                        <XAxis dataKey="dateStr" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickMargin={12} />
                                        <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                        <Tooltip
                                            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.85rem' }}
                                            labelStyle={{ color: 'var(--text)', fontWeight: 600, marginBottom: 4 }}
                                            itemStyle={{ color: 'var(--accent)', fontWeight: 600 }}
                                            formatter={(val: number, name: string, props: any) => [`${val}%`, props.payload.rubric.name]}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="score"
                                            stroke="var(--accent)"
                                            strokeWidth={3}
                                            dot={{ fill: 'var(--bg-card)', stroke: 'var(--accent)', strokeWidth: 2, r: 4 }}
                                            activeDot={{ r: 6, fill: 'var(--accent)' }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {goals.length > 0 && (
                            <LearningGoalChart goals={goals} />
                        )}

                        {/* CEFR / ERK Progress */}
                        {cefrProgress.length > 0 && (
                            <div className="card" style={{ marginBottom: 24 }}>
                                <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <BookOpen size={18} style={{ color: 'var(--accent)' }} />
                                    {t('cefr.student_progress_title')}
                                    <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>
                                        {t('cefr.student_progress_subtitle', { threshold: CEFR_ACHIEVE_THRESHOLD })}
                                    </span>
                                </h3>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {cefrProgress.map(entry => {
                                        const skillLabel = CEFR_SKILL_LABELS[entry.skill]?.[lang] ?? entry.skill;
                                        return (
                                            <div key={`${entry.skill}__${entry.level}`} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                {/* Level badge */}
                                                <CefrBadge level={entry.level} size="md" style={{ minWidth: 36 }} />

                                                {/* Skill label */}
                                                <span style={{ fontSize: 13, color: 'var(--text-muted)', minWidth: 140 }}>{skillLabel}</span>

                                                {/* Progress bar */}
                                                <div style={{ flex: 1, height: 8, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                                                    <div style={{
                                                        width: `${Math.min(entry.avgScore, 100)}%`,
                                                        height: '100%',
                                                        background: CEFR_LEVEL_COLORS[entry.level],
                                                        borderRadius: 4,
                                                        opacity: entry.achieved ? 1 : 0.45,
                                                        transition: 'width 0.4s ease',
                                                    }} />
                                                </div>

                                                {/* Score + status */}
                                                <span style={{ fontSize: 13, fontWeight: 600, minWidth: 44, textAlign: 'right', color: entry.achieved ? CEFR_LEVEL_COLORS[entry.level] : 'var(--text-muted)' }}>
                                                    {entry.avgScore.toFixed(0)}%
                                                </span>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                                                    background: entry.achieved ? `${CEFR_LEVEL_COLORS[entry.level]}22` : 'var(--bg-elevated)',
                                                    color: entry.achieved ? CEFR_LEVEL_COLORS[entry.level] : 'var(--text-muted)',
                                                    border: `1px solid ${entry.achieved ? CEFR_LEVEL_COLORS[entry.level] : 'var(--border)'}`,
                                                    minWidth: 72, textAlign: 'center',
                                                }}>
                                                    {entry.achieved ? t('cefr.achieved') : t('cefr.developing')}
                                                </span>
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 60 }}>
                                                    {t('cefr.n_assessments', { count: entry.count })}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Self-Assessment Comparison */}
                        {(() => {
                            const studentSAs = selfAssessments.filter(sa => sa.studentId === student.id);
                            if (studentSAs.length === 0) return null;
                            return (
                                <div className="card" style={{ marginBottom: 24 }}>
                                    <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <ClipboardCheck size={18} style={{ color: 'var(--accent)' }} />
                                        {t('selfAssess.comparison_title')}
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                        {studentSAs.map(sa => {
                                            const matchingHistory = history.find(h => h.rubric.id === sa.rubricId);
                                            const rubricName = rubrics.find(r => r.id === sa.rubricId)?.name ?? sa.rubricId;
                                            const total = sa.ratings.length;
                                            const confidentCount = sa.ratings.filter(r => r.confident).length;
                                            const confidentPct = total > 0 ? (confidentCount / total) * 100 : 0;
                                            const teacherAchieved = matchingHistory ? matchingHistory.score >= CEFR_ACHIEVE_THRESHOLD : null;
                                            const studentConfident = confidentPct >= CEFR_ACHIEVE_THRESHOLD;

                                            // Mismatch detection
                                            const mismatch = teacherAchieved !== null && teacherAchieved !== studentConfident;
                                            const overestimate = !teacherAchieved && studentConfident;
                                            const underestimate = teacherAchieved && !studentConfident;

                                            return (
                                                <div key={sa.id} style={{
                                                    padding: '14px 16px', borderRadius: 10,
                                                    border: `1px solid ${mismatch ? 'var(--border)' : 'var(--border)'}`,
                                                    background: 'var(--bg-elevated)',
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                                                        <div>
                                                            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 4 }}>{rubricName}</div>
                                                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                                {t('selfAssess.submitted_on')} {new Date(sa.submittedAt).toLocaleDateString()}
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                                            {/* Student self-score */}
                                                            <div style={{ textAlign: 'center' }}>
                                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{t('selfAssess.student_view')}</div>
                                                                <span style={{
                                                                    fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 10,
                                                                    background: studentConfident ? '#22c55e22' : 'var(--bg-elevated)',
                                                                    color: studentConfident ? '#22c55e' : 'var(--text-muted)',
                                                                    border: `1px solid ${studentConfident ? '#22c55e' : 'var(--border)'}`,
                                                                }}>
                                                                    {confidentCount}/{total} {t('selfAssess.confident_short')}
                                                                </span>
                                                            </div>
                                                            {/* Teacher score */}
                                                            {matchingHistory && (
                                                                <div style={{ textAlign: 'center' }}>
                                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{t('selfAssess.teacher_view')}</div>
                                                                    <span style={{
                                                                        fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 10,
                                                                        background: matchingHistory.summary.gradeColor + '22',
                                                                        color: matchingHistory.summary.gradeColor,
                                                                        border: `1px solid ${matchingHistory.summary.gradeColor}`,
                                                                    }}>
                                                                        {matchingHistory.score.toFixed(0)}%
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Mismatch flag */}
                                                    {mismatch && (
                                                        <div style={{
                                                            marginTop: 12, display: 'flex', alignItems: 'center', gap: 8,
                                                            padding: '8px 12px', borderRadius: 8,
                                                            background: overestimate ? '#f9731622' : '#3b82f622',
                                                            color: overestimate ? '#f97316' : '#3b82f6',
                                                            fontSize: 13,
                                                        }}>
                                                            <AlertTriangle size={14} />
                                                            {overestimate ? t('selfAssess.mismatch_overestimate') : t('selfAssess.mismatch_underestimate')}
                                                        </div>
                                                    )}

                                                    {/* Student reflection */}
                                                    {sa.reflection && (
                                                        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                                            &ldquo;{sa.reflection}&rdquo;
                                                        </div>
                                                    )}

                                                    {/* Navigate to self-assess page */}
                                                    <div style={{ marginTop: 10 }}>
                                                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}
                                                            onClick={() => navigate(`/rubrics/${sa.rubricId}/self-assess/${student.id}`)}>
                                                            <Link size={12} /> {t('selfAssess.view_full')}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })()}

                        <div className="card">
                            <h3 style={{ marginBottom: 14 }}>Rubric History</h3>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Rubric</th>
                                        <th>Score</th>
                                        <th>Grade</th>
                                        <th>Comment</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...history].reverse().map(h => (
                                        <tr key={h.sr.id}>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{h.dateStr}</td>
                                            <td style={{ fontWeight: 500 }}>{h.rubric.name}</td>
                                            <td>{h.score.toFixed(1)}% <span className="text-muted text-xs">({h.summary.rawScore}/{h.summary.maxRawScore})</span></td>
                                            <td>
                                                <span className="grade-chip" style={{ background: h.summary.gradeColor + '22', color: h.summary.gradeColor, border: `1.5px solid ${h.summary.gradeColor}` }}>
                                                    {h.summary.letterGrade}
                                                </span>
                                            </td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: 200 }} className="truncate">
                                                {h.sr.overallComment || '—'}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button className="btn btn-secondary btn-sm" onClick={() => handleExport(h)} disabled={exportingId === h.sr.id}>
                                                        {exportingId === h.sr.id ? <Loader size={14} className="spin" /> : <Download size={14} />} PDF
                                                    </button>
                                                    {(h.rubric.cefrTargetLevel || h.rubric.criteria?.some((c: any) => c.cefrDescriptors?.length > 0)) && (
                                                        <button
                                                            className="btn btn-ghost btn-icon btn-sm"
                                                            title={t('selfAssess.copy_link')}
                                                            style={{ color: copiedSALink === h.rubric.id ? 'var(--green, #22c55e)' : undefined }}
                                                            onClick={() => handleCopySALink(h.rubric.id)}
                                                        >
                                                            {copiedSALink === h.rubric.id ? <CheckCircle size={14} /> : <ClipboardCheck size={14} />}
                                                        </button>
                                                    )}
                                                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate(`/rubrics/${h.rubric.id}/peer-review/${student.id}`)} title="Self/Peer Review">
                                                        <User size={14} />
                                                    </button>
                                                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate(`/rubrics/${h.rubric.id}/grade/${student.id}`)} title="Edit Grade">
                                                        <FileText size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
