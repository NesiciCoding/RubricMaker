import React from 'react';
import { ArrowLeft, Radio, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LiveDraftPanel from './LiveDraftPanel';
import EssayTimeline from './EssayTimeline';
import type { PresenceState, ProctorFlagSummary } from '../../utils/proctorAggregator';
import type { WordSample } from '../../utils/monitorSignals';
import { buildTimeline } from '../../utils/monitorTimeline';
import { analyzeDraft } from '../../utils/writingAnalysis';
import type { ProctorEvent } from '../../types';

export interface EssaySpotlightSnapshot {
    at: number;
    words?: number;
}

export interface EssaySpotlightProps {
    displayName: string;
    presence: PresenceState;
    status?: 'submitted' | 'opened' | 'late';
    wordCount?: number;
    wordSamples?: WordSample[];
    lastChangeAt?: number;
    lastActivityAt?: string;
    draftText?: string;
    /** Snapshot history, newest first. */
    snapshots: EssaySpotlightSnapshot[];
    /** Proctoring events (persisted and live), already merged by the caller. */
    events?: ProctorEvent[];
    flags?: ProctorFlagSummary;
    showWritingPace?: boolean;
    onNudge?: () => void;
    onLeave: () => void;
    now?: number;
}

const cardStyle: React.CSSProperties = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

const headingStyle: React.CSSProperties = {
    margin: '0 0 4px',
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--text-dim)',
};

function rowStyle(): React.CSSProperties {
    return {
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10,
        fontSize: '0.82rem',
        color: 'var(--text)',
    };
}

