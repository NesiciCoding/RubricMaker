import React from 'react';
import { useTranslation } from 'react-i18next';
import CefrBadge from './CefrBadge';
import { CEFR_SKILL_LABELS } from '../../data/cefrDescriptors';
import { CEFR_SUBLEVEL_LABELS, PROGRESS_STATUS_COLOR, progressStatusLabelKey } from '../../utils/cefrOrdinal';
import type { CefrSkillTargetProgress } from '../../utils/masteryTargetAnalysis';
import type { CefrSubLevelRange } from '../../types';

interface Props {
    rows: CefrSkillTargetProgress[];
}

const cellStyle: React.CSSProperties = { padding: '6px 8px' };

function rangeLabel(range: CefrSubLevelRange): string {
    return range.min === range.max
        ? CEFR_SUBLEVEL_LABELS[range.min]
        : `${CEFR_SUBLEVEL_LABELS[range.min]} – ${CEFR_SUBLEVEL_LABELS[range.max]}`;
}

/**
 * Per-skill line of the CEFR target analysis: the achieved level next to its target and
 * ahead/on-track/behind status. Rows without a teacher-configured target fall back to the
 * curriculum's expected range for the student's (year, track), and say so, so the table is useful
 * before any target is configured.
 */
export default function CefrSkillTargetList({ rows }: Props) {
    const { t, i18n } = useTranslation();
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';

    return (
        <div>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    marginBottom: 8,
                }}
            >
                <h4 style={{ margin: 0, fontSize: '0.9rem' }}>{t('cefr.skill_targets_title')}</h4>
                <span className="text-muted text-xs">{t('cefr.skill_targets_help')}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ ...cellStyle, textAlign: 'left' }}>{t('cefr.skill_target_col_skill')}</th>
                            <th style={{ ...cellStyle, textAlign: 'left' }}>{t('cefr.skill_target_col_achieved')}</th>
                            <th style={{ ...cellStyle, textAlign: 'left' }}>{t('cefr.skill_target_col_target')}</th>
                            <th style={{ ...cellStyle, textAlign: 'left' }}>{t('cefr.skill_target_col_status')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.skill} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={cellStyle}>{CEFR_SKILL_LABELS[row.skill][lang]}</td>
                                <td style={cellStyle}>
                                    {row.achievedLevel ? (
                                        <CefrBadge level={row.achievedLevel} size="sm" />
                                    ) : (
                                        <span className="text-muted">{t('cefr.skill_target_no_data')}</span>
                                    )}
                                </td>
                                <td
                                    style={cellStyle}
                                    title={
                                        row.calibrated && row.standardRange
                                            ? t('cefr.skill_target_calibrated_tooltip', {
                                                  range: rangeLabel(row.standardRange),
                                              })
                                            : undefined
                                    }
                                >
                                    {row.targetLevel ? (
                                        CEFR_SUBLEVEL_LABELS[row.targetLevel]
                                    ) : row.expectedRange ? (
                                        <>
                                            {rangeLabel(row.expectedRange)}
                                            <div className="text-muted text-xs">
                                                {t(
                                                    row.calibrated
                                                        ? 'cefr.skill_target_from_cohort'
                                                        : 'cefr.skill_target_from_curriculum'
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <span className="text-muted">{t('cefr.skill_target_not_set')}</span>
                                    )}
                                </td>
                                <td style={cellStyle}>
                                    {/* 'no-data' uses the dim colour, which fails AA contrast when bold at
                                        this size — keep it muted and regular weight like the dashes. */}
                                    {row.status === 'no-data' ? (
                                        <span className="text-muted">{t(progressStatusLabelKey(row.status))}</span>
                                    ) : (
                                        <span
                                            style={{
                                                fontWeight: 700,
                                                color: PROGRESS_STATUS_COLOR[row.status],
                                            }}
                                        >
                                            {t(progressStatusLabelKey(row.status))}
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
