import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { decodeFeedbackCode } from '../utils/shareCode';
import { calcGradeSummary } from '../utils/gradeCalc';
import { safeAudioDataUrl } from '../utils/safeUrl';
import { SharedPageShell, SharedPageInvalid, sharedCardStyle } from '../components/ui/SharedPageShell';

export default function StudentFeedbackPage() {
    const { code } = useParams<{ code: string }>();
    const { t, i18n } = useTranslation();
    const data = code ? decodeFeedbackCode(code) : null;

    useEffect(() => {
        if (!data) return;
        const previous = document.title;
        document.title = data.rubric.name;
        return () => {
            document.title = previous;
        };
    }, [data?.rubric.name]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!data) {
        return <SharedPageInvalid title={t('sharedFeedback.invalid_title')} body={t('sharedFeedback.invalid_body')} />;
    }

    const { sr, rubric, student, scale } = data;
    const summary = calcGradeSummary(sr, rubric.criteria, scale);
    const fmt = rubric.format;
    // The rubric's accent only tints borders and backgrounds; text keeps the theme colours so a light
    // accent never drops below contrast.
    const accentColor = fmt?.accentColor ?? '#6366f1';
    const showGrade = !sr.feedbackOnly;
    const percentFormat = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

    return (
        <SharedPageShell fontFamily={fmt?.fontFamily} maxWidth={760} footer={t('sharedFeedback.footer')}>
            <header style={sharedCardStyle}>
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
                        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)' }}>
                            {rubric.name}
                        </h1>
                        {rubric.subject && (
                            <div style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: '0.9rem' }}>
                                {rubric.subject}
                            </div>
                        )}
                        <div style={{ marginTop: 10, fontSize: '1rem', color: 'var(--text)' }}>
                            <strong>{student.name}</strong>
                            {student.email && (
                                <span style={{ color: 'var(--text-muted)', marginInlineStart: 8, fontSize: '0.85rem' }}>
                                    {student.email}
                                </span>
                            )}
                        </div>
                        {sr.gradedAt && (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4 }}>
                                {t('sharedFeedback.graded_on', {
                                    date: new Date(sr.gradedAt).toLocaleDateString(i18n.language, {
                                        dateStyle: 'long',
                                    }),
                                })}
                            </div>
                        )}
                    </div>
                    {showGrade && (
                        <div style={{ textAlign: 'end' }}>
                            {scale && (
                                <div
                                    style={{
                                        fontSize: '2.8rem',
                                        fontWeight: 800,
                                        color: 'var(--text)',
                                        lineHeight: 1,
                                        borderBottom: `4px solid ${summary.gradeColor}`,
                                        display: 'inline-block',
                                    }}
                                >
                                    <span className="sr-only">{t('sharedFeedback.grade_label')} </span>
                                    {summary.letterGrade}
                                </div>
                            )}
                            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)', marginTop: 6 }}>
                                {percentFormat.format(summary.modifiedPercentage)}%
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                {t('sharedFeedback.points', { score: summary.rawScore, max: summary.maxRawScore })}
                            </div>
                        </div>
                    )}
                </div>

                {sr.feedbackOnly && (
                    <p
                        role="note"
                        style={{
                            margin: '14px 0 0',
                            padding: '8px 14px',
                            background: 'color-mix(in srgb, var(--yellow, #eab308) 14%, var(--bg-card))',
                            borderRadius: 8,
                            border: '1px solid color-mix(in srgb, var(--yellow, #eab308) 55%, transparent)',
                            fontSize: '0.85rem',
                            color: 'var(--text)',
                        }}
                    >
                        {t('sharedFeedback.feedback_only_notice')}
                    </p>
                )}
            </header>

            {rubric.criteria.map((criterion) => {
                const entry = sr.entries.find((e) => e.criterionId === criterion.id);
                const audioSrc = safeAudioDataUrl(entry?.audioDataUrl);
                const selectedLevel = criterion.levels.find((l) => l.id === entry?.levelId);
                const headingId = `feedback-criterion-${criterion.id}`;

                return (
                    <section key={criterion.id} aria-labelledby={headingId} style={{ ...sharedCardStyle, padding: 20 }}>
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
                                <h2
                                    id={headingId}
                                    style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}
                                >
                                    {criterion.title}
                                </h2>
                                {criterion.description && (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 2 }}>
                                        {criterion.description}
                                    </div>
                                )}
                            </div>
                            {selectedLevel && (
                                <span
                                    style={{
                                        background: `color-mix(in srgb, ${accentColor} 14%, var(--bg-card))`,
                                        color: 'var(--text)',
                                        border: `1.5px solid ${accentColor}`,
                                        borderRadius: 20,
                                        padding: '3px 12px',
                                        fontSize: '0.85rem',
                                        fontWeight: 700,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {t('sharedFeedback.your_level')}: {selectedLevel.label}
                                </span>
                            )}
                        </div>

                        <ul
                            aria-label={t('sharedFeedback.levels_label', { criterion: criterion.title })}
                            style={{
                                listStyle: 'none',
                                padding: 0,
                                margin: 0,
                                display: 'flex',
                                gap: 6,
                                flexWrap: 'wrap',
                                marginBottom: selectedLevel?.description || entry?.comment ? 12 : 0,
                            }}
                        >
                            {criterion.levels.map((level) => {
                                const isSelected = level.id === entry?.levelId;
                                return (
                                    <li
                                        key={level.id}
                                        aria-current={isSelected ? 'true' : undefined}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: 8,
                                            fontSize: '0.85rem',
                                            border: isSelected
                                                ? `2px solid ${accentColor}`
                                                : '1.5px solid var(--border)',
                                            background: isSelected
                                                ? `color-mix(in srgb, ${accentColor} 12%, var(--bg-card))`
                                                : 'var(--bg-elevated)',
                                            color: isSelected ? 'var(--text)' : 'var(--text-muted)',
                                            fontWeight: isSelected ? 700 : 400,
                                        }}
                                    >
                                        {isSelected && (
                                            <>
                                                <Check
                                                    size={13}
                                                    aria-hidden="true"
                                                    style={{ verticalAlign: '-2px', marginInlineEnd: 4 }}
                                                />
                                                <span className="sr-only">{t('sharedFeedback.your_level')}: </span>
                                            </>
                                        )}
                                        {level.label}
                                        {isSelected && level.description && (
                                            <div
                                                style={{
                                                    marginTop: 4,
                                                    fontSize: '0.8rem',
                                                    color: 'var(--text)',
                                                    fontWeight: 400,
                                                    maxWidth: 280,
                                                }}
                                            >
                                                {level.description}
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>

                        {entry?.comment && (
                            <div
                                style={{
                                    marginTop: 8,
                                    padding: '10px 14px',
                                    background: 'var(--bg-elevated)',
                                    borderRadius: 8,
                                    borderInlineStart: `3px solid ${accentColor}`,
                                    fontSize: '0.9rem',
                                    color: 'var(--text)',
                                    lineHeight: 1.6,
                                }}
                            >
                                {entry.comment}
                            </div>
                        )}
                        {audioSrc && (
                            <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                                    {t('sharedFeedback.audio_feedback')}
                                </div>
                                <audio
                                    controls
                                    src={audioSrc}
                                    aria-label={t('sharedFeedback.audio_feedback_for', { criterion: criterion.title })}
                                    style={{ width: '100%', height: 32 }}
                                />
                            </div>
                        )}
                    </section>
                );
            })}

            {sr.overallComment && (
                <section aria-labelledby="feedback-overall" style={{ ...sharedCardStyle, padding: 20 }}>
                    <h2
                        id="feedback-overall"
                        style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}
                    >
                        {t('sharedFeedback.overall_feedback')}
                    </h2>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.6 }}>
                        {sr.overallComment}
                    </p>
                </section>
            )}
        </SharedPageShell>
    );
}
