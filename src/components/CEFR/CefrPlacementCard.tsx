import React from 'react';
import { useTranslation } from 'react-i18next';
import CefrBadge from './CefrBadge';
import type { CefrPlacementEstimate } from '../../utils/cefrStudentAggregator';

interface Props {
    placement: CefrPlacementEstimate;
    showCambridgeLabel?: boolean;
}

export default function CefrPlacementCard({ placement, showCambridgeLabel }: Props) {
    const { t } = useTranslation();
    return (
        <div
            className="card"
            style={{
                marginBottom: 24,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                borderLeft: '3px solid var(--yellow)',
            }}
        >
            <CefrBadge level={placement.level} size="md" showCambridgeLabel={showCambridgeLabel} />
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('cefrOverview.placement_badge')}</span>
            <span className="text-muted text-sm">
                {t('cefrOverview.placement_from', {
                    testName: placement.testName,
                    date: new Date(placement.assessedAt).toLocaleDateString(),
                })}
            </span>
        </div>
    );
}
