import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { ArrowLeft, User, Calendar, FileText, Download, TrendingUp, Award, Loader } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { calcGradeSummary } from '../utils/gradeCalc';
import { exportSinglePdf } from '../utils/pdfExport';

export default function StudentProfilePage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { students, classes, rubrics, studentRubrics, gradeScales, settings } = useApp();
    const [exportingId, setExportingId] = useState<string | null>(null);

    const student = students.find(s => s.id === id);
    const cls = classes.find(c => c.id === student?.classId);

    const history = useMemo(() => {
        if (!student) return [];
        const srs = studentRubrics.filter(sr => sr.studentId === student.id && sr.gradedAt);
        // Sort ascending by gradedAt for chronological chart
        const sorted = [...srs].sort((a, b) => new Date(a.gradedAt!).getTime() - new Date(b.gradedAt!).getTime());

        return sorted.map(sr => {
            const rubric = rubrics.find(r => r.id === sr.rubricId);
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

    const handleExport = async (h: any) => {
        setExportingId(h.sr.id);
        try {
            await exportSinglePdf(h.sr, h.rubric, student, h.scale);
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
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={14} /> {cls?.name || 'Unknown Class'}</span>
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
