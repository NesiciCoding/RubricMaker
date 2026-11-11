import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Eye, EyeOff, Pause, Play, Plus, SkipForward, Square, Users } from 'lucide-react';
import QRCode from 'qrcode';
import CefrBadge from '../components/CEFR/CefrBadge';
import { useClasses } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import { LiveWritingAdapter, type LiveWritingProgressRow } from '../services/database/LiveWritingAdapter';
import type { LiveWritingParticipant, LiveWritingSession, LiveWritingTimerSnapshot } from '../types';
import { liveWritingJoinLink, liveWritingStatusKey } from '../utils/liveWriting';

function formatCountdown(ms: number): string {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(totalSeconds / 60)
        .toString()
        .padStart(2, '0')}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
}

/**
 * Classroom projector (#1155). Deliberately has no participant text: only names, word counts and
 * an early CEFR vocabulary estimate (after 25 words). The timer is derived from the database
 * deadline and a server offset, so a refresh cannot drift; polling keeps every projector honest
 * and the broadcast channel is only a hint for a faster refresh.
 */
export default function LiveWritingProjectorPage() {
    const { t } = useTranslation();
    const { sessionId } = useParams<{ sessionId: string }>();
    const { classes } = useClasses();
    const { showToast } = useToast();
    const adapter = useMemo(() => LiveWritingAdapter.forTeacher(), []);

    const [session, setSession] = useState<LiveWritingSession | null>(null);
    const [timer, setTimer] = useState<LiveWritingTimerSnapshot | null>(null);
    const [participants, setParticipants] = useState<LiveWritingParticipant[]>([]);
    const [progress, setProgress] = useState<LiveWritingProgressRow[]>([]);
    const [qr, setQr] = useState('');
    const [clock, setClock] = useState(() => Date.now());
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState(false);

    const applyTimer = useCallback((next: LiveWritingTimerSnapshot) => {
        const serverNow = Date.parse(next.serverNow);
        if (Number.isFinite(serverNow)) setOffset(serverNow - Date.now());
        setTimer(next);
        setSession((current) =>
            current
                ? {
                      ...current,
                      status: next.status,
                      timerState: next.timerState,
                      timerEndsAt: next.endsAt,
                      timerRemainingMs: next.remainingMs,
                      showProgressBoard: next.showProgressBoard,
                  }
                : current
        );
    }, []);

    const refresh = useCallback(async () => {
        if (!adapter || !sessionId) return;
        try {
            const nextTimer = await adapter.getTimer(sessionId);
            applyTimer(nextTimer);
            const [nextSession, people, rows] = await Promise.all([
                adapter.getSession(sessionId),
                adapter.listParticipants(sessionId),
                adapter.fetchProgress(sessionId, nextTimer.currentRound),
            ]);
            setSession(nextSession);
            setParticipants(people);
            setProgress(rows);
            setFailed(false);
        } catch {
            setFailed(true);
        }
    }, [adapter, sessionId, applyTimer]);

    useEffect(() => {
        if (!adapter || !sessionId) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        const tick = () => {
            void refresh().finally(() => {
                if (!cancelled) setLoading(false);
            });
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [adapter, sessionId, refresh]);

    useEffect(() => {
        if (!adapter || !sessionId) return;
        return adapter.subscribeToSession(sessionId, () => void refresh());
    }, [adapter, sessionId, refresh]);

    useEffect(() => {
        const interval = setInterval(() => setClock(Date.now()), 250);
        return () => clearInterval(interval);
    }, []);

    const joinCode = session?.joinCode;
    useEffect(() => {
        if (!joinCode) return;
        let cancelled = false;
        QRCode.toDataURL(liveWritingJoinLink(joinCode), { margin: 1, width: 420 })
            .then((url) => {
                if (!cancelled) setQr(url);
            })
            .catch(() => {
                if (!cancelled) setQr('');
            });
        return () => {
            cancelled = true;
        };
    }, [joinCode]);

    async function start() {
        if (!adapter || !sessionId) return;
        setBusy(true);
        try {
            applyTimer(await adapter.startWriting(sessionId));
            await adapter.broadcastSessionEvent(sessionId, 'timer');
            await refresh();
        } catch {
            showToast(t('liveWriting.projector_action_failed'), 'error');
        } finally {
            setBusy(false);
        }
    }

    async function control(action: 'pause' | 'resume' | 'extend' | 'end_writing' | 'end_session') {
        if (!adapter || !sessionId) return;
        setBusy(true);
        try {
            applyTimer(await adapter.controlTimer(sessionId, action));
            await adapter.broadcastSessionEvent(sessionId, 'timer');
            await refresh();
        } catch {
            showToast(t('liveWriting.projector_action_failed'), 'error');
        } finally {
            setBusy(false);
        }
    }

    async function startNextRound() {
        if (!adapter || !sessionId || !timer) return;
        setBusy(true);
        try {
            applyTimer(await adapter.startRound(sessionId, timer.currentRound + 1));
            await adapter.broadcastSessionEvent(sessionId, 'timer');
            await refresh();
        } catch {
            showToast(t('liveWriting.projector_action_failed'), 'error');
        } finally {
            setBusy(false);
        }
    }

    async function toggleBoard() {
        if (!adapter || !sessionId || !session) return;
        const next = !session.showProgressBoard;
        setBusy(true);
        try {
            const saved = await adapter.setProgressBoard(sessionId, next);
            setSession((current) => (current ? { ...current, showProgressBoard: saved } : current));
            await adapter.broadcastSessionEvent(sessionId, 'progress');
        } catch {
            showToast(t('liveWriting.projector_action_failed'), 'error');
        } finally {
            setBusy(false);
        }
    }

    if (!adapter) {
        return (
            <div style={fullScreen}>
                <p className="text-muted">{t('liveWriting.db_required')}</p>
            </div>
        );
    }

    if (loading && !session) {
        return (
            <div style={fullScreen}>
                <p className="text-muted">{t('liveWriting.loading')}</p>
            </div>
        );
    }

    if (failed || !session || !timer) {
        return (
            <div style={fullScreen}>
                <p className="text-muted" role="alert">
                    {t('liveWriting.load_failed')}
                </p>
                <Link to={`/live/${sessionId ?? ''}`} className="btn btn-ghost" style={{ marginTop: 16 }}>
                    <ArrowLeft size={16} /> {t('liveWriting.projector_back_console')}
                </Link>
            </div>
        );
    }

    const status = timer.status;
    const remainingMs =
        timer.timerState === 'running' && timer.endsAt
            ? Math.max(0, Date.parse(timer.endsAt) - (clock + offset))
            : timer.remainingMs;
    const totalWords = progress.reduce((sum, row) => sum + row.wordCount, 0);
    const maxWords = Math.max(1, ...progress.map((row) => row.wordCount));
    const className = classes.find((cls) => cls.id === session.classId)?.name ?? '';
    const joinLink = liveWritingJoinLink(session.joinCode);

    return (
        <div className="live-writing-projector" style={fullScreen}>
            <header
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    flexWrap: 'wrap',
                    marginBottom: 'clamp(20px, 3vw, 40px)',
                }}
            >
                <div>
                    <div className="text-muted" style={{ fontSize: 15, letterSpacing: 0.6 }}>
                        {t('liveWriting.projector_title')}
                        {className ? ` · ${className}` : ''}
                    </div>
                    <h1 style={{ margin: '4px 0 0', fontSize: 'clamp(26px, 3vw, 44px)', lineHeight: 1.15 }}>
                        {session.title}
                    </h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'right' }}>
                        <div className="text-muted" style={{ fontSize: 12, letterSpacing: 0.6 }}>
                            {t('liveWriting.projector_join_code')}
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: 22, letterSpacing: 2 }}>
                            {session.joinCode}
                        </div>
                    </div>
                    <Link to={`/live/${session.id}`} className="btn btn-ghost">
                        <ArrowLeft size={16} /> {t('liveWriting.projector_back_console')}
                    </Link>
                </div>
            </header>

            {status === 'draft' ? (
                <section className="card" style={panel}>
                    <p className="text-muted" style={{ fontSize: 20 }}>
                        {t('liveWriting.projector_not_open')}
                    </p>
                </section>
            ) : status === 'lobby' ? (
                <Lobby
                    qr={qr}
                    joinLink={joinLink}
                    joinCode={session.joinCode}
                    participants={participants}
                    onStart={() => void start()}
                    busy={busy}
                />
            ) : status === 'writing' ? (
                <section>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0, 1.3fr) minmax(240px, 0.7fr)',
                            gap: 'clamp(20px, 3vw, 40px)',
                            alignItems: 'stretch',
                        }}
                    >
                        <div style={panel}>
                            <div className="text-muted" style={{ fontSize: 15, letterSpacing: 0.6 }}>
                                {t('liveWriting.projector_prompt')}
                            </div>
                            <p
                                style={{
                                    margin: '12px 0 0',
                                    fontSize: 'clamp(24px, 3vw, 44px)',
                                    lineHeight: 1.3,
                                    fontWeight: 600,
                                }}
                            >
                                {session.prompt || t('liveWriting.projector_no_prompt')}
                            </p>
                            {session.imagePath?.startsWith('http') && (
                                <img
                                    src={session.imagePath}
                                    alt=""
                                    style={{
                                        display: 'block',
                                        marginTop: 24,
                                        maxWidth: '100%',
                                        maxHeight: '38vh',
                                        objectFit: 'contain',
                                        borderRadius: 12,
                                    }}
                                />
                            )}
                        </div>
                        <div style={{ ...panel, textAlign: 'center' }}>
                            <div
                                className="text-muted"
                                role="status"
                                aria-live="polite"
                                aria-atomic="true"
                                style={{ fontSize: 15, letterSpacing: 0.6 }}
                            >
                                {timer.timerState === 'paused'
                                    ? t('liveWriting.projector_paused')
                                    : remainingMs <= 0
                                      ? t('liveWriting.projector_times_up')
                                      : t('liveWriting.projector_time_left')}
                            </div>
                            <div
                                role="timer"
                                aria-live="off"
                                aria-label={t('liveWriting.projector_time_remaining', {
                                    time: formatCountdown(remainingMs),
                                })}
                                style={{
                                    fontFamily: 'monospace',
                                    fontVariantNumeric: 'tabular-nums',
                                    fontSize: 'clamp(64px, 11vw, 168px)',
                                    lineHeight: 1,
                                    fontWeight: 800,
                                    letterSpacing: '-0.02em',
                                    color:
                                        timer.timerState === 'paused'
                                            ? 'var(--text-muted)'
                                            : remainingMs <= 0
                                              ? 'var(--danger, #b91c1c)'
                                              : 'var(--text)',
                                }}
                            >
                                {formatCountdown(remainingMs)}
                            </div>
                            <div className="text-muted" style={{ fontSize: 15, marginTop: 8 }}>
                                {t('liveWriting.projector_round_of', {
                                    round: timer.currentRound,
                                    total: timer.roundCount,
                                })}
                            </div>
                            <div
                                style={{
                                    marginTop: 'clamp(16px, 2.5vw, 32px)',
                                    fontSize: 'clamp(28px, 3.4vw, 52px)',
                                    fontWeight: 800,
                                }}
                            >
                                {totalWords}
                            </div>
                            <div className="text-muted" style={{ fontSize: 15 }}>
                                {t('liveWriting.projector_class_words')}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
                        {timer.timerState === 'running' && (
                            <button
                                type="button"
                                className="btn btn-ghost"
                                disabled={busy}
                                onClick={() => void control('pause')}
                                style={controlButton}
                            >
                                <Pause size={20} /> {t('liveWriting.projector_pause')}
                            </button>
                        )}
                        {timer.timerState === 'paused' && (
                            <button
                                type="button"
                                className="btn btn-primary"
                                disabled={busy}
                                onClick={() => void control('resume')}
                                style={controlButton}
                            >
                                <Play size={20} /> {t('liveWriting.projector_resume')}
                            </button>
                        )}
                        {(timer.timerState === 'running' || timer.timerState === 'paused') && (
                            <button
                                type="button"
                                className="btn btn-ghost"
                                disabled={busy}
                                onClick={() => void control('extend')}
                                style={controlButton}
                            >
                                <Plus size={20} /> {t('liveWriting.projector_add_minute')}
                            </button>
                        )}
                        <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={busy}
                            onClick={() => void control('end_writing')}
                            style={controlButton}
                        >
                            <Square size={18} /> {t('liveWriting.projector_end_writing')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={busy}
                            onClick={() => void control('end_session')}
                            style={controlButton}
                        >
                            {t('liveWriting.projector_end_session')}
                        </button>
                    </div>

                    {session.showProgressBoard && (
                        <ProgressBoard
                            rows={progress}
                            maxWords={maxWords}
                            onHide={() => void toggleBoard()}
                            busy={busy}
                        />
                    )}
                    {!session.showProgressBoard && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ marginTop: 24 }}
                            disabled={busy}
                            onClick={() => void toggleBoard()}
                        >
                            <Eye size={16} /> {t('liveWriting.projector_show_progress')}
                        </button>
                    )}
                </section>
            ) : (
                <section className="card" style={panel}>
                    <div className="text-muted" style={{ fontSize: 15, letterSpacing: 0.6 }}>
                        {t(liveWritingStatusKey(status))}
                    </div>
                    <p style={{ fontSize: 'clamp(22px, 2.4vw, 34px)', margin: '12px 0 8px' }}>
                        {status === 'voting'
                            ? t('liveWriting.projector_voting')
                            : status === 'closed'
                              ? t('liveWriting.projector_closed')
                              : t('liveWriting.projector_waiting')}
                    </p>
                    <p className="text-muted" style={{ fontSize: 17 }}>
                        {t('liveWriting.participants_count', { count: participants.length })}
                    </p>
                    {(status === 'voting' || status === 'finals') && timer.currentRound < timer.roundCount && (
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busy}
                            onClick={() => void startNextRound()}
                            style={{ ...controlButton, marginTop: 16 }}
                        >
                            <SkipForward size={20} />{' '}
                            {t('liveWriting.projector_start_next_round', {
                                round: timer.currentRound + 1,
                            })}
                        </button>
                    )}
                    {status !== 'closed' && (
                        <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={busy}
                            onClick={() => void control('end_session')}
                            style={{ ...controlButton, marginTop: 16, marginLeft: 8 }}
                        >
                            {t('liveWriting.projector_end_session')}
                        </button>
                    )}
                </section>
            )}
        </div>
    );
}

