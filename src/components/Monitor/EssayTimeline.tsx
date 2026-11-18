import React from 'react';
import { useTranslation } from 'react-i18next';
import type { MonitorTimeline, TimelineMarkerKind } from '../../utils/monitorTimeline';
import type { WordSample } from '../../utils/monitorSignals';

const WIDTH = 360;
const HEIGHT = 64;
const PAD = 7;
/** A pause is worth calling out in words once it is this long. */
const FLAT_CALLOUT_MINUTES = 5;

const MARKER_COLOR: Record<TimelineMarkerKind, string> = {
    tab_switch: 'var(--yellow-text)',
    paste: 'var(--accent-text)',
    idle: 'var(--text-dim)',
};

function clock(at: number): string {
    return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

/**
 * The spotlight's word-count curve with the proctoring events laid over it — the rhythm of a
 * lesson ("flat for nine minutes, then 140 words") that three separate badges make the teacher
 * recompute from numbers.
 */
export default function EssayTimeline({ timeline }: { timeline: MonitorTimeline }) {
    const { t } = useTranslation();
    const { points, markers, from, to, longestFlatMinutes } = timeline;
    const span = Math.max(to - from, 1);
    const maxWords = Math.max(1, ...points.map((point: WordSample) => point.words));
    const x = (at: number) => PAD + ((at - from) / span) * (WIDTH - PAD * 2);
    const y = (words: number) => HEIGHT - PAD - (words / maxWords) * (HEIGHT - PAD * 2);
    const curve = points.map((point) => `${x(point.at).toFixed(1)},${y(point.words).toFixed(1)}`).join(' ');
    const kinds = [...new Set(markers.map((marker) => marker.kind))];

    return (
        <div style={cardStyle} data-testid="essay-timeline">
            <h3 style={headingStyle}>{t('tests.monitor.timeline.title')}</h3>
            {points.length < 2 ? (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    {t('tests.monitor.timeline.empty')}
                </span>
            ) : (
                <>
                    <svg
                        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                        role="img"
                        aria-label={t('tests.monitor.timeline.title')}
                        style={{ width: '100%', height: 'auto' }}
                    >
                        <line
                            x1={PAD}
                            x2={WIDTH - PAD}
                            y1={HEIGHT - PAD}
                            y2={HEIGHT - PAD}
                            stroke="var(--border)"
                            strokeWidth={1}
                        />
                        {markers.map((marker, index) => (
                            <line
                                key={`${marker.kind}-${marker.at}-${index}`}
                                x1={x(marker.at)}
                                x2={x(marker.at)}
                                y1={PAD}
                                y2={HEIGHT - PAD}
                                stroke={MARKER_COLOR[marker.kind]}
                                strokeWidth={marker.kind === 'idle' ? 3 : 1.5}
                                strokeDasharray={marker.kind === 'idle' ? '3 3' : undefined}
                                opacity={0.75}
                            />
                        ))}
                        <polyline
                            points={curve}
                            fill="none"
                            stroke="var(--accent-text)"
                            strokeWidth={2}
                            strokeLinejoin="round"
                        />
                    </svg>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '0.72rem',
                            color: 'var(--text-dim)',
                        }}
                    >
                        <span>{clock(from)}</span>
                        <span>{clock(to)}</span>
                    </div>
                    {longestFlatMinutes >= FLAT_CALLOUT_MINUTES && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--yellow-text)' }}>
                            {t('tests.monitor.timeline.flat', { count: longestFlatMinutes })}
                        </span>
                    )}
                    {kinds.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                            {kinds.map((kind) => (
                                <span
                                    key={kind}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        fontSize: '0.72rem',
                                        color: 'var(--text-muted)',
                                    }}
                                >
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            width: 3,
                                            height: 10,
                                            background: MARKER_COLOR[kind],
                                            display: 'inline-block',
                                        }}
                                    />
                                    {t(`tests.monitor.timeline.marker.${kind}`)}
                                </span>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
