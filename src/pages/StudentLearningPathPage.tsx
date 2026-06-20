import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, AlertTriangle, Users, ExternalLink, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import CefrBadge from '../components/CEFR/CefrBadge';
import { useApp } from '../context/AppContext';
import { getCefrStudentOverview } from '../utils/cefrStudentAggregator';
import {
    getLearningPathRecommendations,
    buildCohortAverages,
    getCriterionInterventionFlags,
    getCefrSkillInterventionFlags,
} from '../utils/learningPathAggregator';
import { CEFR_SKILL_LABELS } from '../data/cefrDescriptors';
import type { InterventionFlag } from '../types';

export default function StudentLearningPathPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { students, classes, rubrics, studentRubrics, selfAssessments, analysisResults, settings } = useApp();
    const { t, i18n } = useTranslation();
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';

    const student = students.find((s) => s.id === id);
    const cls = classes.find((c) => c.id === student?.classId);

    const cohortStudents = useMemo(
        () => (cls ? students.filter((s) => s.classId === cls.id) : []),
        [students, cls]
    );

    const studentOverview = useMemo(
        () =>
            student
                ? getCefrStudentOverview(student.id, studentRubrics, rubrics, selfAssessments, analysisResults)
                : null,
        [student, studentRubrics, rubrics, selfAssessments, analysisResults]
    );

    const cohortAverages = useMemo(() => {
        const allCells = cohortStudents.map(
            (s) => getCefrStudentOverview(s.id, studentRubrics, rubrics, selfAssessments, analysisResults).cells
        );
        return buildCohortAverages(allCells);
    }, [cohortStudents, studentRubrics, rubrics, selfAssessments, analysisResults]);

    const achievedRubricIds = useMemo(() => {
        if (!student) return new Set<string>();
        return new Set(
            studentRubrics.filter((sr) => sr.studentId === student.id && sr.gradedAt).map((sr) => sr.rubricId)
        );
    }, [student, studentRubrics]);

    const recommendations = useMemo(() => {
        if (!student || !studentOverview) return [];
        return getLearningPathRecommendations(
            student.id,
            studentOverview.cells,
            cohortAverages,
            rubrics,
            achievedRubricIds
        );
    }, [student, studentOverview, cohortAverages, rubrics, achievedRubricIds]);

    const criterionFlags = useMemo(
        () => (student ? getCriterionInterventionFlags(student.id, studentRubrics, rubrics) : []),
        [student, studentRubrics, rubrics]
    );

    const cefrSkillFlags = useMemo(
        () => (student ? getCefrSkillInterventionFlags(student.id, studentRubrics, rubrics) : []),
        [student, studentRubrics, rubrics]
    );

    const allFlags = useMemo(
        () =>
            [...criterionFlags, ...cefrSkillFlags].sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt)),
        [criterionFlags, cefrSkillFlags]
    );

    function flagLabel(flag: InterventionFlag): string {
        if (flag.kind === 'cefrSkill') {
            const skillLabel = CEFR_SKILL_LABELS[flag.targetId as keyof typeof CEFR_SKILL_LABELS]?.[lang];
            return skillLabel ?? flag.targetId;
        }
        for (const rubric of rubrics) {
            const criterion = rubric.criteria.find((c) => c.id === flag.targetId);
            if (criterion) return criterion.title;
        }
        return flag.targetId;
    }

    if (!student) {
        return (
            <>
                <Topbar
                    title={t('learningPath.page_title')}
                    actions={
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/students')}>
                            <ArrowLeft size={14} /> {t('learningPath.back_to_profile')}
                        </button>
                    }
                />
                <div className="page-content fade-in">
                    <div className="empty-state">
                        <Users size={32} />
                        <p>{t('learningPath.student_not_found')}</p>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Topbar
                title={t('learningPath.page_title')}
                actions={
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigate(`/students/${student.id}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                        <ArrowLeft size={14} /> {t('learningPath.back_to_profile')}
                    </button>
                }
            />
            <div className="page-content fade-in">
                <div className="card" style={{ marginBottom: 24, display: 'flex', gap: 20, alignItems: 'center' }}>
                    <div
                        style={{
                            width: 64,
                            height: 64,
                            borderRadius: '50%',
                            background: 'var(--accent-soft)',
                            color: 'var(--accent)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.6rem',
                            fontWeight: 700,
                            flexShrink: 0,
                        }}
                    >
                        {student.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h2 style={{ margin: '0 0 6px', fontSize: '1.4rem' }}>{student.name}</h2>
                        {cls && <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{cls.name}</div>}
                    </div>
                </div>

                <div className="card" style={{ marginBottom: 24 }}>
                    <h3 style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TrendingUp size={18} style={{ color: 'var(--accent)' }} />
                        {t('learningPath.recommendations_title')}
                    </h3>
                    <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
                        {t('learningPath.recommendations_subtitle')}
                    </p>

                    {recommendations.length === 0 ? (
                        <div className="empty-state" style={{ padding: '32px 20px' }}>
                            <BookOpen size={28} style={{ opacity: 0.4 }} />
                            <p>{t('learningPath.recommendations_empty')}</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {recommendations.map((rec) => {
                                const skillLabel = CEFR_SKILL_LABELS[rec.skill]?.[lang] ?? rec.skill;
                                return (
                                    <div
                                        key={`${rec.skill}__${rec.level}`}
                                        style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            alignItems: 'center',
                                            gap: 12,
                                            padding: '12px 14px',
                                            borderRadius: 10,
                                            border: '1px solid var(--border)',
                                            background: 'var(--bg-elevated)',
                                        }}
                                    >
                                        <CefrBadge
                                            level={rec.level}
                                            size="md"
                                            showCambridgeLabel={settings.showCambridgeLabels}
                                        />
                                        <span style={{ fontWeight: 600, fontSize: '0.9rem', minWidth: 110 }}>
                                            {skillLabel}
                                        </span>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            {t('learningPath.gap_summary', {
                                                studentScore: rec.studentScore.toFixed(0),
                                                cohortAverage: rec.cohortAverage.toFixed(0),
                                            })}
                                        </span>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginLeft: 'auto' }}>
                                            {rec.suggestedRubricIds.length === 0 ? (
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                    {t('learningPath.no_suggested_rubrics')}
                                                </span>
                                            ) : (
                                                rec.suggestedRubricIds.map((rubricId) => {
                                                    const rubric = rubrics.find((r) => r.id === rubricId);
                                                    if (!rubric) return null;
                                                    return (
                                                        <button
                                                            key={rubricId}
                                                            className="btn btn-secondary btn-sm"
                                                            onClick={() => navigate(`/rubrics/${rubricId}`)}
                                                        >
                                                            <ExternalLink size={12} /> {rubric.name}
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="card">
                    <h3 style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={18} style={{ color: 'var(--accent)' }} />
                        {t('learningPath.interventions_title')}
                    </h3>
                    <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
                        {t('learningPath.interventions_subtitle')}
                    </p>

                    {allFlags.length === 0 ? (
                        <div className="empty-state" style={{ padding: '32px 20px' }}>
                            <AlertTriangle size={28} style={{ opacity: 0.4 }} />
                            <p>{t('learningPath.interventions_empty')}</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {allFlags.map((flag, idx) => (
                                <div
                                    key={`${flag.kind}-${flag.targetId}-${idx}`}
                                    style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        alignItems: 'center',
                                        gap: 12,
                                        padding: '12px 14px',
                                        borderRadius: 10,
                                        border: '1px solid var(--border)',
                                        background: 'var(--bg-elevated)',
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            padding: '2px 8px',
                                            borderRadius: 10,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.04em',
                                            background: 'var(--bg-card)',
                                            color: 'var(--text-muted)',
                                            border: '1px solid var(--border)',
                                        }}
                                    >
                                        {flag.kind === 'criterion'
                                            ? t('learningPath.flag_kind_criterion')
                                            : t('learningPath.flag_kind_cefr_skill')}
                                    </span>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{flagLabel(flag)}</span>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        {t('learningPath.flag_streak', { count: flag.streakLength })}
                                    </span>
                                    <span
                                        style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: 'auto' }}
                                    >
                                        {t('learningPath.flag_scores', {
                                            scores: flag.scores.map((s) => s.toFixed(0)).join(', '),
                                        })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
