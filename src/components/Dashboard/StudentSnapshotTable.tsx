import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Users } from 'lucide-react';
import Avatar from '../ui/Avatar';
import CefrBadge from '../CEFR/CefrBadge';
import { getCefrStudentOverview, overallLevel } from '../../utils/cefrStudentAggregator';
import { getStudentVocabProfile } from '../../utils/vocabProfileAggregator';
import { getStudentGrammarMasteryScore, type MasteryProfileDeps } from '../../utils/masteryProfileAggregator';
import { getCriterionInterventionFlags, getCefrSkillInterventionFlags } from '../../utils/learningPathAggregator';
import { scoreToMasteryColor } from '../../utils/masteryColorScale';
import { getEffectiveVoTrack } from '../../data/voTracks';
import type {
    Student,
    Class,
    StudentRubric,
    Rubric,
    SelfAssessment,
    DocumentAnalysisResult,
    Test,
    StudentTest,
    GradeRange,
} from '../../types';

interface Props {
    students: Student[];
    classes: Class[];
    studentRubrics: StudentRubric[];
    rubrics: Rubric[];
    selfAssessments: SelfAssessment[];
    analysisResults: DocumentAnalysisResult[];
    tests: Test[];
    studentTests: StudentTest[];
    flashcardDecks: MasteryProfileDeps['flashcardDecks'];
    flashcardAssignments: MasteryProfileDeps['flashcardAssignments'];
    flashcardReviews: MasteryProfileDeps['flashcardReviews'];
    cefrAchieveThreshold: number;
    masteryColorBands?: GradeRange[];
}

interface Row {
    student: Student;
    cls?: Class;
    cefrLevel: ReturnType<typeof overallLevel>;
    vocabLevel: ReturnType<typeof getStudentVocabProfile>['estimatedLevel'] | null;
    grammarScore: number | null;
    flagCount: number;
}

const textDim: React.CSSProperties = { color: 'var(--border)', fontSize: '0.7rem' };

function parseColor(color: string): { r: number; g: number; b: number } | null {
    const hexMatch = /^#([0-9a-f]{6})$/i.exec(color.trim());
    if (hexMatch) {
        const hex = hexMatch[1];
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
        };
    }
    const rgbMatch = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i.exec(color.trim());
    if (rgbMatch) {
        return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]) };
    }
    return null;
}

/** Readable text color for an arbitrary (teacher-configurable) background, from its actual luminance rather than the score — a light custom band color must not get unreadable white text. */
function textColorForBg(color: string): string {
    const rgb = parseColor(color);
    if (!rgb) return '#1e293b';
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance < 0.6 ? 'white' : '#1e293b';
}