export default function EssaySpotlight({
    displayName,
    presence,
    status,
    wordCount,
    wordSamples,
    lastChangeAt,
    lastActivityAt,
    draftText,
    snapshots,
    events,
    flags,
    showWritingPace = false,
    onNudge,
    onLeave,
    now,
}: EssaySpotlightProps) {
    const { t } = useTranslation();
    const stats = analyzeDraft(draftText ?? '');
    const clock = now ?? Date.now();
    const timeline = buildTimeline(wordSamples ?? [], events ?? [], clock);

    return (
        <div data-testid="essay-spotlight" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={onLeave}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                    <ArrowLeft size={14} aria-hidden="true" />
                    {t('tests.monitor.essay.back')}
                </button>
                <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Radio size={11} aria-hidden="true" />
                    {t('tests.monitor.essay.spotlight')}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    {t('tests.monitor.essay.spotlight_note')}
                </span>
            </div>

            <LiveDraftPanel
                displayName={displayName}
                presence={presence}
                status={status}
                wordCount={wordCount}
                lastActivityAt={lastActivityAt}
                draftText={draftText}
                showWritingPace={showWritingPace}
                wordSamples={wordSamples}
                lastChangeAt={lastChangeAt}
                now={clock}
                defaultExpanded
            />

            <EssayTimeline timeline={timeline} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
                <div style={cardStyle} data-testid="essay-draft-analysis">
                    <h3 style={headingStyle}>{t('tests.monitor.essay.analysis')}</h3>
                    <div style={rowStyle()}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('tests.monitor.essay.sentences')}</span>
                        <span>{stats.sentences}</span>
                    </div>
                    <div style={rowStyle()}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('tests.monitor.essay.paragraphs')}</span>
                        <span>{stats.paragraphs}</span>
                    </div>
                    <div style={rowStyle()}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('tests.monitor.essay.avg_sentence')}</span>
                        <span>{t('tests.monitor.essay.words_unit', { count: stats.avgSentenceWords })}</span>
                    </div>
                    <div style={rowStyle()}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('tests.monitor.essay.longest_sentence')}</span>
                        <span
                            style={{
                                color: stats.longestSentenceWords > 30 ? 'var(--yellow-text)' : 'var(--text)',
                            }}
                        >
                            {t('tests.monitor.essay.words_unit', { count: stats.longestSentenceWords })}
                        </span>
                    </div>
                    <div style={rowStyle()}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('tests.monitor.essay.variety')}</span>
                        <span>{Math.round(stats.vocabularyVariety * 100)}%</span>
                    </div>
                    {stats.repeatedWords.length > 0 && (
                        <div style={rowStyle()}>
                            <span style={{ color: 'var(--text-muted)' }}>{t('tests.monitor.essay.repeated')}</span>
                            <span>{stats.repeatedWords.map((r) => `${r.word} ×${r.count}`).join(' · ')}</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {stats.linkingWords.length === 0 ? (
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                                {t('tests.monitor.essay.no_linking')}
                            </span>
                        ) : (
                            stats.linkingWords.map((word) => (
                                <span key={word} className="badge badge-blue">
                                    {word}
                                </span>
                            ))
                        )}
                    </div>
                </div>

                <div style={cardStyle} data-testid="essay-snapshot-log">
                    <h3 style={headingStyle}>
                        {t('tests.monitor.essay.snapshots')} · {t('tests.monitor.essay.spotlight')}
                    </h3>
                    {snapshots.length === 0 ? (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                            {t('tests.monitor.essay.no_snapshot')}
                        </span>
                    ) : (
                        snapshots.map((snap, index) => {
                            const previous = snapshots[index + 1]?.words;
                            const delta =
                                snap.words !== undefined && previous !== undefined ? snap.words - previous : undefined;
                            return (
                                <div key={snap.at} style={rowStyle()}>
                                    <span style={{ color: 'var(--text-dim)' }}>
                                        {new Date(snap.at).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            second: '2-digit',
                                        })}
                                    </span>
                                    <span style={{ color: 'var(--text-muted)', flex: 1 }}>
                                        {index === 0
                                            ? t('tests.monitor.essay.snapshot_current')
                                            : delta === 0
                                              ? t('tests.monitor.essay.snapshot_no_change')
                                              : t('tests.monitor.essay.snapshot_taken')}
                                    </span>
                                    <span
                                        style={{
                                            minWidth: 36,
                                            textAlign: 'right',
                                            color:
                                                delta === undefined || delta === 0
                                                    ? 'var(--text-dim)'
                                                    : 'var(--green-text)',
                                        }}
                                    >
                                        {delta === undefined ? '—' : `${delta > 0 ? '+' : ''}${delta}`}
                                    </span>
                                </div>
                            );
                        })
                    )}
                </div>

                <div style={cardStyle} data-testid="essay-proctoring">
                    <h3 style={headingStyle}>{t('tests.monitor.essay.proctoring')}</h3>
                    <div style={rowStyle()}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('tests.monitor.essay.tab_switches')}</span>
                        <span
                            style={{ color: (flags?.tabSwitchCount ?? 0) > 0 ? 'var(--yellow-text)' : 'var(--text)' }}
                        >
                            {flags?.tabSwitchCount ?? 0}
                        </span>
                    </div>
                    <div style={rowStyle()}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('tests.monitor.essay.clipboard')}</span>
                        <span>{(flags?.copyCount ?? 0) + (flags?.cutCount ?? 0) + (flags?.pasteCount ?? 0)}</span>
                    </div>
                    <div style={rowStyle()}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('tests.monitor.essay.battery')}</span>
                        <span>
                            {flags?.battery
                                ? `${flags.battery.level}%${flags.battery.charging ? ' · ' + t('tests.monitor.essay.charging') : ''}`
                                : '—'}
                        </span>
                    </div>
                    <div style={rowStyle()}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('tests.monitor.flags.seb')}</span>
                        <span style={{ color: flags?.sebActive ? 'var(--green-text)' : 'var(--text-dim)' }}>
                            {flags?.sebActive ? t('tests.monitor.essay.on') : t('tests.monitor.essay.off')}
                        </span>
                    </div>
                    {onNudge && (
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={onNudge}
                            style={{
                                marginTop: 6,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                justifyContent: 'center',
                            }}
                        >
                            <Send size={13} aria-hidden="true" />
                            {t('tests.monitor.nudge_button')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
