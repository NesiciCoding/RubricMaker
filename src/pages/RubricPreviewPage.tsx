import React from 'react';
import { useParams } from 'react-router-dom';
import { decodeRubricShareCode } from '../utils/rubricImport';

export default function RubricPreviewPage() {
    const { code } = useParams<{ code: string }>();

    let rubric: ReturnType<typeof decodeRubricShareCode> | null = null;
    try {
        rubric = code ? decodeRubricShareCode(code) : null;
    } catch {
        rubric = null;
    }

    if (!rubric) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 24 }}>
                <div style={{ maxWidth: 480, textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                    <h2 style={{ marginBottom: 8 }}>Invalid rubric link</h2>
                    <p style={{ color: '#64748b' }}>This link is no longer valid. Please ask your teacher for a new link.</p>
                </div>
            </div>
        );
    }

    const fmt = rubric.format as { accentColor?: string; fontFamily?: string; headerColor?: string; headerTextColor?: string; showPoints?: boolean } | undefined;
    const accentColor = fmt?.accentColor ?? '#6366f1';
    const headerColor = fmt?.headerColor ?? '#1e293b';
    const headerTextColor = fmt?.headerTextColor ?? '#ffffff';
    const fontFamily = fmt?.fontFamily ?? 'Inter, system-ui, sans-serif';
    const showPoints = fmt?.showPoints ?? false;

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '24px 16px', fontFamily }}>
            <div style={{ maxWidth: 900, margin: '0 auto' }}>

                {/* Header */}
                <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 20, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                    <div style={{ display: 'inline-block', background: accentColor + '18', color: accentColor, borderRadius: 20, padding: '3px 12px', fontSize: '0.75rem', fontWeight: 600, marginBottom: 10 }}>
                        Assessment Rubric
                    </div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>{rubric.name}</h1>
                    {rubric.subject && <div style={{ color: '#64748b', marginTop: 4 }}>{rubric.subject}</div>}
                    {rubric.description && <p style={{ margin: '10px 0 0', color: '#475569', fontSize: '0.9rem', lineHeight: 1.6 }}>{rubric.description}</p>}
                </div>

                {/* Criteria */}
                {rubric.criteria.map((criterion, ci) => (
                    <div key={criterion.id ?? ci} style={{ background: '#fff', borderRadius: 12, marginBottom: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,.06)', overflow: 'hidden' }}>
                        {/* Criterion header */}
                        <div style={{ background: headerColor, color: headerTextColor, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{criterion.title}</div>
                                {criterion.description && <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: 2 }}>{criterion.description}</div>}
                            </div>
                            {criterion.weight !== undefined && (
                                <div style={{ fontSize: '0.8rem', opacity: 0.7, marginLeft: 16, whiteSpace: 'nowrap' }}>Weight: {criterion.weight}%</div>
                            )}
                        </div>

                        {/* Levels grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${criterion.levels?.length ?? 4}, 1fr)`, gap: 0 }}>
                            {(criterion.levels ?? []).map((level, li) => (
                                <div key={level.id ?? li} style={{
                                    padding: '14px 16px',
                                    borderRight: li < (criterion.levels?.length ?? 1) - 1 ? '1px solid #e2e8f0' : 'none',
                                    borderTop: '1px solid #e2e8f0',
                                }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b', marginBottom: 6 }}>
                                        {level.label}
                                        {showPoints && (
                                            <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: '0.75rem', marginLeft: 6 }}>
                                                {level.minPoints === level.maxPoints ? `${level.maxPoints}pt` : `${level.minPoints}–${level.maxPoints}pt`}
                                            </span>
                                        )}
                                    </div>
                                    {level.description && (
                                        <div style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>
                                            {level.description}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {/* Footer */}
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem', marginTop: 24, paddingBottom: 24 }}>
                    Generated by RubricMaker · Review this rubric before submitting your work
                </div>
            </div>
        </div>
    );
}
