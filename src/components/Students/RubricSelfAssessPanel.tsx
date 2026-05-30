import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import type { StudentRubric, Rubric, RubricCriterion } from '../../types';

interface Props {
    sr: StudentRubric;
    rubric: Rubric;
    onSave: (levels: Record<string, string | null>, reflection: string) => void;
}

export default function RubricSelfAssessPanel({ sr, rubric, onSave }: Props) {
    const { t } = useTranslation();
    const criteria: RubricCriterion[] = sr.rubricSnapshot?.criteria ?? rubric.criteria;

    const [selections, setSelections] = useState<Record<string, string | null>>(sr.selfAssessmentLevels ?? {});
    const [reflection, setReflection] = useState(sr.selfAssessmentReflection ?? '');
    const [saved, setSaved] = useState(false);

    const handleSave = () => {
        onSave(selections, reflection);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div
            style={{
                marginTop: 12,
                padding: '16px',
                background: 'var(--bg-panel)',
                borderRadius: 8,
                border: '1px solid var(--border)',
            }}
        >
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                {t('studentPortal.self_assess_instruction')}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {criteria.map((criterion) => {
                    const teacherEntry = sr.entries.find((e) => e.criterionId === criterion.id);
                    const teacherLevel = teacherEntry?.levelId
                        ? criterion.levels.find((l) => l.id === teacherEntry.levelId)
                        : null;

                    return (
                        <div key={criterion.id}>
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                                {criterion.title}
                            </div>
                            {!sr.feedbackOnly && teacherLevel && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                                    {t('studentPortal.self_assess_teacher_grade', { level: teacherLevel.label })}
                                </div>
                            )}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {criterion.levels.map((level) => {
                                    const selected = selections[criterion.id] === level.id;
                                    return (
                                        <button
                                            key={level.id}
                                            onClick={() =>
                                                setSelections((prev) => ({
                                                    ...prev,
                                                    [criterion.id]: selected ? null : level.id,
                                                }))
                                            }
                                            style={{
                                                padding: '4px 10px',
                                                fontSize: 12,
                                                borderRadius: 6,
                                                border: selected
                                                    ? '2px solid var(--accent)'
                                                    : '1px solid var(--border)',
                                                background: selected
                                                    ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                                                    : 'var(--bg-elevated)',
                                                color: selected ? 'var(--accent)' : 'var(--text)',
                                                cursor: 'pointer',
                                                fontWeight: selected ? 600 : 400,
                                                transition: 'border-color 0.15s, background 0.15s',
                                            }}
                                        >
                                            {level.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    {t('studentPortal.self_assess_reflection_label')}
                </label>
                <textarea
                    value={reflection}
                    onChange={(e) => setReflection(e.target.value)}
                    placeholder={t('studentPortal.self_assess_reflection_placeholder')}
                    rows={3}
                    style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '8px 10px',
                        fontSize: 13,
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'var(--bg-elevated)',
                        color: 'var(--text)',
                        resize: 'vertical',
                    }}
                />
            </div>

            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={handleSave}>
                    {t('studentPortal.self_assess_save')}
                </button>
                {saved && (
                    <span style={{ fontSize: 13, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={14} />
                        {t('studentPortal.self_assess_saved')}
                    </span>
                )}
            </div>
        </div>
    );
}
