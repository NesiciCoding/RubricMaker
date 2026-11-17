import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GrammarCategoryRow, GrammarStandardRow } from '../../utils/grammarStandardAggregator';
import { GrammarAccuracyBar, GrammarScoreBadge, GrammarStatusText } from './GrammarScoreBadge';

function evidenceCount(pct: number | null, value: string): string {
    return pct === null ? '—' : value;
}

function StandardEvidenceRow({ row, lang }: { row: GrammarStandardRow; lang: 'en' | 'nl' }) {
    const { t } = useTranslation();

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(170px, 1.5fr) repeat(3, minmax(96px, 0.75fr)) 96px',
                gap: 10,
                alignItems: 'center',
                padding: '9px 4px 9px 22px',
                borderTop: '1px dashed var(--border)',
                fontSize: '0.8rem',
            }}
        >
            <div>
                <div style={{ fontWeight: 600 }}>{lang === 'nl' ? row.labelNl : row.labelEn}</div>
                <span className="badge" style={{ fontSize: '0.62rem' }}>
                    {row.level}
                </span>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                {t('grammarOverview.evidence_tests')}{' '}
                {row.testAttempts > 0 ? (
                    <b style={{ color: 'var(--text)' }}>
                        {t('grammarOverview.evidence_test_value', {
                            correct: row.testCorrect,
                            attempts: row.testAttempts,
                            pct: Math.round(row.testAccuracyPct ?? 0),
                        })}
                    </b>
                ) : (
                    <span style={{ color: 'var(--text-dim)' }}>—</span>
                )}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                {t('grammarOverview.evidence_writing')}{' '}
                {row.writingInstances > 0 ? (
                    <b style={{ color: 'var(--text)' }}>
                        {t('grammarOverview.evidence_writing_value', {
                            pct: Math.round(row.writingAvgPct ?? 0),
                            count: row.writingInstances,
                        })}
                    </b>
                ) : (
                    <span style={{ color: 'var(--text-dim)' }}>—</span>
                )}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                {t('grammarOverview.evidence_combined')}{' '}
                <b style={{ color: 'var(--text)' }}>
                    {evidenceCount(row.combinedPct, `${Math.round(row.combinedPct ?? 0)}%`)}
                </b>
            </div>
            <GrammarStatusText status={row.status} />
        </div>
    );
}

export default function GrammarCategoryAccordion({
    categories,
    lang,
}: {
    categories: GrammarCategoryRow[];
    lang: 'en' | 'nl';
}) {
    const { t } = useTranslation();

    return (
        <div>
            {categories.map((category) => (
                <details key={category.categoryId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <summary
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '11px 4px',
                            cursor: 'pointer',
                            listStyle: 'none',
                        }}
                    >
                        <span style={{ color: 'var(--text-dim)', fontSize: 10 }} aria-hidden="true">
                            ▶
                        </span>
                        <span
                            style={{ width: 8, height: 8, borderRadius: 3, background: category.color }}
                            aria-hidden="true"
                        />
                        <span style={{ minWidth: 150 }}>
                            <span style={{ display: 'block', fontWeight: 650, fontSize: '0.82rem' }}>
                                {lang === 'nl' ? category.labelNl : category.labelEn}
                            </span>
                            <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {t('grammarOverview.category_levels', {
                                    levels:
                                        category.levels.length > 1
                                            ? `${category.levels[0]}–${category.levels[category.levels.length - 1]}`
                                            : category.levels[0],
                                    count: category.standardCount,
                                })}
                            </span>
                        </span>
                        <span style={{ flex: 1, minWidth: 90, maxWidth: 260 }}>
                            <GrammarAccuracyBar pct={category.combinedPct} />
                        </span>
                        <GrammarScoreBadge pct={category.combinedPct} suffix={false} />
                        <span style={{ width: 96, textAlign: 'right' }}>
                            <GrammarStatusText status={category.status} />
                        </span>
                    </summary>
                    <div style={{ paddingBottom: 8 }}>
                        {category.standards.map((row) => (
                            <StandardEvidenceRow key={row.itemId} row={row} lang={lang} />
                        ))}
                    </div>
                </details>
            ))}
        </div>
    );
}
