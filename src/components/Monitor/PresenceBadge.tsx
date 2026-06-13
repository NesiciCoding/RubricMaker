import React from 'react';
import { Send, FolderOpen, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PresenceState } from '../../utils/proctorAggregator';

const PRESENCE_COLORS: Record<PresenceState, string> = {
    active: 'var(--green)',
    idle: 'var(--yellow)',
    disconnected: 'var(--text-dim)',
};

export interface PresenceBadgeProps {
    presence: PresenceState;
    /** Optional submission status shown alongside the presence dot. */
    status?: 'submitted' | 'opened' | 'late';
}

export default function PresenceBadge({ presence, status }: PresenceBadgeProps) {
    const { t } = useTranslation();

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
            <span
                aria-hidden="true"
                style={{
                    display: 'inline-block',
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: PRESENCE_COLORS[presence],
                    flexShrink: 0,
                }}
            />
            <span style={{ color: 'var(--text)' }}>{t(`tests.monitor.presence.${presence}`)}</span>
            {status === 'submitted' && (
                <span
                    title={t('tests.monitor.status.submitted')}
                    aria-label={t('tests.monitor.status.submitted')}
                    style={{ display: 'inline-flex', color: 'var(--green)' }}
                >
                    <Send size={12} />
                </span>
            )}
            {status === 'opened' && (
                <span
                    title={t('tests.monitor.status.opened')}
                    aria-label={t('tests.monitor.status.opened')}
                    style={{ display: 'inline-flex', color: 'var(--text-muted)' }}
                >
                    <FolderOpen size={12} />
                </span>
            )}
            {status === 'late' && (
                <span
                    title={t('tests.monitor.status.late')}
                    aria-label={t('tests.monitor.status.late')}
                    style={{ display: 'inline-flex', color: 'var(--red)' }}
                >
                    <Clock size={12} />
                </span>
            )}
        </span>
    );
}
