import { useTranslation } from 'react-i18next';
import type { ClassWeakCriterion, Student, WritingCriterionTrend } from '../../types';

function Sparkline({ scores }: { scores: number[] }) {
    const w = 80;
    const h = 24;
    const pts = scores.map(
        (s, i) =>
            `${scores.length > 1 ? (i / (scores.length - 1)) * w : w / 2},${h - (Math.min(Math.max(s, 0), 100) / 100) * h}`
    );
    return (
        <svg width={w} height={h} role="img" aria-label={scores.map((s) => Math.round(s)).join(', ')}>
            <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2} />
        </svg>
    );
}

const ARROW = { improving: '↗', declining: '↘', flat: '→' } as const;

export function StudentWritingTrendsCard({ trends }: { trends: WritingCriterionTrend[] }) {
    const { t } = useTranslation();
    if (trends.length === 0) return null;
    return (
        <div className="card" style={{ marginTop: 24 }}>
            <h3 style={{ marginBottom: 4 }}>{t('writingTrends.title')}</h3>
            <p className="text-muted text-sm" style={{ marginBottom: 14 }}>
                {t('writingTrends.intro')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {trends.map((tr) => (
                    <div
                        key={tr.criterionKey}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
                    >
                        <div style={{ flex: '1 1 160px', fontWeight: 600 }}>{tr.name}</div>
                        <Sparkline scores={tr.points.map((p) => p.score)} />
                        <div style={{ minWidth: 150, fontSize: 13 }}>
                            {Math.round(tr.latest)}% {ARROW[tr.direction]}{' '}
                            {t(`writingTrends.direction.${tr.direction}`)}
                        </div>
                        {tr.persistentWeak && (
                            <span className="badge" style={{ fontSize: 12 }}>
                                {t('writingTrends.persistentWeak')}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

export function ClassWritingTrendsCard({ rows, students }: { rows: ClassWeakCriterion[]; students: Student[] }) {
    const { t } = useTranslation();
    if (rows.length === 0) return null;
    const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? id;
    return (
        <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 4 }}>{t('writingTrends.classTitle')}</h3>
            <p className="text-muted text-sm" style={{ marginBottom: 14 }}>
                {t('writingTrends.classIntro')}
            </p>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ textAlign: 'left', padding: '6px 8px' }}>
                                {t('writingTrends.col_criterion')}
                            </th>
                            <th style={{ textAlign: 'left', padding: '6px 8px' }}>{t('writingTrends.col_average')}</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px' }}>{t('writingTrends.col_weak')}</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px' }}>
                                {t('writingTrends.col_declining')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.criterionKey} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{r.name}</td>
                                <td style={{ padding: '6px 8px' }}>{Math.round(r.averageScore)}%</td>
                                <td style={{ padding: '6px 8px' }}>{r.weakStudentIds.map(nameOf).join(', ') || '—'}</td>
                                <td style={{ padding: '6px 8px' }}>
                                    {r.decliningStudentIds.map(nameOf).join(', ') || '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
