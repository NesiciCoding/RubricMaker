import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PresenceBadge from './PresenceBadge';
import type { PresenceState } from '../../utils/proctorAggregator';

export interface LiveDraftPanelProps {
    displayName: string;
    presence: PresenceState;
    status?: 'submitted' | 'opened' | 'late';
    wordCount?: number;
    /** ISO timestamp of the last received snapshot/heartbeat, if any. */
    lastActivityAt?: string;
    /** Live draft text from the snapshot broadcast, stripped of markup. */
    draftText?: string;
}

export default function LiveDraftPanel({
    displayName,
    presence,
    status,
    wordCount,
    lastActivityAt,
    draftText,
}: LiveDraftPanelProps) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);

    return (
        <div
            style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '12px 14px',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{displayName}</span>
                    <PresenceBadge presence={presence} status={status} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {wordCount !== undefined && <span>{t('tests.monitor.draft.word_count', { count: wordCount })}</span>}
                    {lastActivityAt && (
                        <span>
                            {t('tests.monitor.draft.last_activity', {
                                time: new Date(lastActivityAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            })}
                        </span>
                    )}
                    {draftText !== undefined && (
                        <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => setExpanded((e) => !e)}
                            aria-expanded={expanded}
                            aria-label={t('tests.monitor.draft.toggle_preview')}
                        >
                            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                    )}
                </div>
            </div>
            {expanded && (
                <div
                    style={{
                        marginTop: 10,
                        padding: '10px 12px',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: '0.85rem',
                        color: 'var(--text)',
                        maxHeight: 200,
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                    }}
                >
                    {draftText || t('tests.monitor.draft.empty')}
                </div>
            )}
        </div>
    );
}
