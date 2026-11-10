import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import EstimateConfidenceBadge from './EstimateConfidenceBadge';
import { placementConfidence } from '../../utils/placementConfidence';
import type { StaircaseRunConfig } from '../../utils/placementStaircase';
import type { CefrLevel, StaircaseStep } from '../../types';

export interface PlacementLevelPanelProps {
    /** Undefined while no snapshot has arrived yet (student hasn't answered a question, or isn't connected). */
    level?: CefrLevel;
    eloAnchor?: number;
    questionsAsked?: number;
    /** The run's trace so far, so the level can be shown with how settled the estimate is. */
    levelPath?: StaircaseStep[];
    /** Range and start level the trace must be replayed with; omitted for a classic staircase run. */
    levelPathConfig?: StaircaseRunConfig;
    /** Opt-in read of how settled the estimate is. */
    showConfidence?: boolean;
    /** Persists a one-shot next-question nudge (roadmap 27.2); disabled once the run has finished. */
    onNudge?: (direction: 'up' | 'down') => void;
    disabled?: boolean;
}

/** Live CEFR level + Elo anchor readout and up/down nudge controls for a generator-engine (roadmap 27.1) placement run in progress, shown in LiveMonitorPage. */
export default function PlacementLevelPanel({
    level,
    eloAnchor,
    questionsAsked,
    levelPath,
    levelPathConfig,
    showConfidence,
    onNudge,
    disabled,
}: PlacementLevelPanelProps) {
    const { t } = useTranslation();
    const confidence = showConfidence && levelPath ? placementConfidence(levelPath, levelPathConfig) : null;

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
            {level ? (
                <span
                    className="badge"
                    title={t('tests.monitor.generator_elo_label', { elo: Math.round(eloAnchor ?? 0) })}
                >
                    {t('tests.monitor.generator_level_label', { level })}
                </span>
            ) : (
                <span className="text-muted">{t('tests.monitor.generator_level_pending')}</span>
            )}
            {level && confidence && <EstimateConfidenceBadge confidence={confidence} />}
            {typeof questionsAsked === 'number' && (
                <span className="text-muted">
                    {t('tests.monitor.generator_questions_asked_label', { count: questionsAsked })}
                </span>
            )}
            {onNudge && (
                <span style={{ display: 'inline-flex', gap: 2 }}>
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        title={t('tests.monitor.nudge_up_button')}
                        aria-label={t('tests.monitor.nudge_up_button')}
                        disabled={disabled}
                        onClick={() => onNudge('up')}
                    >
                        <ChevronUp size={14} />
                    </button>
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        title={t('tests.monitor.nudge_down_button')}
                        aria-label={t('tests.monitor.nudge_down_button')}
                        disabled={disabled}
                        onClick={() => onNudge('down')}
                    >
                        <ChevronDown size={14} />
                    </button>
                </span>
            )}
        </span>
    );
}
