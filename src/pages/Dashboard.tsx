import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Users, FileText, Plus, ArrowRight, TrendingUp } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { calcGradeSummary } from '../utils/gradeCalc';

export default function Dashboard() {
    const navigate = useNavigate();
    const { rubrics, students, studentRubrics, gradeScales, settings } = useApp();

    const scale = useMemo(() =>
        gradeScales.find(g => g.id === settings.defaultGradeScaleId) ?? gradeScales[0],
        [gradeScales, settings.defaultGradeScaleId]
    );

    const recentRubrics = useMemo(() =>
        [...rubrics].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5),
        [rubrics]
    );

    const completedCount = useMemo(() => {
        return studentRubrics.filter(sr => {
            const rubric = rubrics.find(r => r.id === sr.rubricId);
            if (!rubric) return false;
            return sr.entries.every(e => e.levelId !== null || e.overridePoints !== undefined);
        }).length;
    }, [studentRubrics, rubrics]);

    return (
        <>
            <Topbar title="Dashboard" actions={
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/rubrics/new')}>
                    <Plus size={15} /> New Rubric
                </button>
            } />
            <div className="page-content fade-in">
                {/* Stat cards */}
                <div className="grid-3 mb-4">
                    <div className="card" style={{ borderTop: '3px solid var(--accent)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ background: 'var(--accent-soft)', padding: 10, borderRadius: 10 }}>
                                <BookOpen size={20} style={{ color: 'var(--accent)' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{rubrics.length}</div>
                                <div className="text-muted text-sm">Rubrics</div>
                            </div>
                        </div>
                    </div>
                    <div className="card" style={{ borderTop: '3px solid var(--green)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ background: 'rgba(34,197,94,0.12)', padding: 10, borderRadius: 10 }}>
                                <Users size={20} style={{ color: 'var(--green)' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{students.length}</div>
                                <div className="text-muted text-sm">Students</div>
                            </div>
                        </div>
                    </div>
                    <div className="card" style={{ borderTop: '3px solid var(--purple)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ background: 'rgba(139,92,246,0.12)', padding: 10, borderRadius: 10 }}>
                                <TrendingUp size={20} style={{ color: 'var(--purple)' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{completedCount}</div>
                                <div className="text-muted text-sm">Grades Submitted</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    {/* Recent Rubrics */}
                    <div className="card">
                        <div className="card-header">
                            <h3>Recent Rubrics</h3>
                            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/rubrics')}>
                                View all <ArrowRight size={14} />
                            </button>
                        </div>
                        {recentRubrics.length === 0 ? (
                            <div className="empty-state">
                                <BookOpen size={32} />
                                <p>No rubrics yet.</p>
                                <button className="btn btn-primary btn-sm" onClick={() => navigate('/rubrics/new')}>
                                    <Plus size={14} /> Create first rubric
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {recentRubrics.map(r => {
                                    const graded = studentRubrics.filter(sr => sr.rubricId === r.id).length;
                                    return (
                                        <div
                                            key={r.id}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 8, cursor: 'pointer' }}
                                            onClick={() => navigate(`/rubrics/${r.id}`)}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{r.name}</div>
                                                <div className="text-muted text-xs">{r.subject || 'No subject'} · {r.criteria.length} criteria</div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span className="badge badge-blue">{graded} graded</span>
                                                <ArrowRight size={15} style={{ color: 'var(--text-dim)' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Quick actions */}
                    <div className="card">
                        <h3 style={{ marginBottom: 16 }}>Quick Actions</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                { label: 'Create New Rubric', icon: BookOpen, color: 'var(--accent)', path: '/rubrics/new' },
                                { label: 'Add Student', icon: Users, color: 'var(--green)', path: '/students' },
                                { label: 'Upload Attachment', icon: FileText, color: 'var(--purple)', path: '/attachments' },
                                { label: 'Export to PDF', icon: FileText, color: 'var(--yellow)', path: '/export' },
                            ].map(({ label, icon: Icon, color, path }) => (
                                <button
                                    key={path}
                                    className="btn btn-secondary"
                                    onClick={() => navigate(path)}
                                    style={{ justifyContent: 'flex-start', gap: 12 }}
                                >
                                    <Icon size={16} style={{ color }} />
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
