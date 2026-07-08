import React from 'react';
import { useTranslation } from 'react-i18next';
import { Dumbbell } from 'lucide-react';
import { CEFR_LEVEL_COLORS, CEFR_SKILL_LABELS } from '../../data/cefrDescriptors';
import type { PracticeCefrCell } from '../../utils/cefrStudentAggregator';

interface Props {
    cells: PracticeCefrCell[];
    lang: 'en' | 'nl';
}

/**
 * Formative practice-mode test progress, deliberately styled apart from the graded
 * CefrOverviewGrid (dashed border, no achieved/developing color fill) so it reads as a
 * complementary signal and is never mistaken for the achieved-level chart.
 */
export default function PracticeCefrProgressPanel({ cells, lang }: Props) {
    const { t } = useTranslation();

    if (cells.length === 0) return null;

    return (
        <div className="card" style={{ marginBottom: 24, border: '1px dashed var(--border)' }}>
            <h3 style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Dumbbell size={18} style={{ color: 'var(--accent)' }} />
                {t('cefrOverview.practice_title')}
            </h3>
            <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
                {t('cefrOverview.practice_subtitle')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cells.map((cell) => (
                    <div
                        key={`${cell.skill}__${cell.level}`}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: 'var(--bg-elevated)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                                style={{
                                    background: CEFR_LEVEL_COLORS[cell.level],
                                    color: '#fff',
                                    borderRadius: 5,
                                    padding: '2px 8px',
                                    fontSize: 12,
                                    fontWeight: 700,
                                }}
                            >
                                {cell.level}
                            </span>
                            <span style={{ fontSize: '0.85rem' }}>{CEFR_SKILL_LABELS[cell.skill][lang]}</span>
                        </div>
                        <span className="text-muted text-xs">
                            {t('cefrOverview.practice_stats', {
                                avg: Math.round(cell.avgScore),
                                best: Math.round(cell.bestScore),
                                count: cell.attemptCount,
                            })}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
