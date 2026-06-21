import { Target, CheckCircle, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StandardCoverageEntry } from '../../utils/standardsCoverageAggregator';

interface Props {
    covered: StandardCoverageEntry[];
    gap: StandardCoverageEntry[];
}

function StandardRow({ entry }: { entry: StandardCoverageEntry }) {
    const { t } = useTranslation();
    return (
        <div
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
                {entry.statementNotation && (
                    <span className="font-semibold" style={{ marginRight: 6 }}>
                        {entry.statementNotation}
                    </span>
                )}
                <span className="truncate" style={{ color: 'var(--text)', display: 'block' }} title={entry.description}>
                    {entry.description}
                </span>
                <span className="text-muted text-xs" style={{ marginTop: 2, display: 'block' }}>
                    {entry.standardSetTitle}
                </span>
            </div>
            {entry.assessed && (
                <span
                    className={
                        entry.averagePercentage >= 70
                            ? 'badge badge-green'
                            : entry.averagePercentage >= 50
                              ? 'badge badge-yellow'
                              : 'badge badge-red'
                    }
                    style={{ flexShrink: 0, alignSelf: 'center' }}
                >
                    {Math.round(entry.averagePercentage)}% · {t('activityDashboard.coverage_rubric_count', { count: entry.rubricCount })}
                </span>
            )}
        </div>
    );
}

export default function ClassCoverageGapPanel({ covered, gap }: Props) {
    const { t } = useTranslation();

    if (covered.length === 0 && gap.length === 0) {
        return (
            <div className="empty-state">
                <Target size={28} style={{ opacity: 0.4 }} />
                <p>{t('activityDashboard.coverage_empty')}</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <AlertTriangle size={15} style={{ color: 'var(--red, #ef4444)' }} />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('activityDashboard.coverage_gap_title')}</span>
                    <span className="badge">{gap.length}</span>
                </div>
                {gap.length === 0 ? (
                    <p className="text-muted text-sm">{t('activityDashboard.coverage_no_gap')}</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {gap.map((entry) => (
                            <StandardRow key={entry.guid} entry={entry} />
                        ))}
                    </div>
                )}
            </div>

            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <CheckCircle size={15} style={{ color: 'var(--green, #22c55e)' }} />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        {t('activityDashboard.coverage_covered_title')}
                    </span>
                    <span className="badge">{covered.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {covered.map((entry) => (
                        <StandardRow key={entry.guid} entry={entry} />
                    ))}
                </div>
            </div>
        </div>
    );
}
