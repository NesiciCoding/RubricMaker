import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, Users, BookOpen } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { calcGradeSummary, calcClassStats, calcEntryPoints } from '../utils/gradeCalc';
import { getClassGoalScores } from '../utils/learningGoalsAggregator';
import LearningGoalChart from '../components/Statistics/LearningGoalChart';

export default function StatisticsPage() {
    const { rubrics, students, classes, studentRubrics, gradeScales, settings } = useApp();
    const [selectedRubricId, setSelectedRubricId] = useState(rubrics[0]?.id ?? '');
    const [selectedClassId, setSelectedClassId] = useState<string>('all');

    const [viewMode, setViewMode] = useState<'rubric' | 'student'>('rubric');
    const [selectedStudentId, setSelectedStudentId] = useState<string>('');

    const [sortKey, setSortKey] = useState<'name' | 'score' | 'raw' | 'grade' | 'progress'>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    function handleSort(key: typeof sortKey) {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir(key === 'name' ? 'asc' : 'desc');
        }
    }

    const rubric = rubrics.find(r => r.id === selectedRubricId);
    const scale = gradeScales.find(g => g.id === (rubric?.gradeScaleId ?? settings.defaultGradeScaleId)) ?? gradeScales[0];

    const summaries = useMemo(() => {
        if (!rubric) return [];
        return studentRubrics
            .filter(sr => {
                if (sr.rubricId !== rubric.id) return false;
                if (selectedClassId === 'all') return true;
                const student = students.find(s => s.id === sr.studentId);
                return student?.classId === selectedClassId;
            })
            .map(sr => calcGradeSummary(sr, rubric.criteria, scale, rubric));
    }, [rubric, studentRubrics, scale, selectedClassId, students]);

    const stats = useMemo(() => calcClassStats(summaries, scale), [summaries, scale]);

    const criterionStats = useMemo(() => {
        if (!rubric) return [];
        return rubric.criteria.map(c => {
            const scores = studentRubrics
                .filter(sr => {
                    if (sr.rubricId !== rubric.id) return false;
                    if (selectedClassId === 'all') return true;
                    const student = students.find(s => s.id === sr.studentId);
                    return student?.classId === selectedClassId;
                })
                .map(sr => {
                    const entry = sr.entries.find(e => e.criterionId === c.id);
                    if (!entry) return 0;
                    return calcEntryPoints(entry, c);
                });
            const max = Math.max(...c.levels.map(l => l.maxPoints), 1);
            const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
            return { name: c.title, avg: parseFloat(((avg / max) * 100).toFixed(1)), max };
        });
    }, [rubric, studentRubrics, selectedClassId, students]);

    const classGoals = useMemo(() => {
        if (selectedClassId === 'all') return [];
        return getClassGoalScores(selectedClassId, students, studentRubrics, rubrics);
    }, [selectedClassId, students, studentRubrics, rubrics]);

    const tableData = useMemo(() => {
        if (!rubric) return [];
        const data = studentRubrics
            .filter(sr => sr.rubricId === rubric.id)
            .map(sr => {
                const student = students.find(s => s.id === sr.studentId);
                const r = sr.rubricSnapshot || rubric;
                const summary = calcGradeSummary(sr, r.criteria, scale, r);
                return { sr, student, summary };
            })
            .filter((d): d is { sr: any, student: any, summary: any } => !!d.student && !!d.summary);

        return data.sort((a, b) => {
            let valA: any, valB: any;
            if (sortKey === 'name') {
                valA = a.student.name.toLowerCase();
                valB = b.student.name.toLowerCase();
            } else if (sortKey === 'score') {
                valA = a.summary.modifiedPercentage;
                valB = b.summary.modifiedPercentage;
            } else if (sortKey === 'raw') {
                valA = a.summary.rawScore;
                valB = b.summary.rawScore;
            } else if (sortKey === 'grade') {
                valA = a.summary.letterGrade;
                valB = b.summary.letterGrade;
            } else if (sortKey === 'progress') {
                valA = a.summary.gradedCount / (a.summary.totalCriteria || 1);
                valB = b.summary.gradedCount / (b.summary.totalCriteria || 1);
            }

            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }, [rubric, studentRubrics, students, scale, sortKey, sortDir]);

    const studentViewTableData = useMemo(() => {
        if (viewMode !== 'student' || !selectedStudentId) return [];
        const records = studentRubrics.filter(sr => sr.studentId === selectedStudentId);
        return records.map(sr => {
            const liveR = rubrics.find(rid => rid.id === sr.rubricId);
            const r = sr.rubricSnapshot || liveR;
            if (!r) return null;
            const gScale = gradeScales.find(g => g.id === (r.gradeScaleId ?? settings.defaultGradeScaleId)) ?? gradeScales[0];
            const summary = calcGradeSummary(sr, r.criteria, gScale, r);
            return { sr, rubric: r, summary };
        }).filter((d): d is { sr: any, rubric: any, summary: any } => !!d);
    }, [viewMode, selectedStudentId, studentRubrics, rubrics, gradeScales, settings.defaultGradeScaleId]);

    return (
        <>
            <Topbar title="Statistics" />
            <div className="page-content fade-in">
                <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>View Mode</label>
                        <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: 8, padding: 4 }}>
                            <button className={`btn btn-sm ${viewMode === 'rubric' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode('rubric')}>By Rubric</button>
                            <button className={`btn btn-sm ${viewMode === 'student' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode('student')}>By Student</button>
                        </div>
                    </div>
                    {viewMode === 'rubric' ? (
                        <>
                            <div className="form-group" style={{ flex: 1, maxWidth: 320, marginBottom: 0 }}>
                                <label>Rubric</label>
                                <select value={selectedRubricId} onChange={e => setSelectedRubricId(e.target.value)}>
                                    {rubrics.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ flex: 1, maxWidth: 240, marginBottom: 0 }}>
                                <label>Class Filter</label>
                                <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}>
                                    <option value="all">All Classes</option>
                                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="form-group" style={{ flex: 1, maxWidth: 240, marginBottom: 0 }}>
                                <label>Class Filter</label>
                                <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}>
                                    <option value="all">All Classes</option>
                                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ flex: 1, maxWidth: 320, marginBottom: 0 }}>
                                <label>Student</label>
                                <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)}>
                                    <option value="" disabled>Select a student...</option>
                                    {students.filter(s => selectedClassId === 'all' || s.classId === selectedClassId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                        </>
                    )}
                </div>

                {viewMode === 'rubric' ? (
                    <>
                        {selectedClassId !== 'all' && classGoals.length > 0 && (
                            <LearningGoalChart goals={classGoals} />
                        )}

                        {summaries.length === 0 ? (
                            <div className="empty-state">
                                <TrendingUp size={36} />
                                <p>No graded students yet for this rubric.</p>
                            </div>
                        ) : (
                            <>
                                {/* Stat cards */}
                                <div className="grid-5" style={{ marginBottom: 24 }}>
                                    {[
                                        { label: 'Students Graded', value: summaries.length, color: 'var(--accent)' },
                                        { label: 'Average', value: `${stats.average.toFixed(1)}%`, color: 'var(--green)' },
                                        { label: 'Median', value: `${stats.median.toFixed(1)}%`, color: 'var(--cyan)' },
                                        { label: 'Highest', value: `${stats.highest.toFixed(1)}%`, color: 'var(--purple)' },
                                        { label: 'Lowest', value: `${stats.lowest.toFixed(1)}%`, color: 'var(--yellow)' },
                                    ].map(({ label, value, color }) => (
                                        <div key={label} className="card" style={{ borderTop: `3px solid ${color}` }}>
                                            <div style={{ fontSize: '1.6rem', fontWeight: 700, color }}>{value}</div>
                                            <div className="text-muted text-sm" style={{ marginTop: 4 }}>{label}</div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                                    {/* Grade distribution chart */}
                                    <div className="card">
                                        <h3 style={{ marginBottom: 16 }}>Grade Distribution</h3>
                                        <ResponsiveContainer width="100%" height={240}>
                                            <BarChart data={stats.distribution} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                                                <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                                                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} allowDecimals={false} />
                                                <Tooltip
                                                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
                                                    labelStyle={{ color: 'var(--text)', fontWeight: 600 }}
                                                    itemStyle={{ color: 'var(--text-muted)' }}
                                                />
                                                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                                    {stats.distribution.map((entry, i) => (
                                                        <Cell key={i} fill={entry.color} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Per-criterion chart */}
                                    <div className="card">
                                        <h3 style={{ marginBottom: 16 }}>Per-Criterion Average (%)</h3>
                                        <ResponsiveContainer width="100%" height={240}>
                                            <BarChart data={criterionStats} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                                                <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                                <YAxis type="category" dataKey="name" width={100} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                                <Tooltip
                                                    formatter={(v: number) => `${v}%`}
                                                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
                                                />
                                                <Bar dataKey="avg" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Student scores table */}
                                <div className="card">
                                    <h3 style={{ marginBottom: 14 }}>Student Scores</h3>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                                                    Student {sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                                </th>
                                                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('score')}>
                                                    Score % {sortKey === 'score' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                                </th>
                                                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('raw')}>
                                                    Raw {sortKey === 'raw' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                                </th>
                                                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('grade')}>
                                                    Grade {sortKey === 'grade' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                                </th>
                                                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('progress')}>
                                                    Criteria Done {sortKey === 'progress' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tableData.map(({ sr, student, summary }) => (
                                                <tr key={sr.id} style={{ borderLeft: `4px solid ${summary.gradeColor}`, background: `${summary.gradeColor}08` }}>
                                                    <td style={{ fontWeight: 500, paddingLeft: 16 }}>{student.name}</td>
                                                    <td>{summary.modifiedPercentage.toFixed(1)}%</td>
                                                    <td>{summary.rawScore}/{summary.maxRawScore}</td>
                                                    <td>
                                                        <span style={{ color: summary.gradeColor, fontWeight: 700 }}>{summary.letterGrade}</span>
                                                    </td>
                                                    <td>{summary.gradedCount}/{summary.totalCriteria}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    // Student View Mode
                    <>
                        {!selectedStudentId ? (
                            <div className="empty-state">
                                <Users size={36} />
                                <p>Select a student to view their statistics.</p>
                            </div>
                        ) : studentViewTableData.length === 0 ? (
                            <div className="empty-state">
                                <BookOpen size={36} />
                                <p>This student hasn't been graded on any rubrics yet.</p>
                            </div>
                        ) : (
                            <div className="card">
                                <h3 style={{ marginBottom: 14 }}>Graded Rubrics</h3>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Rubric</th>
                                            <th>Subject</th>
                                            <th>Score %</th>
                                            <th>Raw</th>
                                            <th>Grade</th>
                                            <th>Date Graded</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {studentViewTableData.map(({ sr, rubric: r, summary }) => (
                                            <tr key={sr.id} style={{ borderLeft: `4px solid ${summary.gradeColor}`, background: `${summary.gradeColor}08` }}>
                                                <td style={{ fontWeight: 500, paddingLeft: 16 }}>{r.name}</td>
                                                <td className="text-muted text-sm">{r.subject || '—'}</td>
                                                <td>{summary.modifiedPercentage.toFixed(1)}%</td>
                                                <td>{summary.rawScore}/{summary.maxRawScore}</td>
                                                <td>
                                                    <span style={{ color: summary.gradeColor, fontWeight: 700 }}>{summary.letterGrade}</span>
                                                </td>
                                                <td className="text-muted text-sm">{new Date(sr.gradedAt || new Date()).toLocaleDateString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    );
}
