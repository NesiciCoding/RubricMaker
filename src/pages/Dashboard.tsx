import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Users, FileText, Plus, ArrowRight, TrendingUp } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { calcGradeSummary } from '../utils/gradeCalc';

export default function Dashboard() {
    const { t } = useTranslation();
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
            <Topbar title={t('dashboard.title')} actions={
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/rubrics/new')}>
                    <Plus size={15} /> {t('dashboard.new_rubric')}
                </button>
            } />
            <div className="page-content fade-in">
                {/* Stat cards */}
                <div className="grid-3 mb-4">
                    <div className="card hoverable" onClick={() => navigate('/rubrics')} style={{ borderTop: '3px solid var(--accent)', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ background: 'var(--accent-soft)', padding: 10, borderRadius: 10 }}>
                                <BookOpen size={20} style={{ color: 'var(--accent)' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{rubrics.length}</div>
                                <div className="text-muted text-sm">{t('dashboard.rubrics')}</div>
                            </div>
                        </div>
                    </div>
                    <div className="card hoverable" onClick={() => navigate('/students')} style={{ borderTop: '3px solid var(--green)', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ background: 'rgba(34,197,94,0.12)', padding: 10, borderRadius: 10 }}>
                                <Users size={20} style={{ color: 'var(--green)' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{students.length}</div>
                                <div className="text-muted text-sm">{t('dashboard.students')}</div>
                            </div>
                        </div>
                    </div>
                    <div className="card hoverable" onClick={() => navigate('/export')} style={{ borderTop: '3px solid var(--purple)', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ background: 'rgba(139,92,246,0.12)', padding: 10, borderRadius: 10 }}>
                                <TrendingUp size={20} style={{ color: 'var(--purple)' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{completedCount}</div>
                                <div className="text-muted text-sm">{t('dashboard.grades_submitted')}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    {/* Recent Rubrics */}
                    <div className="card">
                        <div className="card-header">
                            <h3>{t('dashboard.recent_rubrics')}</h3>
                            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/rubrics')}>
                                {t('dashboard.view_all')} <ArrowRight size={14} />
                            </button>
                        </div>
                        {recentRubrics.length === 0 ? (
                            <div className="empty-state">
                                <BookOpen size={32} />
                                <p>{t('dashboard.no_rubrics')}</p>
                                <button className="btn btn-primary btn-sm" onClick={() => navigate('/rubrics/new')}>
                                    <Plus size={14} /> {t('dashboard.create_first')}
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
                                                <div className="text-muted text-xs">{r.subject || t('dashboard.no_subject')} · {r.criteria.length} {t('dashboard.criteria')}</div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span className="badge badge-blue">{graded} {t('dashboard.graded')}</span>
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
                        <h3 style={{ marginBottom: 16 }}>{t('dashboard.quick_actions')}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                { label: t('dashboard.action_create_rubric'), icon: BookOpen, color: 'var(--accent)', path: '/rubrics/new' },
                                { label: t('dashboard.action_add_student'), icon: Users, color: 'var(--green)', path: '/students' },
                                { label: t('dashboard.action_upload_attachment'), icon: FileText, color: 'var(--purple)', path: '/attachments' },
                                { label: t('dashboard.action_export_pdf'), icon: FileText, color: 'var(--yellow)', path: '/export' },
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
