import React from 'react';
import { useParams } from 'react-router-dom';
import { decodeFeedbackCode } from '../utils/studentShareCode';
import { calcGradeSummary } from '../utils/gradeCalc';

export default function StudentFeedbackPage() {
    const { code } = useParams<{ code: string }>();
    const data = code ? decodeFeedbackCode(code) : null;

    if (!data) {
        return (
            <div
                style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f8fafc',
                    padding: 24,
                }}
            >
                <div style={{ maxWidth: 480, textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                    <h2 style={{ marginBottom: 8 }}>Invalid or expired link</h2>
                    <p style={{ color: '#64748b' }}>
                        This feedback link is no longer valid. Please ask your teacher for a new link.
                    </p>
                </div>
            </div>
        );
    }

    const { sr, rubric, student, scale } = data;
    const summary = calcGradeSummary(sr, rubric.criteria, scale);
    const fmt = rubric.format;
    const accentColor = fmt?.accentColor ?? '#6366f1';
    const showGrade = !sr.feedbackOnly;

    return (
        <div
            style={{
                minHeight: '100vh',
                background: '#f8fafc',
                padding: '24px 16px',
                fontFamily: fmt?.fontFamily ?? 'Inter, system-ui, sans-serif',
            }}
        >
            <div style={{ maxWidth: 760, margin: '0 auto' }}>
                {/* Header */}
                <div
                    style={{
                        background: '#fff',
                        borderRadius: 12,
                        padding: 24,
                        marginBottom: 16,
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 1px 3px rgba(0,0,0,.06)',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            flexWrap: 'wrap',
                            gap: 16,
                        }}
                    >
                        <div>
                            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#1e293b' }}>
                                {rubric.name}
                            </h1>
                            {rubric.subject && (
                                <div style={{ color: '#64748b', marginTop: 4, fontSize: '0.9rem' }}>
                                    {rubric.subject}
                                </div>
                            )}
                            <div style={{ marginTop: 10, fontSize: '1rem', color: '#1e293b' }}>
                                <strong>{student.name}</strong>
                                {student.email && (
                                    <span style={{ color: '#64748b', marginLeft: 8, fontSize: '0.85rem' }}>
                                        {student.email}
                                    </span>
                                )}
                            </div>
                            {sr.gradedAt && (
                                <div style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: 4 }}>
                                    Graded: {new Date(sr.gradedAt).toLocaleDateString()}
                                </div>
                            )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            {showGrade && scale && (
                                <div
                                    style={{
                                        fontSize: '2.8rem',
                                        fontWeight: 800,
                                        color: summary.gradeColor,
                                        lineHeight: 1,
                                    }}
                                >
                                    {summary.letterGrade}
                                </div>
                            )}
                            {showGrade && (
                                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#374151', marginTop: 2 }}>
                                    {summary.modifiedPercentage.toFixed(1)}%
                                </div>
                            )}
                            <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: 2 }}>
                                {summary.rawScore} / {summary.maxRawScore} pts
                            </div>
                        </div>
                    </div>

                    {sr.feedbackOnly && (
                        <div
                            style={{
                                marginTop: 14,
                                padding: '8px 14px',
                                background: '#fef9c3',
                                borderRadius: 8,
                                border: '1px solid #fde047',
                                fontSize: '0.85rem',
                                color: '#854d0e',
                            }}
                        >
                            Your teacher has released feedback. Your grade will be visible when it is published.
                        </div>
                    )}
                </div>

                {/* Per-criterion feedback */}
                {rubric.criteria.map((criterion) => {
                    const entry = sr.entries.find((e) => e.criterionId === criterion.id);
                    const selectedLevel = criterion.levels.find((l) => l.id === entry?.levelId);

                    return (
                        <div
                            key={criterion.id}
                            style={{
                                background: '#fff',
                                borderRadius: 12,
                                padding: 20,
                                marginBottom: 12,
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 1px 3px rgba(0,0,0,.06)',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    marginBottom: 14,
                                    flexWrap: 'wrap',
                                    gap: 8,
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>
                                        {criterion.title}
                                    </div>
                                    {criterion.description && (
                                        <div style={{ color: '#64748b', fontSize: '0.82rem', marginTop: 2 }}>
                                            {criterion.description}
                                        </div>
                                    )}
                                </div>
                                {selectedLevel && (
                                    <span
                                        style={{
                                            background: accentColor + '22',
                                            color: accentColor,
                                            border: `1.5px solid ${accentColor}`,
                                            borderRadius: 20,
                                            padding: '3px 12px',
                                            fontSize: '0.82rem',
                                            fontWeight: 700,
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {selectedLevel.label}
                                    </span>
                                )}
                            </div>

                            {/* Level pills */}
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 6,
                                    flexWrap: 'wrap',
                                    marginBottom: selectedLevel?.description || entry?.comment ? 12 : 0,
                                }}
                            >
                                {criterion.levels.map((level) => {
                                    const isSelected = level.id === entry?.levelId;
                                    return (
                                        <div
                                            key={level.id}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: 8,
                                                fontSize: '0.82rem',
                                                border: isSelected ? `2px solid ${accentColor}` : '1.5px solid #e2e8f0',
                                                background: isSelected ? accentColor + '18' : '#f8fafc',
                                                color: isSelected ? accentColor : '#64748b',
                                                fontWeight: isSelected ? 700 : 400,
                                            }}
                                        >
                                            {level.label}
                                            {isSelected && level.description && (
                                                <div
                                                    style={{
                                                        marginTop: 4,
                                                        fontSize: '0.78rem',
                                                        color: '#475569',
                                                        fontWeight: 400,
                                                        maxWidth: 280,
                                                    }}
                                                >
                                                    {level.description}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {entry?.comment && (
                                <div
                                    style={{
                                        marginTop: 8,
                                        padding: '10px 14px',
                                        background: '#f8fafc',
                                        borderRadius: 8,
                                        borderLeft: `3px solid ${accentColor}`,
                                        fontSize: '0.88rem',
                                        color: '#475569',
                                        lineHeight: 1.6,
                                    }}
                                >
                                    {entry.comment}
                                </div>
                            )}
                            {entry?.audioDataUrl && (
                                <div style={{ marginTop: 8 }}>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>
                                        Audio feedback:
                                    </div>
                                    <audio controls src={entry.audioDataUrl} style={{ width: '100%', height: 32 }} />
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Overall comment */}
                {sr.overallComment && (
                    <div
                        style={{
                            background: '#fff',
                            borderRadius: 12,
                            padding: 20,
                            marginBottom: 12,
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 1px 3px rgba(0,0,0,.06)',
                        }}
                    >
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 8, color: '#1e293b' }}>
                            Overall Feedback
                        </div>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569', lineHeight: 1.6 }}>
                            {sr.overallComment}
                        </p>
                    </div>
                )}

                {/* Footer */}
                <div
                    style={{
                        textAlign: 'center',
                        color: '#94a3b8',
                        fontSize: '0.75rem',
                        marginTop: 24,
                        paddingBottom: 24,
                    }}
                >
                    Generated by RubricMaker · For questions, contact your teacher
                </div>
            </div>
        </div>
    );
}
