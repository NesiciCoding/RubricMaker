import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    BookOpen,
    Users,
    FileText,
    Plus,
    ArrowRight,
    TrendingUp,
    CheckCircle,
    AlertTriangle,
    Clock,
} from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { QUICK_START_TEMPLATES } from '../data/templates';
import { calcGradeSummary } from '../utils/gradeCalc';
import { loadUserTemplates, saveUserTemplates } from '../store/storage';
import type { UserTemplate } from '../types';

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

    const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
    useEffect(() => {
        try {
            setUserTemplates(loadUserTemplates());
        } catch {
            /* ignore */
        }
    }, []);

    const scale = useMemo(
        () => gradeScales.find((g) => g.id === settings.defaultGradeScaleId) ?? gradeScales[0],
        [gradeScales, settings.defaultGradeScaleId]
    );

    const recentActivity = useMemo(() => {
        type GradeItem = {
            type: 'grading';
            timestamp: string;
            studentName: string;
            rubricName: string;
            rubricId: string;
            studentId: string;
        };
        type EditItem = { type: 'rubric_edit'; timestamp: string; rubricName: string; rubricId: string };
        type Item = GradeItem | EditItem;

        const gradings: GradeItem[] = studentRubrics
            .filter((sr) => sr.gradedAt)
            .map((sr) => ({
                type: 'grading' as const,
                timestamp: sr.gradedAt!,
                studentName: students.find((s) => s.id === sr.studentId)?.name ?? '?',
                rubricName: rubrics.find((r) => r.id === sr.rubricId)?.name ?? sr.rubricId,
                rubricId: sr.rubricId,
                studentId: sr.studentId,
            }));

        const edits: EditItem[] = rubrics.map((r) => ({
            type: 'rubric_edit' as const,
            timestamp: r.updatedAt,
            rubricName: r.name,
            rubricId: r.id,
        }));

        const all: Item[] = [...gradings, ...edits].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        // Deduplicate: for each rubric_edit, if there's a grading for the same rubric within the same second skip the edit
        const seen = new Set<string>();
        return all
            .filter((item) => {
                const key =
                    item.type === 'grading' ? `grading_${item.rubricId}_${item.studentId}` : `edit_${item.rubricId}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, 8);
    }, [studentRubrics, rubrics, students]);

    const completedCount = useMemo(() => {
        return studentRubrics.filter((sr) => {
            const rubric = rubrics.find((r) => r.id === sr.rubricId);
            if (!rubric) return false;
            return sr.entries.every((e) => e.levelId !== null || e.overridePoints !== undefined);
        }).length;
    }, [studentRubrics, rubrics]);

    // At-risk: students with 2+ recent grades below 55%, plus feedback age per student
    const { atRiskStudents, feedbackAge } = useMemo(() => {
        const AT_RISK_THRESHOLD = 55;
        const AT_RISK_MIN_GRADES = 2;

        // Map studentId → sorted list of recent grades (newest first)
        const gradesByStudent = new Map<string, { pct: number; gradedAt: string; rubricId: string }[]>();
        for (const sr of studentRubrics) {
            if (sr.notHandedIn || !sr.gradedAt) continue;
            const rubric = rubrics.find((r) => r.id === sr.rubricId) ?? sr.rubricSnapshot;
            if (!rubric) continue;
            const resolvedScaleId = rubric.gradeScaleId ?? scale?.id;
            const sc =
                resolvedScaleId && resolvedScaleId !== 'none'
                    ? (gradeScales.find((g) => g.id === resolvedScaleId) ?? null)
                    : null;
            const summary = calcGradeSummary(sr, rubric.criteria, sc);
            const list = gradesByStudent.get(sr.studentId) ?? [];
            list.push({ pct: summary.modifiedPercentage, gradedAt: sr.gradedAt, rubricId: sr.rubricId });
            gradesByStudent.set(sr.studentId, list);
        }

        const atRisk: { student: (typeof students)[0]; recentPct: number; gradedAt: string; rubricId: string }[] = [];
        const feedbackAgeMap = new Map<string, number>(); // studentId → days

        for (const [sid, grades] of gradesByStudent) {
            grades.sort((a, b) => b.gradedAt.localeCompare(a.gradedAt));
            const latest = grades[0];
            const daysSince = Math.floor((Date.now() - new Date(latest.gradedAt).getTime()) / 86_400_000);
            feedbackAgeMap.set(sid, daysSince);

            const recent = grades.slice(0, 3);
            const belowThreshold = recent.filter((g) => g.pct < AT_RISK_THRESHOLD);
            if (belowThreshold.length >= AT_RISK_MIN_GRADES) {
                const student = students.find((s) => s.id === sid);
                if (student)
                    atRisk.push({
                        student,
                        recentPct: latest.pct,
                        gradedAt: latest.gradedAt,
                        rubricId: latest.rubricId,
                    });
            }
        }

        return { atRiskStudents: atRisk.slice(0, 6), feedbackAge: feedbackAgeMap };
    }, [studentRubrics, rubrics, students, gradeScales, scale]);

    return (
        <>
            <Topbar
                title={t('dashboard.title')}
                actions={
                    <button className="btn btn-primary btn-sm" onClick={() => navigate('/rubrics/new')}>
                        <Plus size={15} /> {t('dashboard.new_rubric')}
                    </button>
                }
            />
            <div className="page-content fade-in dashboard-container">
                {/* Stat cards */}
                <div className="grid-3 mb-4">
                    <div
                        className="card hoverable"
                        onClick={() => navigate('/rubrics')}
                        style={{ borderTop: '3px solid var(--accent)', cursor: 'pointer' }}
                    >
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
                    <div
                        className="card hoverable"
                        onClick={() => navigate('/students')}
                        style={{ borderTop: '3px solid var(--green)', cursor: 'pointer' }}
                    >
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
                    <div
                        className="card hoverable"
                        data-tour="dashboard-grades"
                        onClick={() => navigate('/export')}
                        style={{ borderTop: '3px solid var(--purple)', cursor: 'pointer' }}
                    >
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

                {/* At-risk students panel */}
                {atRiskStudents.length > 0 && (
                    <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--red)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <AlertTriangle size={16} style={{ color: 'var(--red)' }} />
                            <h3 style={{ margin: 0, color: 'var(--red)' }}>At-Risk Students</h3>
                            <span className="text-muted text-xs" style={{ marginLeft: 4 }}>
                                (scored below 55% on 2+ recent assessments)
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {atRiskStudents.map(({ student, recentPct, rubricId }) => (
                                <button
                                    key={student.id}
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => navigate(`/rubrics/${rubricId}/grade/${student.id}`)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                                >
                                    <span style={{ fontWeight: 600 }}>{student.name}</span>
                                    <span style={{ color: 'var(--red)', fontSize: '0.78rem' }}>
                                        {recentPct.toFixed(0)}%
                                    </span>
                                    {feedbackAge.has(student.id) && feedbackAge.get(student.id)! >= 7 && (
                                        <span title={`Last feedback ${feedbackAge.get(student.id)} days ago`}>
                                            <Clock
                                                size={11}
                                                style={{
                                                    color:
                                                        feedbackAge.get(student.id)! >= 10
                                                            ? 'var(--red)'
                                                            : 'var(--yellow, #f59e0b)',
                                                }}
                                            />
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    {/* Recent Activity feed */}
                    <div className="card">
                        <div className="card-header" style={{ marginBottom: 14 }}>
                            <h3>{t('dashboard.recent_activity')}</h3>
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
                                    <div
                                        key={idx}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 12,
                                            padding: '9px 12px',
                                            background: 'var(--bg-elevated)',
                                            borderRadius: 8,
                                            border: '1px solid var(--border)',
                                        }}
                                    >
                                        <div style={{ flexShrink: 0 }}>
                                            {item.type === 'grading' ? (
                                                <CheckCircle size={16} style={{ color: 'var(--green)' }} />
                                            ) : (
                                                <BookOpen size={16} style={{ color: 'var(--accent)' }} />
                                            )}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {item.type === 'grading' ? (
                                                <div style={{ fontSize: '0.85rem' }}>
                                                    {t('dashboard.activity_graded_prefix', 'Graded')}{' '}
                                                    <strong>{item.studentName}</strong>
                                                    {' — '}
                                                    {item.rubricName}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.85rem' }}>
                                                    {t('dashboard.activity_updated_prefix', 'Updated')}{' '}
                                                    <strong>{item.rubricName}</strong>
                                                </div>
                                            )}
                                        </div>
                                        <span
                                            className="text-muted text-xs"
                                            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                                        >
                                            {item.type === 'grading' &&
                                                (() => {
                                                    const days = feedbackAge.get(item.studentId);
                                                    if (days === undefined) return null;
                                                    if (days >= 10)
                                                        return (
                                                            <span title={`${days}d ago — feedback may be stale`}>
                                                                <Clock size={11} style={{ color: 'var(--red)' }} />
                                                            </span>
                                                        );
                                                    if (days >= 7)
                                                        return (
                                                            <span title={`${days}d ago`}>
                                                                <Clock
                                                                    size={11}
                                                                    style={{ color: 'var(--yellow, #f59e0b)' }}
                                                                />
                                                            </span>
                                                        );
                                                    return null;
                                                })()}
                                            {timeAgo(item.timestamp)}
                                        </span>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            style={{ flexShrink: 0, fontSize: '0.75rem', padding: '3px 8px' }}
                                            onClick={() =>
                                                item.type === 'grading'
                                                    ? navigate(`/rubrics/${item.rubricId}/grade/${item.studentId}`)
                                                    : navigate(`/rubrics/${item.rubricId}`)
                                            }
                                        >
                                            {item.type === 'grading'
                                                ? t('dashboard.action_resume')
                                                : t('dashboard.action_open')}{' '}
                                            <ArrowRight size={12} />
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
                                    {
                                        label: t('dashboard.action_create_rubric'),
                                        icon: BookOpen,
                                        color: 'var(--accent)',
                                        path: '/rubrics/new',
                                    },
                                    {
                                        label: t('dashboard.action_add_student'),
                                        icon: Users,
                                        color: 'var(--green)',
                                        path: '/students',
                                    },
                                    {
                                        label: t('dashboard.action_upload_attachment'),
                                        icon: FileText,
                                        color: 'var(--purple)',
                                        path: '/attachments',
                                    },
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
                            <h3 style={{ marginBottom: 16 }}>{t('dashboard.quick_start_templates')}</h3>
                            {userTemplates.length > 0 && (
                                <>
                                    <div
                                        style={{
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                            color: 'var(--text-muted)',
                                            marginBottom: 8,
                                            letterSpacing: '0.04em',
                                        }}
                                    >
                                        {t('dashboard.my_templates', 'My Templates')}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                                        {userTemplates.map((tpl) => (
                                            <div
                                                key={tpl.id}
                                                style={{
                                                    padding: '10px 12px',
                                                    background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
                                                    border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                                                    borderRadius: 8,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    gap: 10,
                                                }}
                                                onClick={() => navigate('/rubrics/new', { state: { template: tpl } })}
                                                className="hoverable"
                                            >
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                                                        {tpl.name}
                                                    </div>
                                                    {tpl.subject && (
                                                        <div
                                                            style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}
                                                        >
                                                            {tpl.subject || t('dashboard.no_subject')}
                                                        </div>
                                                    )}
                                                </div>
                                                <button
                                                    className="btn btn-ghost btn-icon btn-sm"
                                                    style={{ color: 'var(--red)', flexShrink: 0 }}
                                                    title={t('dashboard.remove_template')}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const updated = userTemplates.filter((ut) => ut.id !== tpl.id);
                                                        saveUserTemplates(updated);
                                                        setUserTemplates(updated);
                                                    }}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                            color: 'var(--text-muted)',
                                            marginBottom: 8,
                                            letterSpacing: '0.04em',
                                        }}
                                    >
                                        {t('dashboard.builtin_templates')}
                                    </div>
                                </>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {QUICK_START_TEMPLATES.map((tpl, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            padding: '12px 14px',
                                            background: 'var(--bg-elevated)',
                                            borderRadius: 10,
                                            border: '1px solid var(--border)',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                        }}
                                        onClick={() => {
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            const newRubric = {
                                                ...tpl,
                                                id: undefined,
                                                createdAt: undefined,
                                                updatedAt: undefined,
                                            } as any;
                                            navigate('/rubrics/new', { state: { template: newRubric } });
                                        }}
                                        className="hoverable"
                                    >
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 2 }}>
                                            {tpl.name}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {tpl.subject}
                                        </div>
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