function Lobby({
    qr,
    joinLink,
    joinCode,
    participants,
    onStart,
    busy,
}: {
    qr: string;
    joinLink: string;
    joinCode: string;
    participants: LiveWritingParticipant[];
    onStart: () => void;
    busy: boolean;
}) {
    const { t } = useTranslation();
    return (
        <section
            className="card"
            style={{
                ...panel,
                display: 'grid',
                gridTemplateColumns: 'minmax(220px, 320px) minmax(0, 1fr)',
                gap: 'clamp(24px, 5vw, 64px)',
                alignItems: 'center',
            }}
        >
            <div
                style={{
                    background: '#fff',
                    borderRadius: 18,
                    padding: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 220,
                }}
            >
                {qr ? (
                    <img
                        src={qr}
                        alt={t('liveWriting.projector_qr_alt', { code: joinCode })}
                        style={{ width: '100%', height: 'auto', display: 'block' }}
                    />
                ) : (
                    <span style={{ color: '#111', fontFamily: 'monospace', fontSize: 28 }}>{joinCode}</span>
                )}
            </div>
            <div>
                <div className="text-muted" style={{ fontSize: 15, letterSpacing: 0.6 }}>
                    {t('liveWriting.projector_scan')}
                </div>
                <div
                    style={{
                        fontFamily: 'monospace',
                        fontWeight: 800,
                        fontSize: 'clamp(40px, 7vw, 88px)',
                        letterSpacing: '0.08em',
                        lineHeight: 1.05,
                        margin: '6px 0 10px',
                    }}
                >
                    {joinCode}
                </div>
                <div
                    style={{
                        fontFamily: 'monospace',
                        fontSize: 'clamp(13px, 1.5vw, 20px)',
                        color: 'var(--text-muted)',
                        wordBreak: 'break-all',
                    }}
                >
                    {joinLink}
                </div>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        marginTop: 24,
                        fontSize: 'clamp(18px, 2vw, 26px)',
                        fontWeight: 700,
                    }}
                >
                    <Users size={24} /> {t('liveWriting.participants_count', { count: participants.length })}
                </div>
                {participants.length === 0 ? (
                    <p className="text-muted" style={{ fontSize: 17 }}>
                        {t('liveWriting.projector_no_students')}
                    </p>
                ) : (
                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 8,
                            marginTop: 14,
                            maxHeight: '24vh',
                            overflow: 'auto',
                        }}
                    >
                        {participants.map((participant) => (
                            <span
                                key={participant.id}
                                style={{
                                    padding: '7px 12px',
                                    borderRadius: 999,
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border)',
                                    fontSize: 17,
                                }}
                            >
                                {participant.displayName}
                            </span>
                        ))}
                    </div>
                )}
                <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || participants.length === 0}
                    onClick={onStart}
                    style={{ ...controlButton, marginTop: 24 }}
                >
                    <Play size={20} /> {t('liveWriting.projector_start')}
                </button>
                {participants.length === 0 && (
                    <p className="text-muted" style={{ fontSize: 14, marginTop: 8 }}>
                        {t('liveWriting.projector_start_hint')}
                    </p>
                )}
            </div>
        </section>
    );
}

