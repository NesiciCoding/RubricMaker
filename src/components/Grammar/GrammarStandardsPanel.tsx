import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag } from 'lucide-react';
import type { Student, StudentTest, Test } from '../../types';
import {
    getTestGrammarBreakdown,
    grammarStatus,
    type TestGrammarStandardRow,
} from '../../utils/grammarStandardAggregator';
import { GrammarAccuracyBar, GrammarScoreBadge, GrammarStatusText } from './GrammarScoreBadge';

function classAccuracy(row: TestGrammarStandardRow): string {
    return row.attempts > 0 ? `${Math.round(row.accuracyPct ?? 0)}% · ${row.correct}/${row.attempts}` : '—';
}

function focusResult(row: TestGrammarStandardRow, studentId: string | undefined) {
    if (!studentId) return null;
    return row.studentResults.find((result) => result.studentId === studentId) ?? null;
}

function focusAccuracy(row: TestGrammarStandardRow, studentId: string): number | null {
    const result = focusResult(row, studentId);
    if (!result || result.attempts === 0) return null;
    return (result.correct / result.attempts) * 100;
}

export default function GrammarStandardsPanel({
    test,
    studentTests,
    students,
    lang,
    focusStudentId,
    onOpenBuilder,
}: {
    test: Test;
    studentTests: StudentTest[];
    students: Student[];
    lang: 'en' | 'nl';
    focusStudentId?: string;
    onOpenBuilder?: () => void;
}) {
    const { t } = useTranslation();
    const breakdown = useMemo(() => getTestGrammarBreakdown(test, studentTests), [test, studentTests]);

    if (breakdown.taggedQuestionCount === 0) {
        return (
            <div className="card">
                <h3 style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag size={16} />
                    {t('grammarOverview.test_title')}
                </h3>
                <div
                    style={{
                        border: '1px dashed var(--border-light)',
                        borderRadius: 10,
                        padding: '11px 13px',
                        background: 'var(--bg-elevated)',
                        fontSize: '0.8rem',
                        color: 'var(--text-muted)',
                    }}
                >
                    <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                        {t('grammarOverview.test_empty_title')}
                    </div>
                    {t('grammarOverview.test_empty_body')}
                    {onOpenBuilder && (
                        <div style={{ marginTop: 8 }}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenBuilder}>
                                {t('grammarOverview.test_open_builder')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const rows = [...breakdown.standards].sort((a, b) => {
        if (a.accuracyPct === null) return 1;
        if (b.accuracyPct === null) return -1;
        return a.accuracyPct - b.accuracyPct;
    });
    const nameFor = (studentId: string) => students.find((student) => student.id === studentId)?.name ?? studentId;

    const focusRows = focusStudentId ? rows.filter((row) => focusResult(row, focusStudentId) !== null) : [];
    const focusSecure = focusRows.filter(
        (row) => grammarStatus(focusAccuracy(row, focusStudentId!)) === 'secure'
    ).length;

    return (
        <div className="card">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Tag size={16} />
                        {t('grammarOverview.test_title')}
                    </h3>
                    <p className="text-muted text-sm" style={{ margin: '3px 0 0' }}>
                        {t('grammarOverview.test_subtitle', {
                            tagged: breakdown.taggedQuestionCount,
                            total: breakdown.totalQuestionCount,
                            standards: breakdown.standards.length,
                        })}
                    </p>
                </div>
                <span className="badge">
                    {t('grammarOverview.test_secure_badge', {
                        secure: breakdown.secureCount,
                        total: breakdown.standards.length,
                    })}
                </span>
            </div>

            {focusStudentId && focusRows.length > 0 && (
                <div
                    style={{
                        marginTop: 12,
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: 'var(--bg-elevated)',
                        fontSize: '0.78rem',
                        color: 'var(--text-muted)',
                    }}
                >
                    {t('grammarOverview.test_student_secure', {
                        secure: focusSecure,
                        total: focusRows.length,
                    })}
                </div>
            )}

            <div style={{ marginTop: 12 }}>
                {rows.map((row) => {
                    const result = focusResult(row, focusStudentId);
                    const missed = row.studentResults.filter((candidate) => candidate.correct < candidate.attempts);
                    return (
                        <details key={row.itemId} style={{ borderTop: '1px solid var(--border)' }}>
                            <summary
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns:
                                        'minmax(200px, 1.6fr) minmax(110px, 0.8fr) minmax(120px, 1fr) 110px',
                                    gap: 12,
                                    alignItems: 'center',
                                    padding: '10px 4px',
                                    cursor: 'pointer',
                                    listStyle: 'none',
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                                        {lang === 'nl' ? row.labelNl : row.labelEn}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                        <span
                                            style={{
                                                display: 'inline-block',
                                                width: 7,
                                                height: 7,
                                                borderRadius: 2,
                                                background: row.categoryColor,
                                                marginRight: 4,
                                                verticalAlign: 'middle',
                                            }}
                                            aria-hidden="true"
                                        />
                                        {lang === 'nl' ? row.categoryLabelNl : row.categoryLabelEn} ·{' '}
                                        <span className="badge" style={{ fontSize: '0.6rem' }}>
                                            {row.level}
                                        </span>{' '}
                                        ·{' '}
                                        {t('grammarOverview.test_questions', {
                                            numbers: row.questionNumbers.join(', '),
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <GrammarAccuracyBar pct={row.accuracyPct} />
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                                        {classAccuracy(row)} {t('grammarOverview.correct_suffix')}
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {result ? (
                                        <span>
                                            {t('grammarOverview.test_this_student')}{' '}
                                            <b style={{ color: 'var(--text)' }}>
                                                {result.correct}/{result.attempts}
                                            </b>
                                        </span>
                                    ) : (
                                        <span>{t('grammarOverview.test_not_answered')}</span>
                                    )}
                                </div>
                                <GrammarStatusText status={grammarStatus(row.accuracyPct)} />
                            </summary>
                            {missed.length > 0 && (
                                <div style={{ padding: '2px 4px 12px 16px' }}>
                                    <div
                                        style={{
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.03em',
                                            color: 'var(--text-muted)',
                                            marginBottom: 6,
                                        }}
                                    >
                                        {t('grammarOverview.test_missed_by')}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {missed.slice(0, 8).map((candidate) => (
                                            <span
                                                key={candidate.studentId}
                                                className="badge"
                                                style={{ fontSize: '0.7rem' }}
                                            >
                                                {nameFor(candidate.studentId)}{' '}
                                                <b>{`${candidate.correct}/${candidate.attempts}`}</b>
                                            </span>
                                        ))}
                                        {missed.length > 8 && (
                                            <span className="badge" style={{ fontSize: '0.7rem' }}>
                                                {t('grammarOverview.show_more', { count: missed.length - 8 })}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </details>
                    );
                })}
            </div>

            <div
                style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    gap: 12,
                    flexWrap: 'wrap',
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                }}
            >
                <span>{t('grammarOverview.legend_secure')}</span>
                <span>{t('grammarOverview.legend_developing')}</span>
                <span>{t('grammarOverview.legend_needs_work')}</span>
                <GrammarScoreBadge pct={null} />
            </div>
        </div>
    );
}
