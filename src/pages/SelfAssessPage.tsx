import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookOpen, Check, AlertCircle, Save, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import CefrBadge from '../components/CEFR/CefrBadge';
import { useApp } from '../context/AppContext';
import { nanoid } from '../utils/nanoid';
import { getCefrDescriptors, CEFR_SKILL_LABELS, CEFR_LEVEL_COLORS } from '../data/cefrDescriptors';
import type { CefrLevel, CefrSkill, SelfAssessment, SelfAssessmentRating, LinkedCefrDescriptor } from '../types';

export default function SelfAssessPage() {
    const { rubricId, studentId } = useParams();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';

    const { rubrics, students, selfAssessments, saveSelfAssessment } = useApp();

    const rubric = rubrics.find(r => r.id === rubricId);
    const student = students.find(s => s.id === studentId);

    // Collect all CEFR descriptors linked to this rubric's criteria (deduplicated)
    const linkedDescriptors = useMemo((): LinkedCefrDescriptor[] => {
        if (!rubric) return [];
        const seen = new Set<string>();
        const result: LinkedCefrDescriptor[] = [];
        for (const criterion of rubric.criteria) {
            for (const d of criterion.cefrDescriptors ?? []) {
                if (!seen.has(d.descriptorId)) {
                    seen.add(d.descriptorId);
                    result.push(d);
                }
            }
        }
        // Fallback: if rubric has a cefrTargetLevel but no linked descriptors, show all for that level/skill
        if (result.length === 0 && rubric.cefrTargetLevel) {
            const fallback = getCefrDescriptors({
                level: rubric.cefrTargetLevel,
                skill: rubric.cefrSkill,
            });
            fallback.forEach(d => result.push({
                descriptorId: d.id,
                level: d.level,
                skill: d.skill,
                descriptionEn: d.descriptionEn,
                descriptionNl: d.descriptionNl,
            }));
        }
        return result;
    }, [rubric]);

    // Group by skill → then by level
    const bySkill = useMemo(() => {
        const map = new Map<CefrSkill, LinkedCefrDescriptor[]>();
        for (const d of linkedDescriptors) {
            if (!map.has(d.skill)) map.set(d.skill, []);
            map.get(d.skill)!.push(d);
        }
        return map;
    }, [linkedDescriptors]);

    // Load existing self-assessment if present
    const existing = selfAssessments.find(sa => sa.rubricId === rubricId && sa.studentId === studentId);

    const [confident, setConfident] = useState<Set<string>>(
        new Set(existing?.ratings.filter(r => r.confident).map(r => r.descriptorId) ?? [])
    );
    const [reflection, setReflection] = useState(existing?.reflection ?? '');
    const [saved, setSaved] = useState(false);

    // Keep confident in sync if existing changes (e.g. navigating back)
    useEffect(() => {
        if (existing) {
            setConfident(new Set(existing.ratings.filter(r => r.confident).map(r => r.descriptorId)));
            setReflection(existing.reflection ?? '');
        }
    }, [existing?.id]);

    function toggleConfident(descriptorId: string) {
        setConfident(prev => {
            const next = new Set(prev);
            next.has(descriptorId) ? next.delete(descriptorId) : next.add(descriptorId);
            return next;
        });
        setSaved(false);
    }

    function handleSave() {
        const ratings: SelfAssessmentRating[] = linkedDescriptors.map(d => ({
            descriptorId: d.descriptorId,
            level: d.level,
            skill: d.skill,
            confident: confident.has(d.descriptorId),
        }));
        const sa: SelfAssessment = {
            id: existing?.id ?? nanoid(),
            rubricId: rubricId!,
            studentId: studentId!,
            ratings,
            reflection: reflection.trim() || undefined,
            submittedAt: new Date().toISOString(),
        };
        saveSelfAssessment(sa);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    }

    if (!rubric || !student) {
        return (
            <>
                <Topbar title={t('selfAssess.title')} actions={
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}><ArrowLeft size={14} /> {t('gradeStudent.action_back')}</button>
                } />
                <div className="page-content">
                    <div className="empty-state">
                        <AlertCircle size={36} />
                        <p>{t('gradeStudent.error_not_found')}</p>
                    </div>
                </div>
            </>
        );
    }

    if (linkedDescriptors.length === 0) {
        return (
            <>
                <Topbar title={t('selfAssess.title')} actions={
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}><ArrowLeft size={14} /> {t('gradeStudent.action_back')}</button>
                } />
                <div className="page-content">
                    <div className="empty-state">
                        <BookOpen size={36} />
                        <p>{t('selfAssess.no_descriptors')}</p>
                    </div>
                </div>
            </>
        );
    }

    const totalCount = linkedDescriptors.length;
    const confidentCount = confident.size;

    return (
        <>
            <Topbar
                title={t('selfAssess.title')}
                actions={
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
                            <ArrowLeft size={14} /> {t('gradeStudent.action_back')}
                        </button>
                        <button
                            className={`btn btn-sm ${saved ? 'btn-secondary' : 'btn-primary'}`}
                            onClick={handleSave}
                        >
                            {saved ? <Check size={14} /> : <Save size={14} />}
                            {saved ? t('gradeStudent.action_saved') : t('gradeStudent.action_save')}
                        </button>
                    </div>
                }
            />
            <div className="page-content fade-in">
                {/* Header */}
                <div className="card" style={{ marginBottom: 24, display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-soft)',
                        color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.4rem', fontWeight: 700, flexShrink: 0,
                    }}>
                        {student.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ margin: '0 0 4px' }}>{student.name}</h2>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <BookOpen size={14} /> {rubric.name}
                            </span>
                            {rubric.cefrTargetLevel && <CefrBadge level={rubric.cefrTargetLevel} size="sm" />}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent)' }}>{confidentCount}/{totalCount}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('selfAssess.confident_count')}</div>
                    </div>
                </div>

                {/* Intro */}
                <div className="card" style={{ marginBottom: 24, background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
                    <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text)' }}>
                        {t('selfAssess.instruction')}
                    </p>
                </div>

                {/* Descriptors grouped by skill */}
                {Array.from(bySkill.entries()).map(([skill, descriptors]) => {
                    const skillLabel = CEFR_SKILL_LABELS[skill]?.[lang] ?? skill;
                    return (
                        <div key={skill} className="card" style={{ marginBottom: 20 }}>
                            <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <BookOpen size={16} style={{ color: 'var(--accent)' }} />
                                {skillLabel}
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {descriptors.map(d => {
                                    const isConfident = confident.has(d.descriptorId);
                                    const text = lang === 'nl' ? d.descriptionNl : d.descriptionEn;
                                    const color = CEFR_LEVEL_COLORS[d.level];
                                    return (
                                        <button
                                            key={d.descriptorId}
                                            onClick={() => toggleConfident(d.descriptorId)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                gap: 14,
                                                padding: '14px 16px',
                                                borderRadius: 10,
                                                border: `2px solid ${isConfident ? color : 'var(--border)'}`,
                                                background: isConfident ? `${color}14` : 'var(--bg-elevated)',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                transition: 'border-color 0.15s, background 0.15s',
                                                width: '100%',
                                            }}
                                        >
                                            {/* Checkbox indicator */}
                                            <div style={{
                                                width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                                                border: `2px solid ${isConfident ? color : 'var(--border)'}`,
                                                background: isConfident ? color : 'transparent',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                marginTop: 1,
                                                transition: 'background 0.15s, border-color 0.15s',
                                            }}>
                                                {isConfident && <Check size={14} color="#fff" strokeWidth={3} />}
                                            </div>
                                            {/* Text + level badge */}
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.95rem', lineHeight: 1.5, color: 'var(--text)', fontWeight: isConfident ? 500 : 400 }}>
                                                    {text}
                                                </div>
                                                <div style={{ marginTop: 6 }}>
                                                    <CefrBadge level={d.level} size="sm" />
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}

                {/* Reflection */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <h3 style={{ marginBottom: 12 }}>{t('selfAssess.reflection_label')}</h3>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                        {t('selfAssess.reflection_help')}
                    </p>
                    <textarea
                        value={reflection}
                        onChange={e => { setReflection(e.target.value); setSaved(false); }}
                        placeholder={t('selfAssess.reflection_placeholder')}
                        style={{ width: '100%', minHeight: 100, resize: 'vertical', fontSize: '0.9rem', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text)', fontFamily: 'inherit' }}
                    />
                </div>

                {/* Save button (bottom) */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 32 }}>
                    <button
                        className={`btn btn-lg ${saved ? 'btn-secondary' : 'btn-primary'}`}
                        onClick={handleSave}
                        style={{ minWidth: 180, fontSize: '1rem' }}
                    >
                        {saved ? <Check size={18} /> : <Save size={18} />}
                        {saved ? t('gradeStudent.action_saved') : t('selfAssess.action_submit')}
                    </button>
                </div>
            </div>
        </>
    );
}