function ProgressBoard({
    rows,
    maxWords,
    onHide,
    busy,
}: {
    rows: LiveWritingProgressRow[];
    maxWords: number;
    onHide: () => void;
    busy: boolean;
}) {
    const { t } = useTranslation();
    return (
        <section aria-labelledby="live-writing-progress-title" style={{ ...panel, marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <h2 id="live-writing-progress-title" style={{ margin: 0, fontSize: 22 }}>
                    {t('liveWriting.projector_progress')}
                </h2>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onHide}>
                    <EyeOff size={16} /> {t('liveWriting.projector_hide_progress')}
                </button>
            </div>
            {rows.length === 0 ? (
                <p className="text-muted" style={{ marginBottom: 0 }}>
                    {t('liveWriting.projector_no_progress')}
                </p>
            ) : (
                <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
                    {rows.map((row) => (
                        <div
                            key={row.participantId}
                            role="group"
                            aria-label={t('liveWriting.projector_progress_row', {
                                name: row.displayName,
                                count: row.wordCount,
                            })}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(120px, 220px) minmax(0, 1fr) 80px 64px',
                                gap: 14,
                                alignItems: 'center',
                                fontSize: 18,
                            }}
                        >
                            <span
                                style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    fontWeight: 600,
                                }}
                            >
                                {row.displayName}
                            </span>
                            <span
                                role="progressbar"
                                aria-valuemin={0}
                                aria-valuemax={maxWords}
                                aria-valuenow={row.wordCount}
                                aria-label={t('liveWriting.projector_progress_row', {
                                    name: row.displayName,
                                    count: row.wordCount,
                                })}
                                style={{
                                    height: 16,
                                    borderRadius: 999,
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border)',
                                    overflow: 'hidden',
                                }}
                            >
                                <span
                                    style={{
                                        display: 'block',
                                        height: '100%',
                                        width: `${Math.round((row.wordCount / maxWords) * 100)}%`,
                                        background: 'var(--accent)',
                                        borderRadius: 999,
                                    }}
                                />
                            </span>
                            <span style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontWeight: 700 }}>
                                {row.wordCount}
                            </span>
                            {row.cefrEstimate && row.wordCount >= 25 ? (
                                <CefrBadge
                                    level={row.cefrEstimate}
                                    size="lg"
                                    title={t('liveWriting.projector_cefr_estimate')}
                                />
                            ) : (
                                <span className="text-muted" style={{ fontSize: 13 }} aria-hidden="true">
                                    —
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}
            <p className="text-muted" style={{ fontSize: 13, margin: '14px 0 0' }}>
                {t('liveWriting.projector_progress_note')}
            </p>
        </section>
    );
}

const fullScreen = {
    minHeight: '100vh',
    background: 'var(--bg)',
    color: 'var(--text)',
    padding: 'clamp(20px, 4vw, 56px)',
} as const;

const panel = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 18,
    padding: 'clamp(20px, 3vw, 36px)',
} as const;

const controlButton = {
    fontSize: 17,
    padding: '11px 18px',
} as const;
