import React from 'react';
import {
    AlertTriangle,
    ClipboardCopy,
    Hourglass,
    MoveRight,
    PauseCircle,
    Radio,
    ShieldCheck,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PresenceBadge from './PresenceBadge';
import type { ConnectionState, PresenceState, ProctorFlagSummary } from '../../utils/proctorAggregator';
import { elapsedParts, writingPace, type WordSample, type WritingTrend } from '../../utils/monitorSignals';
import { draftChanges } from '../../utils/writingAnalysis';

const TREND_ICON: Record<WritingTrend, { Icon: typeof TrendingUp; color: string }> = {
    speeding_up: { Icon: TrendingUp, color: 'var(--green-text)' },
    steady: { Icon: MoveRight, color: 'var(--text-muted)' },
    slowing: { Icon: TrendingDown, color: 'var(--yellow-text)' },
    stopped: { Icon: PauseCircle, color: 'var(--red-text)' },
};

const TAB_SWITCH_WARNING_THRESHOLD = 3;
const BATTERY_WARNING_LEVEL = 20;
const SPARKLINE_WIDTH = 96;
const SPARKLINE_HEIGHT = 22;

export interface EssayMonitorRow {
    studentId: string;
    displayName: string;
    presence: PresenceState;
    status?: 'submitted' | 'opened' | 'late';
    wordCount?: number;
    wordSamples?: WordSample[];
    lastChangeAt?: number;
    flags: ProctorFlagSummary;
    /** Plain text of the latest snapshot, markup already stripped. */
    draftText?: string;
    /** Plain text of the snapshot before it, so the newly written tail can be highlighted. */
    previousText?: string;
    /** Word counts over time (every few seconds), newest last — the sparkline's series. */
    snapshotWords: number[];
    /** Epoch ms of the newest snapshot that carried draft text, so the age readout is honest about
     * only knowing the prose to the minute. */
    snapshotAgeAt?: number;
    /** Set when the student has not opened the assignment yet, or their signal stopped. */
    connection?: ConnectionState;
    /** Whole minutes since the last signal, when `connection` is 'lost'. */
    silentMinutes?: number;
}

export interface EssayMonitorRosterProps {
    rows: EssayMonitorRow[];
    onWatch: (studentId: string) => void;
    showWritingPace?: boolean;
    now?: number;
}

/** Polyline points for the per-snapshot word-count sparkline; empty when there is nothing to plot. */
function sparklinePoints(values: number[]): string {
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return values
        .map((value, index) => {
            const x = (index / (values.length - 1)) * SPARKLINE_WIDTH;
            const y = SPARKLINE_HEIGHT - ((value - min) / span) * (SPARKLINE_HEIGHT - 4) - 2;
            return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
        })
        .join(' ');
}

export default function EssayMonitorRoster({ rows, onWatch, showWritingPace = false, now }: EssayMonitorRosterProps) {
    const { t } = useTranslation();
    const clock = now ?? Date.now();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="essay-monitor-roster">
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-dim)' }} data-testid="essay-roster-cadence">
                {t('tests.monitor.essay.roster_header', { count: rows.length })}
            </p>
            {rows.map((row) => {
                const finished = row.status === 'submitted' || row.status === 'late';
                const pace =
                    showWritingPace && !finished && row.wordSamples ? writingPace(row.wordSamples, clock) : undefined;
                const sinceChange =
                    showWritingPace && !finished && row.lastChangeAt !== undefined
                        ? elapsedParts(row.lastChangeAt, clock)
                        : undefined;
                const clipboard = row.flags.copyCount + row.flags.cutCount + row.flags.pasteCount;
                const stalled = !finished && row.lastChangeAt !== undefined && clock - row.lastChangeAt >= 4 * 60_000;
                const changes = draftChanges(row.previousText ?? '', row.draftText ?? '');
                const sparkline = sparklinePoints(row.snapshotWords);
                const snapshotAgeMinutes =
                    row.snapshotAgeAt !== undefined ? Math.floor((clock - row.snapshotAgeAt) / 60_000) : undefined;

                return (
                    <div
                        key={row.studentId}
                        data-testid={`essay-row-${row.studentId}`}
                        style={{
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderLeft:
                                row.flags.tabSwitchCount >= TAB_SWITCH_WARNING_THRESHOLD || stalled
                                    ? '3px solid var(--red)'
                                    : '3px solid transparent',
                            borderRadius: 10,
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{row.displayName}</span>
                            <PresenceBadge presence={row.presence} status={row.status} />
                            {row.connection === 'never_opened' && (
                                <span className="badge badge-yellow" data-testid={`essay-connection-${row.studentId}`}>
                                    {t('tests.monitor.signal.never_opened')}
                                </span>
                            )}
                            {row.connection === 'lost' && (
                                <span className="badge badge-red" data-testid={`essay-connection-${row.studentId}`}>
                                    {row.silentMinutes !== undefined && row.silentMinutes >= 1
                                        ? t('tests.monitor.signal.lost', { count: row.silentMinutes })
                                        : t('tests.monitor.signal.lost_now')}
                                </span>
                            )}
                            {row.wordCount !== undefined && (
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {t('tests.monitor.draft.word_count', { count: row.wordCount })}
                                </span>
                            )}
                            {snapshotAgeMinutes !== undefined && (
                                <span
                                    data-testid="essay-snapshot-age"
                                    style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}
                                >
                                    {snapshotAgeMinutes < 1
                                        ? t('tests.monitor.essay.snapshot_within_minute')
                                        : t('tests.monitor.essay.snapshot_age', { count: snapshotAgeMinutes })}
                                </span>
                            )}
                            {pace && (
                                <span
                                    data-testid="writing-pace"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        fontSize: '0.8rem',
                                        color: 'var(--text-muted)',
                                    }}
                                >
                                    {t('tests.monitor.draft.wpm', { count: Math.round(pace.wpm) })}
                                    {pace.trend &&
                                        (() => {
                                            const { Icon, color } = TREND_ICON[pace.trend];
                                            return (
                                                <span
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 3,
                                                        color,
                                                    }}
                                                >
                                                    <Icon size={12} aria-hidden="true" />
                                                    {t(`tests.monitor.draft.trend.${pace.trend}`)}
                                                </span>
                                            );
                                        })()}
                                </span>
                            )}
                            {sinceChange && (
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {t(`tests.monitor.draft.last_typed_${sinceChange.unit}`, {
                                        count: sinceChange.value,
                                    })}
                                </span>
                            )}
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                                {row.flags.tabSwitchCount > 0 && (
                                    <span
                                        className={`badge ${row.flags.tabSwitchCount >= TAB_SWITCH_WARNING_THRESHOLD ? 'badge-red' : 'badge-yellow'}`}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                    >
                                        <AlertTriangle size={11} aria-hidden="true" />
                                        {t('tests.monitor.flags.tabSwitch', { count: row.flags.tabSwitchCount })}
                                    </span>
                                )}
                                {clipboard > 0 && (
                                    <span
                                        className="badge badge-blue"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                    >
                                        <ClipboardCopy size={11} aria-hidden="true" />
                                        {t('tests.monitor.flags.clipboard', { count: clipboard })}
                                    </span>
                                )}
                                {row.flags.battery && row.flags.battery.level <= BATTERY_WARNING_LEVEL && (
                                    <span
                                        className="badge badge-red"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                    >
                                        {t('tests.monitor.flags.battery', {
                                            level: row.flags.battery.level,
                                            charging: row.flags.battery.charging ? '+' : '',
                                        })}
                                    </span>
                                )}
                                {row.flags.sebActive && (
                                    <span
                                        className="badge badge-green"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                    >
                                        <ShieldCheck size={11} aria-hidden="true" />
                                        {t('tests.monitor.flags.seb')}
                                    </span>
                                )}
                                {stalled && (
                                    <span
                                        className="badge badge-yellow"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                    >
                                        <Hourglass size={11} aria-hidden="true" />
                                        {t('tests.monitor.stalled_badge', {
                                            count: Math.floor((clock - (row.lastChangeAt ?? clock)) / 60_000),
                                        })}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => onWatch(row.studentId)}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                                >
                                    <Radio size={13} aria-hidden="true" />
                                    {t('tests.monitor.essay.watch_live')}
                                </button>
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            <p
                                data-testid="essay-snapshot-text"
                                style={{
                                    margin: 0,
                                    flex: 1,
                                    fontSize: '0.85rem',
                                    lineHeight: 1.5,
                                    color: row.draftText ? 'var(--text)' : 'var(--text-dim)',
                                    overflow: 'hidden',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    whiteSpace: 'pre-wrap',
                                }}
                            >
                                {row.draftText ? (
                                    <>
                                        {changes.kept}
                                        {changes.added && (
                                            <mark
                                                style={{
                                                    background: 'color-mix(in srgb, var(--accent) 22%, transparent)',
                                                    color: 'var(--text)',
                                                    borderRadius: 3,
                                                    padding: '0 1px',
                                                }}
                                            >
                                                {changes.kept ? ' ' : ''}
                                                {changes.added}
                                            </mark>
                                        )}
                                    </>
                                ) : (
                                    t('tests.monitor.essay.no_snapshot')
                                )}
                            </p>
                            {sparkline && (
                                <svg
                                    aria-hidden="true"
                                    width={SPARKLINE_WIDTH}
                                    height={SPARKLINE_HEIGHT}
                                    viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
                                    style={{ flexShrink: 0, marginTop: 4 }}
                                >
                                    <polyline
                                        points={sparkline}
                                        fill="none"
                                        stroke="var(--accent)"
                                        strokeWidth="1.5"
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                    />
                                </svg>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
