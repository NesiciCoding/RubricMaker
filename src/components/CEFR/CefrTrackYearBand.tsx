import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    CEFR_SUBLEVEL_ORDER,
    CEFR_SUBLEVEL_LABELS,
    PROGRESS_STATUS_COLOR,
    cefrLevelOrdinal,
    cefrSubLevelOrdinal,
    progressStatusLabelKey,
} from '../../utils/cefrOrdinal';
import type { CefrLevel, CefrSubLevelRange } from '../../types';
import type { ProgressStatus } from '../../utils/cefrOrdinal';

interface Props {
    expectedRange?: CefrSubLevelRange;
    achievedLevel?: CefrLevel | null;
    status: ProgressStatus;
}

export default function CefrTrackYearBand({ expectedRange, achievedLevel, status }: Props) {
    const { t } = useTranslation();
    const scaleLength = CEFR_SUBLEVEL_ORDER.length;

    if (!expectedRange) {
        return (
            <p className="text-muted text-sm" style={{ textAlign: 'center', padding: '8px 0' }}>
                {t('cefr.track_year_band_no_target')}
            </p>
        );
    }

    const loPct = (cefrSubLevelOrdinal(expectedRange.min) / (scaleLength - 1)) * 100;
    const hiPct = (cefrSubLevelOrdinal(expectedRange.max) / (scaleLength - 1)) * 100;
    const achievedPct = achievedLevel != null ? (cefrLevelOrdinal(achievedLevel) / (scaleLength - 1)) * 100 : null;

    return (
        <div>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 6,
                }}
            >
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    {t('cefr.track_year_band_title')}
                </span>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: PROGRESS_STATUS_COLOR[status] }}>
                    {t(progressStatusLabelKey(status))}
                </span>
            </div>
            <div
                role="img"
                aria-label={t('cefr.track_year_band_aria_label', {
                    min: CEFR_SUBLEVEL_LABELS[expectedRange.min],
                    max: CEFR_SUBLEVEL_LABELS[expectedRange.max],
                    achieved: achievedLevel ?? t('cefr.track_year_band_no_achieved'),
                })}
                style={{ position: 'relative', height: 28, background: 'var(--bg-elevated)', borderRadius: 6 }}
            >
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${loPct}%`,
                        width: `${Math.max(hiPct - loPct, 1.5)}%`,
                        background: 'var(--accent)',
                        opacity: 0.25,
                        borderRadius: 6,
                    }}
                />
                {achievedPct != null && (
                    <div
                        style={{
                            position: 'absolute',
                            top: -3,
                            left: `calc(${achievedPct}% - 5px)`,
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: PROGRESS_STATUS_COLOR[status],
                            border: '2px solid var(--bg-panel)',
                        }}
                    />
                )}
            </div>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 4,
                    fontSize: '0.7rem',
                    color: 'var(--text-dim)',
                }}
            >
                <span>{CEFR_SUBLEVEL_LABELS['pre-a1']}</span>
                <span>{CEFR_SUBLEVEL_LABELS.c2}</span>
            </div>
        </div>
    );
}
