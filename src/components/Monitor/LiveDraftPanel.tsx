import React, { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, MoveRight, PauseCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PresenceBadge from './PresenceBadge';
import type { PresenceState } from '../../utils/proctorAggregator';
import { elapsedParts, writingPace, type WordSample, type WritingTrend } from '../../utils/monitorSignals';

const TREND_ICON: Record<WritingTrend, { Icon: typeof TrendingUp; color: string }> = {
    speeding_up: { Icon: TrendingUp, color: 'var(--green-text)' },
    steady: { Icon: MoveRight, color: 'var(--text-muted)' },
    slowing: { Icon: TrendingDown, color: 'var(--yellow-text)' },
    stopped: { Icon: PauseCircle, color: 'var(--red-text)' },
};

export interface LiveDraftPanelProps {
    displayName: string;
    presence: PresenceState;
    status?: 'submitted' | 'opened' | 'late';
    wordCount?: number;
    /** ISO timestamp of the last received snapshot/heartbeat, if any. */
    lastActivityAt?: string;
    /** Live draft text from the snapshot broadcast, stripped of markup. */
    draftText?: string;
    /** Adds words-per-minute, its trend, and the time since the draft last changed. */
    showWritingPace?: boolean;
    wordSamples?: WordSample[];
    /** Epoch ms of the last snapshot whose text changed — snapshots are only sent on change, so this tracks the last keystroke to within a few seconds. */
    lastChangeAt?: number;
    /** Epoch ms the page last ticked; passed in so every panel ages from the same clock. */
    now?: number;
}

export default function LiveDraftPanel({
    displayName,
    presence,
    status,
    wordCount,
    lastActivityAt,
    draftText,
    showWritingPace = false,
    wordSamples,
    lastChangeAt,
    now,
}: LiveDraftPanelProps) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const clock = now ?? lastChangeAt ?? 0;
    const finished = status === 'submitted' || status === 'late';
    const pace = showWritingPace && !finished && wordSamples ? writingPace(wordSamples, clock) : undefined;
    const sinceChange =
        showWritingPace && !finished && lastChangeAt !== undefined ? elapsedParts(lastChangeAt, clock) : undefined;

    return (
        <div
            style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '12px 14px',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{displayName}</span>
                    <PresenceBadge presence={presence} status={status} />
                </div>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        fontSize: '0.8rem',
                        color: 'var(--text-muted)',
                    }}
                >
                    {wordCount !== undefined && (
                        <span>{t('tests.monitor.draft.word_count', { count: wordCount })}</span>
                    )}
                    {pace && (
                        <span
                            data-testid="writing-pace"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                            {t('tests.monitor.draft.wpm', { count: Math.round(pace.wpm) })}
                            {pace.trend &&
                                (() => {
                                    const { Icon, color } = TREND_ICON[pace.trend];
                                    return (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color }}>
                                            <Icon size={12} aria-hidden="true" />
                                            {t(`tests.monitor.draft.trend.${pace.trend}`)}
                                        </span>
                                    );
                                })()}
                        </span>
                    )}
                    {sinceChange && (
                        <span data-testid="since-last-change">
                            {t(`tests.monitor.draft.last_typed_${sinceChange.unit}`, { count: sinceChange.value })}
                        </span>
                    )}
                    {lastActivityAt && (
                        <span>
                            {t('tests.monitor.draft.last_activity', {
                                time: new Date(lastActivityAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                }),
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
