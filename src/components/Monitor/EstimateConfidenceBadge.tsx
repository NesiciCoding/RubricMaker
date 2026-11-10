import { useTranslation } from 'react-i18next';
import type { PlacementConfidence } from '../../utils/placementConfidence';

const BADGE_CLASS: Record<PlacementConfidence, string> = {
    low: 'badge',
    medium: 'badge badge-yellow',
    high: 'badge badge-green',
};

/** Opt-in read of how settled a placement level estimate is, next to the level itself. */
export default function EstimateConfidenceBadge({ confidence }: { confidence: PlacementConfidence }) {
    const { t } = useTranslation();
    return (
        <span
            className={BADGE_CLASS[confidence]}
            data-testid="estimate-confidence"
            data-confidence={confidence}
            title={t(`tests.monitor.confidence_${confidence}_help`)}
        >
            {t(`tests.monitor.confidence_${confidence}`)}
        </span>
    );
}
