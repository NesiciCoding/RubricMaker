import React from 'react';
import { Award } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StandardSetGroup } from '../../utils/cefrStudentAggregator';

interface Props {
    standardSets: StandardSetGroup[];
}

function scoreBadgeClass(avgScore: number, rubricCount: number): string {
    if (rubricCount === 0) return 'badge';
    if (avgScore >= 70) return 'badge badge-green';
    if (avgScore >= 50) return 'badge badge-yellow';
    return 'badge badge-red';
}

export default function StandardsCoveragePanel({ standardSets }: Props) {
    const { t } = useTranslation();

    if (standardSets.length === 0) {
        return (
            <div className="empty-state">
                <Award size={28} style={{ opacity: 0.4 }} />
                <p>{t('cefrOverview.standards_empty')}</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {standardSets.map((group) => (
                <div key={group.setTitle}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 8,
                        }}
                    >
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{group.setTitle}</span>
                        <span className="badge">{group.standards.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {group.standards.map((std) => (
                            <div
                                key={std.guid}
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 10,
                                    padding: '8px 10px',
                                    borderRadius: 6,
                                    background: 'var(--bg-elevated)',
                                    fontSize: '0.83rem',
                                }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    {std.statementNotation && (
                                        <span className="font-semibold" style={{ marginRight: 6 }}>
                                            {std.statementNotation}
                                        </span>
                                    )}
                                    <span
                                        className="truncate"
                                        style={{ color: 'var(--text)', display: 'block' }}
                                        title={std.description}
                                    >
                                        {std.description}
                                    </span>
                                    <span className="text-muted text-xs" style={{ marginTop: 2, display: 'block' }}>
                                        {t('cefrOverview.standard_rubric_count', { count: std.rubricCount })}
                                    </span>
                                </div>
                                <span
                                    className={scoreBadgeClass(std.avgScore, std.rubricCount)}
                                    style={{ flexShrink: 0, alignSelf: 'center' }}
                                >
                                    {std.rubricCount > 0 ? `${Math.round(std.avgScore)}%` : t('cefrOverview.standard_no_score')}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