export default function StudentSnapshotTable({
    students,
    classes,
    studentRubrics,
    rubrics,
    selfAssessments,
    analysisResults,
    tests,
    studentTests,
    flashcardDecks,
    flashcardAssignments,
    flashcardReviews,
    cefrAchieveThreshold,
    masteryColorBands,
}: Props) {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const masteryDeps: MasteryProfileDeps = useMemo(
        () => ({
            tests,
            studentTests,
            rubrics,
            studentRubrics,
            flashcardDecks,
            flashcardAssignments,
            flashcardReviews,
        }),
        [tests, studentTests, rubrics, studentRubrics, flashcardDecks, flashcardAssignments, flashcardReviews]
    );

    const rows: Row[] = useMemo(() => {
        const computed = students.map((student) => {
            const cls = classes.find((c) => c.id === student.classId);
            const cefrOverview = getCefrStudentOverview(
                student.id,
                studentRubrics,
                rubrics,
                selfAssessments,
                analysisResults,
                cls?.year,
                getEffectiveVoTrack(student, cls),
                tests,
                studentTests,
                cefrAchieveThreshold
            );
            const vocabProfile = getStudentVocabProfile(student, analysisResults);
            const flagCount =
                getCriterionInterventionFlags(student.id, studentRubrics, rubrics).length +
                getCefrSkillInterventionFlags(student.id, studentRubrics, rubrics).length;

            return {
                student,
                cls,
                cefrLevel: overallLevel(cefrOverview.cells),
                vocabLevel: vocabProfile.analysisCount > 0 ? vocabProfile.estimatedLevel : null,
                grammarScore: getStudentGrammarMasteryScore(student.id, masteryDeps),
                flagCount,
            };
        });

        return computed.sort((a, b) => {
            if (a.flagCount !== b.flagCount) return b.flagCount - a.flagCount;
            return (a.student.name ?? '').localeCompare(b.student.name ?? '');
        });
    }, [
        students,
        classes,
        studentRubrics,
        rubrics,
        selfAssessments,
        analysisResults,
        tests,
        studentTests,
        cefrAchieveThreshold,
        masteryDeps,
    ]);

    if (students.length === 0) {
        return (
            <div className="empty-state">
                <Users size={32} />
                <p>{t('dashboard.snapshot_empty')}</p>
            </div>
        );
    }

    return (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        <th
                            style={{
                                padding: '10px 14px',
                                textAlign: 'left',
                                fontWeight: 700,
                                color: 'var(--text-muted)',
                                whiteSpace: 'nowrap',
                                position: 'sticky',
                                left: 0,
                                background: 'var(--bg-card)',
                                zIndex: 1,
                            }}
                        >
                            {t('dashboard.snapshot_header_student')}
                        </th>
                        {[
                            t('dashboard.snapshot_header_cefr'),
                            t('dashboard.snapshot_header_grammar'),
                            t('dashboard.snapshot_header_vocabulary'),
                            t('dashboard.snapshot_header_needs_attention'),
                            t('cefr.table_header_detail'),
                        ].map((label) => (
                            <th
                                key={label}
                                style={{
                                    padding: '10px 10px',
                                    textAlign: 'center',
                                    fontWeight: 600,
                                    color: 'var(--text-muted)',
                                    borderLeft: '2px solid var(--border)',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ student: s, cls, cefrLevel, vocabLevel, grammarScore, flagCount }, i) => (
                        <tr
                            key={s.id}
                            style={{
                                borderBottom: '1px solid var(--border)',
                                background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-elevated)',
                            }}
                        >
                            <td
                                className="hoverable"
                                role="button"
                                tabIndex={0}
                                onClick={() => navigate(`/students/${s.id}`)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') navigate(`/students/${s.id}`);
                                }}
                                style={{
                                    padding: '8px 14px',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                    position: 'sticky',
                                    left: 0,
                                    background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-elevated)',
                                    zIndex: 1,
                                    cursor: 'pointer',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Avatar name={s.name} size={26} fontSize="0.75rem" />
                                    <div>
                                        <div style={{ fontSize: '0.85rem' }}>{s.name}</div>
                                        {cls && (
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                                {cls.name}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </td>

                            <td
                                style={{
                                    padding: '6px 6px',
                                    textAlign: 'center',
                                    borderLeft: '2px solid var(--border)',
                                }}
                            >
                                {cefrLevel ? (
                                    <button
                                        type="button"
                                        style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                                        onClick={() => navigate(`/students/${s.id}/cefr-overview`)}
                                        aria-label={t('dashboard.snapshot_open_cefr', { name: s.name })}
                                    >
                                        <CefrBadge level={cefrLevel} size="sm" />
                                    </button>
                                ) : (
                                    <span style={textDim}>·</span>
                                )}
                            </td>

                            <td
                                style={{
                                    padding: '6px 6px',
                                    textAlign: 'center',
                                    borderLeft: '2px solid var(--border)',
                                }}
                            >
                                {grammarScore !== null ? (
                                    (() => {
                                        const bg = scoreToMasteryColor(grammarScore, masteryColorBands);
                                        return (
                                            <button
                                                type="button"
                                                title={t('dashboard.snapshot_open_grammar', { name: s.name })}
                                                aria-label={t('dashboard.snapshot_open_grammar', { name: s.name })}
                                                onClick={() => navigate(`/students/${s.id}/learning-path`)}
                                                style={{
                                                    cursor: 'pointer',
                                                    border: 'none',
                                                    borderRadius: 4,
                                                    padding: '3px 8px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 700,
                                                    background: bg,
                                                    color: textColorForBg(bg),
                                                }}
                                            >
                                                {Math.round(grammarScore)}%
                                            </button>
                                        );
                                    })()
                                ) : (
                                    <span style={textDim} title={t('dashboard.snapshot_no_data')}>
                                        {t('dashboard.snapshot_no_data_short')}
                                    </span>
                                )}
                            </td>

                            <td
                                style={{
                                    padding: '6px 6px',
                                    textAlign: 'center',
                                    borderLeft: '2px solid var(--border)',
                                }}
                            >
                                {vocabLevel ? (
                                    <button
                                        type="button"
                                        style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                                        onClick={() => navigate(`/students/${s.id}`)}
                                        aria-label={t('dashboard.snapshot_open_vocab', { name: s.name })}
                                    >
                                        <CefrBadge level={vocabLevel} size="sm" />
                                    </button>
                                ) : (
                                    <span style={textDim} title={t('dashboard.snapshot_no_data')}>
                                        {t('dashboard.snapshot_no_data_short')}
                                    </span>
                                )}
                            </td>

                            <td
                                style={{
                                    padding: '6px 6px',
                                    textAlign: 'center',
                                    borderLeft: '2px solid var(--border)',
                                }}
                            >
                                {flagCount > 0 ? (
                                    <button
                                        type="button"
                                        title={t('dashboard.snapshot_needs_attention_tooltip', { count: flagCount })}
                                        aria-label={t('dashboard.snapshot_needs_attention_tooltip', {
                                            count: flagCount,
                                        })}
                                        onClick={() => navigate(`/students/${s.id}/learning-path`)}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            cursor: 'pointer',
                                            border: 'none',
                                            background: 'none',
                                            color: 'var(--red)',
                                            fontWeight: 700,
                                            fontSize: '0.78rem',
                                        }}
                                    >
                                        <AlertTriangle size={13} aria-hidden="true" />
                                        {flagCount}
                                    </button>
                                ) : (
                                    <span style={textDim}>·</span>
                                )}
                            </td>

                            <td
                                style={{
                                    padding: '8px 10px',
                                    textAlign: 'center',
                                    borderLeft: '2px solid var(--border)',
                                }}
                            >
                                <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                                    onClick={() => navigate(`/students/${s.id}`)}
                                    aria-label={t('dashboard.snapshot_open_profile', { name: s.name })}
                                    title={t('dashboard.snapshot_open_profile', { name: s.name })}
                                >
                                    <ChevronRight size={13} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div
                style={{
                    display: 'flex',
                    gap: 16,
                    padding: '10px 14px',
                    borderTop: '1px solid var(--border)',
                    flexWrap: 'wrap',
                }}
            >
                {(masteryColorBands && masteryColorBands.length > 0
                    ? masteryColorBands
                    : [
                          { label: t('dashboard.snapshot_legend_needs_work'), color: '#ef4444' },
                          { label: t('dashboard.snapshot_legend_developing'), color: '#eab308' },
                          { label: t('dashboard.snapshot_legend_strong'), color: '#22c55e' },
                      ]
                ).map(({ label, color }, idx) => (
                    <div
                        key={`${idx}-${label}`}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                        }}
                    >
                        <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
                        {label}
                    </div>
                ))}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                    }}
                >
                    <AlertTriangle size={12} style={{ color: 'var(--red)' }} aria-hidden="true" />
                    {t('dashboard.snapshot_legend_needs_attention')}
                </div>
            </div>
        </div>
    );
}
