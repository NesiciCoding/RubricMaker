import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag } from 'lucide-react';
import type { Rubric, ScoreEntry } from '../../types';
import { criterionMaxPoints, criterionPercentage } from '../../utils/gradeCalc';
import { GrammarScoreBadge } from './GrammarScoreBadge';

interface RubricGrammarRow {
    itemId: string;
    labelEn: string;
    labelNl: string;
    level: string;
    categoryLabelEn: string;
    categoryLabelNl: string;
    categoryColor: string;
    criterionTitle: string;
    pct: number;
}

export default function RubricGrammarPanel({
    rubric,
    entries,
    lang,
}: {
    rubric: Rubric;
    entries: ScoreEntry[];
    lang: 'en' | 'nl';
}) {
    const { t } = useTranslation();

    const rows = useMemo<RubricGrammarRow[]>(() => {
        const collected: RubricGrammarRow[] = [];
        for (const criterion of rubric.criteria) {
            if (criterionMaxPoints(criterion) === 0) continue;
            const links = (criterion.frameworkDescriptors ?? []).filter(
                (descriptor) => descriptor.framework === 'grammar'
            );
            if (links.length === 0) continue;
            const entry = entries.find((candidate) => candidate.criterionId === criterion.id);
            if (!entry) continue;
            const pct = criterionPercentage(entry, criterion);
            const seen = new Set<string>();
            for (const link of links) {
                if (seen.has(link.descriptorId)) continue;
                seen.add(link.descriptorId);
                collected.push({
                    itemId: link.descriptorId,
                    labelEn: link.descriptionEn,
                    labelNl: link.descriptionNl,
                    level: link.level ?? '',
                    categoryLabelEn: link.categoryLabelEn,
                    categoryLabelNl: link.categoryLabelNl,
                    categoryColor: link.categoryColor,
                    criterionTitle: criterion.title,
                    pct,
                });
            }
        }
        return collected;
    }, [rubric, entries]);

    const [open, setOpen] = useState(rows.length <= 2);
    const criterionCount = new Set(rows.map((row) => row.criterionTitle)).size;

    return (
        <div className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
            <details open={open} onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
                <summary
                    style={{
                        cursor: 'pointer',
                        listStyle: 'none',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 12,
                    }}
                >
                    <div>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Tag size={16} />
                            {t('grammarOverview.rubric_title')}
                        </h3>
                        <p className="text-muted text-sm" style={{ margin: '3px 0 0' }}>
                            {rows.length > 0
                                ? t('grammarOverview.rubric_subtitle', {
                                      standards: rows.length,
                                      criteria: criterionCount,
                                  })
                                : t('grammarOverview.rubric_empty')}
                        </p>
                    </div>
                    {rows.length > 0 && (
                        <span className="badge">{t('grammarOverview.rubric_badge', { count: rows.length })}</span>
                    )}
                </summary>

                {rows.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                        {rows.map((row) => (
                            <div
                                key={`${row.itemId}__${row.criterionTitle}`}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(200px, 1.5fr) minmax(120px, 0.9fr) 64px',
                                    gap: 12,
                                    alignItems: 'center',
                                    padding: '9px 4px',
                                    borderTop: '1px solid var(--border)',
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
                                        {lang === 'nl' ? row.categoryLabelNl : row.categoryLabelEn}
                                        {row.level && (
                                            <>
                                                {' '}
                                                ·{' '}
                                                <span className="badge" style={{ fontSize: '0.6rem' }}>
                                                    {row.level}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {t('grammarOverview.rubric_linked_on', { criterion: row.criterionTitle })}
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <GrammarScoreBadge pct={row.pct} suffix={false} />
                                </div>
                            </div>
                        ))}
                        <p className="text-muted" style={{ fontSize: '0.72rem', margin: '10px 4px 0' }}>
                            {t('grammarOverview.rubric_note')}
                        </p>
                    </div>
                )}
            </details>
        </div>
    );
}
