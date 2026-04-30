import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Users, FileText, Plus, ArrowRight, TrendingUp, CheckCircle } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { QUICK_START_TEMPLATES } from '../data/templates';

function timeAgo(iso: string): string {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export default function Dashboard() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { rubrics, students, studentRubrics, gradeScales, settings } = useApp();

    const scale = useMemo(() =>
        gradeScales.find(g => g.id === settings.defaultGradeScaleId) ?? gradeScales[0],
        [gradeScales, settings.defaultGradeScaleId]
    );

    const recentActivity = useMemo(() => {
        type GradeItem = { type: 'grading'; timestamp: string; studentName: string; rubricName: string; rubricId: string; studentId: string };
        type EditItem  = { type: 'rubric_edit'; timestamp: string; rubricName: string; rubricId: string };
        type Item = GradeItem | EditItem;

        const gradings: GradeItem[] = studentRubrics
            .filter(sr => sr.gradedAt)
            .map(sr => ({
                type: 'grading' as const,
                timestamp: sr.gradedAt!,
                studentName: students.find(s => s.id === sr.studentId)?.name ?? '?',
                rubricName: rubrics.find(r => r.id === sr.rubricId)?.name ?? sr.rubricId,
                rubricId: sr.rubricId,
                studentId: sr.studentId,
            }));

        const edits: EditItem[] = rubrics.map(r => ({
            type: 'rubric_edit' as const,
            timestamp: r.updatedAt,
            rubricName: r.name,
            rubricId: r.id,
        }));

        const all: Item[] = [...gradings, ...edits]
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        // Deduplicate: for each rubric_edit, if there's a grading for the same rubric within the same second skip the edit
        const seen = new Set<string>();
        return all.filter(item => {
            const key = item.type === 'grading'
                ? `grading_${item.rubricId}_${item.studentId}`
                : `edit_${item.rubricId}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 8);
    }, [studentRubrics, rubrics, students]);

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
                    {/* Recent Activity feed */}
                    <div className="card">
                        <div className="card-header" style={{ marginBottom: 14 }}>
                            <h3>Recent Activity</h3>
                        </div>
                        {recentActivity.length === 0 ? (
                            <div className="empty-state">
                                <BookOpen size={32} />
                                <p>{t('dashboard.no_rubrics')}</p>
                                <button className="btn btn-primary btn-sm" onClick={() => navigate('/rubrics/new')}>
                                    <Plus size={14} /> {t('dashboard.create_first')}
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {recentActivity.map((item, idx) => (
                                    <div key={idx} style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '9px 12px', background: 'var(--bg-elevated)',
                                        borderRadius: 8, border: '1px solid var(--border)',
                                    }}>
                                        <div style={{ flexShrink: 0 }}>
                                            {item.type === 'grading'
                                                ? <CheckCircle size={16} style={{ color: 'var(--green)' }} />
                                                : <BookOpen size={16} style={{ color: 'var(--accent)' }} />
                                            }
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {item.type === 'grading' ? (
                                                <div style={{ fontSize: '0.85rem' }}>
                                                    Graded <strong>{item.studentName}</strong>
                                                    <span className="text-muted"> — {item.rubricName}</span>
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.85rem' }}>
                                                    Updated <strong>{item.rubricName}</strong>
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-muted text-xs" style={{ flexShrink: 0 }}>
                                            {timeAgo(item.timestamp)}
                                        </span>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            style={{ flexShrink: 0, fontSize: '0.75rem', padding: '3px 8px' }}
                                            onClick={() => item.type === 'grading'
                                                ? navigate(`/rubrics/${item.rubricId}/grade/${item.studentId}`)
                                                : navigate(`/rubrics/${item.rubricId}`)
                                            }
                                        >
                                            {item.type === 'grading' ? 'Resume' : 'Open'} <ArrowRight size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Quick actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div className="card">
                            <h3 style={{ marginBottom: 16 }}>{t('dashboard.quick_actions')}</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {[
                                    { label: t('dashboard.action_create_rubric'), icon: BookOpen, color: 'var(--accent)', path: '/rubrics/new' },
                                    { label: t('dashboard.action_add_student'), icon: Users, color: 'var(--green)', path: '/students' },
                                    { label: t('dashboard.action_upload_attachment'), icon: FileText, color: 'var(--purple)', path: '/attachments' },
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

                        <div className="card">
                            <h3 style={{ marginBottom: 16 }}>Quick Start Templates</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {QUICK_START_TEMPLATES.map((tpl, i) => (
                                    <div
                                        key={i}
                                        style={{ padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.2s' }}
                                        onClick={() => {
                                            const newRubric = { ...tpl, id: undefined, createdAt: undefined, updatedAt: undefined } as any;
                                            navigate('/rubrics/new', { state: { template: newRubric } });
                                        }}
                                        className="hoverable"
                                    >
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 2 }}>{tpl.name}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{tpl.subject}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
