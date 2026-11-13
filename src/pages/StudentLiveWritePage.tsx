import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Clock, Lightbulb, Loader2 } from 'lucide-react';
import CefrBadge from '../components/CEFR/CefrBadge';
import EssayEditor from '../components/Editor/EssayEditor';
import { LiveWritingAdapter } from '../services/database/LiveWritingAdapter';
import type { CefrLevel, LiveWritingRosterEntry, LiveWritingStudentState } from '../types';
import { countWords } from '../utils/essayUtils';
import {
    isCompleteJoinCode,
    liveWritingCefrEstimate,
    LIVE_WRITING_CEFR_MIN_WORDS,
    normalizeJoinCode,
} from '../utils/liveWriting';

const JOIN_STORAGE_PREFIX = 'rm_live_write_join:';

interface StoredJoin {
    participantId: string;
    joinToken: string;
}

function joinStorageKey(code: string): string {
    return `${JOIN_STORAGE_PREFIX}${normalizeJoinCode(code)}`;
}

function readStoredJoin(code: string): StoredJoin | null {
    if (!isCompleteJoinCode(code)) return null;
    try {
        const raw = sessionStorage.getItem(joinStorageKey(code));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<StoredJoin>;
        if (typeof parsed.participantId === 'string' && typeof parsed.joinToken === 'string') {
            return { participantId: parsed.participantId, joinToken: parsed.joinToken };
        }
    } catch {
        // Private browsing or a corrupt value: fall back to the name picker.
    }
    return null;
}

function writeStoredJoin(code: string, join: StoredJoin): void {
    try {
        sessionStorage.setItem(joinStorageKey(code), JSON.stringify(join));
    } catch {
        // The session still works; only reload-resume is unavailable.
    }
}

function clearStoredJoin(code: string): void {
    try {
        sessionStorage.removeItem(joinStorageKey(code));
    } catch {
        // Nothing to clear when storage is unavailable.
    }
}

function errorKey(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('too_many_attempts')) return 'liveWriting.too_many_attempts';
    if (message.includes('student_not_in_class')) return 'liveWriting.student_not_in_class';
    if (message.includes('invalid_code')) return 'liveWriting.invalid_code';
    return 'liveWriting.join_failed';
}

function formatCountdown(ms: number): string {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(totalSeconds / 60)
        .toString()
        .padStart(2, '0')}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
}

/**
 * Student writing screen (#1158). It deliberately lives outside AppProvider and only calls the
 * token-scoped student RPCs. The database owns the timer and word count; this screen restores the
 * participant's own draft after a reload and never exposes another student's text.
 */
export default function StudentLiveWritePage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { code: routeCode } = useParams<{ code: string }>();
    const adapter = useMemo(() => LiveWritingAdapter.forStudent(), []);

    const [code, setCode] = useState(routeCode ?? '');
    const [roster, setRoster] = useState<LiveWritingRosterEntry[] | null>(null);
    const [join, setJoin] = useState<StoredJoin | null>(null);
    const [state, setState] = useState<LiveWritingStudentState | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(adapter ? null : 'liveWriting.join_unavailable');
    const [reconnecting, setReconnecting] = useState(false);

    const [html, setHtml] = useState('');
    const [readyRound, setReadyRound] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<Date | null>(null);
    const [saveError, setSaveError] = useState(false);
    const [handingIn, setHandingIn] = useState(false);
    const [handInError, setHandInError] = useState(false);
    const [revealedHints, setRevealedHints] = useState(0);
    const [offset, setOffset] = useState(0);
    const [clock, setClock] = useState(() => Date.now());
    const [timerAnnouncement, setTimerAnnouncement] = useState('');

    const htmlRef = useRef('');
    const savingRef = useRef(false);
    const handingInRef = useRef(false);
    const loadedRoundRef = useRef('');
    const lastSavedHtmlRef = useRef('');
    const lastAutoAttemptRef = useRef(0);
    const retryTimerRef = useRef<number | null>(null);

    useEffect(() => {
        htmlRef.current = html;
    }, [html]);

    const lookup = useCallback(
        async (raw: string) => {
            if (!adapter) {
                setError('liveWriting.join_unavailable');
                return;
            }
            if (!isCompleteJoinCode(raw)) {
                setError('liveWriting.invalid_code');
                return;
            }
            setBusy(true);
            setError(null);
            setRoster(null);
            setJoin(null);
            setState(null);
            setReadyRound(null);
            try {
                const names = await adapter.roster(normalizeJoinCode(raw));
                if (names.length === 0) {
                    setError('liveWriting.not_in_class');
                } else {
                    setRoster(names);
                }
            } catch (err) {
                setError(errorKey(err));
            } finally {
                setBusy(false);
            }
        },
        [adapter]
    );

    // A per-tab participant token is what makes reload/reconnect resume the same row instead of
    // creating a second one. Per-tab (not localStorage) matters on a shared classroom device:
    // the next student who opens the link gets the picker, while joining still reuses their row.
    useEffect(() => {
        setCode(routeCode ?? '');
        setRoster(null);
        setJoin(null);
        setState(null);
        setReadyRound(null);
        setError(null);
        setReconnecting(false);
        if (!routeCode) return;
        if (!isCompleteJoinCode(routeCode)) {
            setError('liveWriting.invalid_code');
            return;
        }
        const stored = readStoredJoin(routeCode);
        if (stored) setJoin(stored);
        else void lookup(routeCode);
    }, [routeCode, lookup]);

    useEffect(() => {
        if (!adapter || !join) return;
        let cancelled = false;
        let inFlight = false;

        const pull = async () => {
            if (inFlight) return;
            inFlight = true;
            try {
                const next = await adapter.getStudentState(join.participantId, join.joinToken);
                if (cancelled) return;
                const serverNow = Date.parse(next.serverNow);
                if (Number.isFinite(serverNow)) setOffset(serverNow - Date.now());
                setState(next);
                setReconnecting(false);
            } catch (err) {
                if (cancelled) return;
                const message = err instanceof Error ? err.message : '';
                if (message.includes('invalid_token')) {
                    clearStoredJoin(code);
                    setJoin(null);
                    setState(null);
                    setReadyRound(null);
                    setError('liveWriting.student_session_invalid');
                    void lookup(code);
                } else {
                    setReconnecting(true);
                }
            } finally {
                inFlight = false;
            }
        };

        void pull();
        const interval = window.setInterval(() => void pull(), 1000);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [adapter, join, code, lookup]);

    useEffect(() => {
        const interval = window.setInterval(() => setClock(Date.now()), 250);
        return () => window.clearInterval(interval);
    }, []);

    useEffect(
        () => () => {
            if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
        },
        []
    );

    const sessionStatus = state?.status;
    const timerState = state?.timerState;
    const currentRound = state?.currentRound ?? 0;
    const handedInAt = state?.handedInAt;

    // Load a round's server draft once, and start a clean editor only when the teacher advances
    // the round. Polling the same round never overwrites what the student is currently typing.
    useEffect(() => {
        if (!state) return;
        const key = `${state.participantId}:${state.currentRound}`;
        if (loadedRoundRef.current === key) return;
        loadedRoundRef.current = key;
        lastSavedHtmlRef.current = state.contentHtml;
        setHtml(state.contentHtml);
        setReadyRound(state.currentRound);
        setSavedAt(null);
        setSaveError(false);
        setHandInError(false);
        setRevealedHints(0);
    }, [state]);

    const saveNow = useCallback(
        async (content: string) => {
            if (!adapter || !join || sessionStatus !== 'writing' || handedInAt || !currentRound) return false;
            if (savingRef.current) return false;
            if (content === lastSavedHtmlRef.current) return true;

            savingRef.current = true;
            setSaving(true);
            setSaveError(false);
            try {
                const words = countWords(content);
                const estimate = liveWritingCefrEstimate(content, words);
                await adapter.saveText(join.participantId, join.joinToken, currentRound, content, estimate);
                lastSavedHtmlRef.current = content;
                setSavedAt(new Date());
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : '';
                if (!message.includes('round_closed') && !message.includes('already_handed_in')) {
                    setSaveError(true);
                    if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
                    retryTimerRef.current = window.setTimeout(() => setSaveError(false), 5000);
                }
                return false;
            } finally {
                savingRef.current = false;
                setSaving(false);
            }
        },
        [adapter, join, sessionStatus, handedInAt, currentRound]
    );

    // Debounced autosave. `saving` is a dependency so keystrokes typed while a save is in flight
    // are saved immediately afterwards rather than lost.
    useEffect(() => {
        if (!join || sessionStatus !== 'writing' || handedInAt || saving || saveError) return;
        if (!readyRound || html === lastSavedHtmlRef.current) return;
        const timer = window.setTimeout(() => void saveNow(html), 1200);
        return () => window.clearTimeout(timer);
    }, [html, join, sessionStatus, handedInAt, saving, saveError, readyRound, saveNow]);

    // A tab that is hidden or closed gets one last attempt. The server already has the previous
    // autosave, and the student's draft is restored from there on the next visit.
    useEffect(() => {
        if (!join || sessionStatus !== 'writing' || handedInAt) return;
        const saveHidden = () => {
            if (document.visibilityState === 'hidden') void saveNow(htmlRef.current);
        };
        const saveOnPageHide = () => void saveNow(htmlRef.current);
        document.addEventListener('visibilitychange', saveHidden);
        window.addEventListener('pagehide', saveOnPageHide);
        return () => {
            document.removeEventListener('visibilitychange', saveHidden);
            window.removeEventListener('pagehide', saveOnPageHide);
        };
    }, [join, sessionStatus, handedInAt, saveNow]);

    const handInNow = useCallback(async () => {
        if (!adapter || !join || !currentRound || handedInAt || handingInRef.current) return;
        handingInRef.current = true;
        setHandingIn(true);
        setHandInError(false);
        try {
            const finalHtml = htmlRef.current;
            const at = await adapter.handIn(
                join.participantId,
                join.joinToken,
                currentRound,
                finalHtml,
                liveWritingCefrEstimate(finalHtml)
            );
            lastSavedHtmlRef.current = finalHtml;
            setSavedAt(new Date());
            setState((current) =>
                current && current.currentRound === currentRound ? { ...current, handedInAt: at } : current
            );
        } catch {
            setHandInError(true);
        } finally {
            handingInRef.current = false;
            setHandingIn(false);
        }
    }, [adapter, join, currentRound, handedInAt]);

    const deadline = state?.endsAt ? Date.parse(state.endsAt) : Number.NaN;
    const remainingMs = state
        ? timerState === 'running' && Number.isFinite(deadline)
            ? Math.max(0, deadline - (clock + offset))
            : state.remainingMs
        : 0;

    // Auto hand-in at 0:00. The server hand-in is idempotent; a network failure retries every few
    // seconds, while a successful one stops as soon as the state poll reports handedInAt.
    useEffect(() => {
        if (sessionStatus !== 'writing' || handedInAt || timerState !== 'running' || remainingMs > 0) return;
        const now = Date.now();
        if (now - lastAutoAttemptRef.current < 4000) return;
        lastAutoAttemptRef.current = now;
        void handInNow();
    }, [sessionStatus, handedInAt, timerState, remainingMs, handInNow]);

    const timerBucket = useMemo(() => {
        if (remainingMs <= 0) return 'up';
        if (remainingMs <= 30_000) return '30';
        if (remainingMs <= 60_000) return '60';
        if (remainingMs <= 300_000) return '300';
        if (remainingMs <= 600_000) return '600';
        return '';
    }, [remainingMs]);

    useEffect(() => {
        if (sessionStatus !== 'writing' || timerState === 'paused' || !timerBucket) {
            setTimerAnnouncement('');
            return;
        }
        if (timerBucket === 'up') setTimerAnnouncement(t('liveWriting.student_time_up'));
        else if (timerBucket === '30') setTimerAnnouncement(t('liveWriting.student_announce_seconds', { count: 30 }));
        else {
            const minutes = timerBucket === '60' ? 1 : timerBucket === '300' ? 5 : 10;
            setTimerAnnouncement(t('liveWriting.student_announce_minutes', { count: minutes }));
        }
    }, [sessionStatus, timerState, timerBucket, t]);

    const wordCount = useMemo(() => countWords(html), [html]);
    const cefrEstimate = useMemo<CefrLevel | null>(() => liveWritingCefrEstimate(html, wordCount), [html, wordCount]);
    const editorContent = state && readyRound === state.currentRound ? html : (state?.contentHtml ?? '');
    const editable =
        sessionStatus === 'writing' && !handedInAt && readyRound === state?.currentRound && remainingMs > 0;
    const timerText = formatCountdown(remainingMs);
    const imageSrc =
        state?.imageUrl ?? (state?.imagePath && /^https?:\/\//i.test(state.imagePath) ? state.imagePath : undefined);
    const hints = state?.scaffoldPrompts ?? [];
    const visibleHints = hints.slice(0, revealedHints);
    const finished = Boolean(handedInAt) || sessionStatus === 'finals';

    async function pick(studentId: string) {
        if (!adapter) return;
        setBusy(true);
        setError(null);
        try {
            const joined = await adapter.join(normalizeJoinCode(code), studentId);
            const stored = { participantId: joined.participantId, joinToken: joined.joinToken };
            writeStoredJoin(code, stored);
            setJoin(stored);
            setRoster(null);
            if (!routeCode) navigate(`/join/${encodeURIComponent(normalizeJoinCode(code))}`, { replace: true });
        } catch (err) {
            setError(errorKey(err));
        } finally {
            setBusy(false);
        }
    }

    function changeName() {
        clearStoredJoin(code);
        setJoin(null);
        setState(null);
        setReadyRound(null);
        setRoster(null);
        setError(null);
        void lookup(code);
    }

    function submitCode(event: React.FormEvent) {
        event.preventDefault();
        const normalized = normalizeJoinCode(code);
        if (!isCompleteJoinCode(normalized)) {
            setError('liveWriting.invalid_code');
            return;
        }
        navigate(`/join/${encodeURIComponent(normalized)}`);
    }

    if (!adapter) {
        return (
            <PublicShell>
                <h1 style={{ marginTop: 0 }}>{t('liveWriting.join_title')}</h1>
                <p className="text-muted" role="alert">
                    {t('liveWriting.join_unavailable')}
                </p>
            </PublicShell>
        );
    }

    if (!join) {
        return (
            <PublicShell>
                <div className="text-muted text-xs" style={{ letterSpacing: 1, marginBottom: 8 }}>
                    RUBRICMAKER · {t('liveWriting.title').toUpperCase()}
                </div>
                {roster ? (
                    <div>
                        <h1 style={{ marginTop: 0 }}>{t('liveWriting.roster_title')}</h1>
                        <p className="text-muted" style={{ marginBottom: 18 }}>
                            {t('liveWriting.roster_hint')}
                        </p>
                        <div className="live-student-roster">
                            {roster.map((student) => (
                                <button
                                    key={student.studentId}
                                    type="button"
                                    className="btn btn-ghost"
                                    disabled={busy}
                                    onClick={() => void pick(student.studentId)}
                                    style={{ justifyContent: 'flex-start', minHeight: 44 }}
                                >
                                    {student.name}
                                </button>
                            ))}
                        </div>
                        {error && (
                            <p className="text-muted" role="alert" style={{ marginTop: 14 }}>
                                {t(error)}
                            </p>
                        )}
                    </div>
                ) : (
                    <div>
                        <h1 style={{ marginTop: 0 }}>{t('liveWriting.join_title')}</h1>
                        <p className="text-muted" style={{ marginBottom: 20 }}>
                            {t('liveWriting.join_subtitle')}
                        </p>
                        <form onSubmit={submitCode}>
                            <label htmlFor="live-join-code" style={{ display: 'block', marginBottom: 6 }}>
                                {t('liveWriting.code_label')}
                            </label>
                            <input
                                id="live-join-code"
                                className="input"
                                value={code}
                                onChange={(event) => {
                                    setCode(event.target.value);
                                    setError(null);
                                }}
                                placeholder={t('liveWriting.code_placeholder')}
                                autoCapitalize="characters"
                                autoComplete="off"
                                spellCheck={false}
                                disabled={busy}
                                style={{
                                    fontFamily: 'monospace',
                                    fontSize: 20,
                                    letterSpacing: 2,
                                    textTransform: 'uppercase',
                                    marginBottom: 14,
                                }}
                            />
                            <button type="submit" className="btn btn-primary" disabled={busy}>
                                {busy ? t('liveWriting.checking') : t('liveWriting.find_my_name')}
                            </button>
                        </form>
                        {error && (
                            <p className="text-muted" role="alert" style={{ marginTop: 14 }}>
                                {t(error)}
                            </p>
                        )}
                    </div>
                )}
            </PublicShell>
        );
    }

    if (!state) {
        return (
            <PublicShell>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                    <h1 style={{ margin: 0 }}>
                        {reconnecting ? t('liveWriting.student_reconnecting') : t('liveWriting.loading')}
                    </h1>
                </div>
                {error && (
                    <p className="text-muted" role="alert" style={{ marginTop: 14 }}>
                        {t(error)}
                    </p>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={changeName} style={{ marginTop: 14 }}>
                    {t('liveWriting.change_name')}
                </button>
            </PublicShell>
        );
    }

    if (state.status === 'closed') {
        return (
            <PublicShell>
                <h1 style={{ marginTop: 0 }}>{t('liveWriting.student_closed_title')}</h1>
                <p className="text-muted">{t('liveWriting.student_closed_desc')}</p>
                <button type="button" className="btn btn-ghost" onClick={changeName}>
                    {t('liveWriting.change_name')}
                </button>
            </PublicShell>
        );
    }

    if (state.status === 'lobby' || state.status === 'draft') {
        return (
            <PublicShell>
                <h1 style={{ marginTop: 0 }}>{t('liveWriting.waiting_title')}</h1>
                <p style={{ fontSize: 18, marginBottom: 6 }}>{state.sessionTitle}</p>
                <p className="text-muted" style={{ marginBottom: 4 }}>
                    {state.displayName} ·{' '}
                    {t('liveWriting.round_of', { current: state.currentRound, total: state.roundCount })} ·{' '}
                    {t('liveWriting.minutes', { count: state.minutesPerRound })}
                </p>
                <p className="text-muted">{t('liveWriting.waiting_for_teacher')}</p>
                {reconnecting && (
                    <p className="text-muted" role="status">
                        {t('liveWriting.student_reconnecting')}
                    </p>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={changeName}>
                    {t('liveWriting.change_name')}
                </button>
            </PublicShell>
        );
    }

    const timerLabel =
        timerState === 'paused'
            ? t('liveWriting.projector_paused')
            : remainingMs <= 0
              ? t('liveWriting.student_time_up')
              : t('liveWriting.student_time_label', { time: timerText });
    const wordTarget =
        state.minWords > 0 && state.maxWords !== undefined
            ? t('liveWriting.student_word_range', { min: state.minWords, max: state.maxWords })
            : state.minWords > 0
              ? t('liveWriting.student_min_words', { count: state.minWords })
              : state.maxWords !== undefined
                ? t('liveWriting.student_max_words', { count: state.maxWords })
                : '';

    return (
        <main className="live-student-page">
            <style>{`
                .live-student-page { min-height: 100vh; background: var(--bg); color: var(--text); }
                .live-student-header { position: sticky; top: 0; z-index: 20; background: var(--bg); border-bottom: 1px solid var(--border); }
                .live-student-layout { max-width: 1180px; margin: 0 auto; padding: 20px; display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
                .live-student-roster { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
                @media (max-width: 860px) {
                    .live-student-layout { grid-template-columns: minmax(0, 1fr); padding: 14px; }
                    .live-student-sidebar { order: -1; }
                }
            `}</style>
            <header className="live-student-header">
                <div
                    style={{
                        maxWidth: 1180,
                        margin: '0 auto',
                        padding: '14px 20px',
                        display: 'flex',
                        gap: 16,
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ minWidth: 0 }}>
                        <div className="text-muted text-xs" style={{ letterSpacing: 0.8 }}>
                            RUBRICMAKER · {t('liveWriting.title').toUpperCase()}
                        </div>
                        <h1 style={{ margin: '3px 0 0', fontSize: 'clamp(1.15rem, 2vw, 1.55rem)' }}>
                            {state.sessionTitle}
                        </h1>
                        <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                            {state.displayName} ·{' '}
                            {t('liveWriting.round_of', { current: state.currentRound, total: state.roundCount })}
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                        {sessionStatus === 'writing' && (
                            <div
                                role="timer"
                                aria-live="off"
                                aria-label={timerLabel}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    fontVariantNumeric: 'tabular-nums',
                                    fontWeight: 800,
                                    fontSize: '1.15rem',
                                    color: remainingMs <= 60_000 ? 'var(--red-text, #b91c1c)' : 'var(--text)',
                                }}
                            >
                                <Clock size={17} />{' '}
                                {timerState === 'paused' ? t('liveWriting.projector_paused') : timerText}
                            </div>
                        )}
                        <div
                            aria-label={t('liveWriting.student_word_count_label', { count: wordCount })}
                            style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                        >
                            {t('essay.words_count', { count: wordCount })}
                        </div>
                        {cefrEstimate ? (
                            <CefrBadge
                                level={cefrEstimate}
                                size="sm"
                                developing
                                showLabel
                                label={t('liveWriting.student_cefr_estimate')}
                                title={t('liveWriting.student_cefr_title')}
                            />
                        ) : wordCount > 0 && wordCount < LIVE_WRITING_CEFR_MIN_WORDS ? (
                            <span className="text-muted text-xs">{t('liveWriting.student_cefr_hint')}</span>
                        ) : null}
                        {editable && (
                            <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={handingIn}
                                onClick={() => void handInNow()}
                            >
                                {handingIn
                                    ? t('liveWriting.student_handing_in')
                                    : t('liveWriting.student_hand_in_early')}
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {timerAnnouncement}
            </span>

            <div className="live-student-layout">
                <section style={{ minWidth: 0 }}>
                    {reconnecting && (
                        <div className="card" role="status" style={noticeStyle}>
                            {t('liveWriting.student_reconnecting')}
                        </div>
                    )}
                    {saveError && !reconnecting && (
                        <div className="card" role="alert" style={noticeStyle}>
                            {t('liveWriting.student_save_failed')}
                        </div>
                    )}
                    {handInError && (
                        <div className="card" role="alert" style={noticeStyle}>
                            {t('liveWriting.student_hand_in_failed')}
                        </div>
                    )}

                    {finished ? (
                        <div className="card" role="status" style={{ padding: 20 }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                {handedInAt ? <CheckCircle size={20} /> : <Clock size={20} />}
                                <strong>
                                    {handedInAt
                                        ? t('liveWriting.student_handed_in_title')
                                        : t('liveWriting.student_time_up')}
                                </strong>
                            </div>
                            <p className="text-muted" style={{ margin: '8px 0 0' }}>
                                {state.status === 'finals'
                                    ? t('liveWriting.student_finals_waiting')
                                    : t('liveWriting.student_waiting_after_handin')}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 12,
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    marginBottom: 10,
                                    minHeight: 24,
                                }}
                            >
                                <span
                                    className="text-muted text-xs"
                                    aria-live="off"
                                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                                >
                                    {saving && (
                                        <>
                                            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />{' '}
                                            {t('liveWriting.saving')}
                                        </>
                                    )}
                                    {!saving && savedAt && (
                                        <>
                                            <CheckCircle size={13} />{' '}
                                            {t('liveWriting.student_saved_at', {
                                                time: savedAt.toLocaleTimeString([], {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                }),
                                            })}
                                        </>
                                    )}
                                </span>
                                {wordTarget && <span className="text-muted text-xs">{wordTarget}</span>}
                            </div>

                            {state.currentRound > 1 && (
                                <p className="text-muted" style={{ margin: '0 0 10px', fontSize: '0.9rem' }}>
                                    {t('liveWriting.student_next_round', { round: state.currentRound })}
                                </p>
                            )}

                            <span id="live-writing-editor-label" className="sr-only">
                                {t('liveWriting.student_editor_label')}
                            </span>
                            <EssayEditor
                                key={`round-${state.currentRound}`}
                                content={editorContent}
                                onChange={setHtml}
                                editable={editable}
                                placeholder={t('essay.editor_placeholder')}
                                defaultPageMode={false}
                                allowPageMode={false}
                                minHeight={360}
                                ariaLabelledBy="live-writing-editor-label"
                                lang="en"
                            />

                            {editable && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        disabled={handingIn}
                                        onClick={() => void handInNow()}
                                    >
                                        {handingIn
                                            ? t('liveWriting.student_handing_in')
                                            : t('liveWriting.student_hand_in_early')}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </section>

                <aside className="live-student-sidebar" style={{ display: 'grid', gap: 16, minWidth: 0 }}>
                    <section className="card" style={{ padding: 20 }}>
                        <div className="text-muted text-xs" style={{ letterSpacing: 0.6 }}>
                            {t('liveWriting.student_prompt')}
                        </div>
                        <p style={{ margin: '8px 0 0', fontSize: '1.05rem', lineHeight: 1.45 }}>
                            {state.prompt || t('liveWriting.projector_no_prompt')}
                        </p>
                        {imageSrc && (
                            <img
                                src={imageSrc}
                                alt=""
                                style={{
                                    display: 'block',
                                    marginTop: 14,
                                    maxWidth: '100%',
                                    borderRadius: 10,
                                    objectFit: 'contain',
                                }}
                            />
                        )}
                    </section>

                    {state.scaffoldEnabled && hints.length > 0 && (
                        <section className="card" aria-labelledby="live-writing-hints" style={{ padding: 20 }}>
                            <h2
                                id="live-writing-hints"
                                className="item-heading"
                                style={{ margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                <Lightbulb size={16} /> {t('liveWriting.student_hints')}
                            </h2>
                            <div aria-live="polite" style={{ display: 'grid', gap: 10 }}>
                                {visibleHints.map((hint, index) => (
                                    <div
                                        key={`${index}-${hint}`}
                                        style={{
                                            background: 'var(--bg-elevated)',
                                            border: '1px solid var(--border)',
                                            borderRadius: 9,
                                            padding: '10px 12px',
                                        }}
                                    >
                                        <div className="text-muted text-xs">
                                            {t('liveWriting.hint_number', { number: index + 1 })}
                                        </div>
                                        <p style={{ margin: '4px 0 0', fontSize: '0.9rem' }}>{hint}</p>
                                    </div>
                                ))}
                            </div>
                            {revealedHints < hints.length && editable && (
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    style={{ marginTop: 10 }}
                                    onClick={() => setRevealedHints((current) => Math.min(hints.length, current + 1))}
                                >
                                    <Lightbulb size={14} />{' '}
                                    {t('liveWriting.student_reveal_hint', { number: revealedHints + 1 })}
                                </button>
                            )}
                            {revealedHints >= hints.length && (
                                <p className="text-muted text-xs" style={{ margin: '10px 0 0' }}>
                                    {t('liveWriting.student_hints_all')}
                                </p>
                            )}
                        </section>
                    )}
                </aside>
            </div>
        </main>
    );
}

function PublicShell({ children }: { children: React.ReactNode }) {
    return (
        <main
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                background: 'var(--bg)',
                color: 'var(--text)',
            }}
        >
            <div className="card" style={{ width: '100%', maxWidth: 560, padding: 28 }}>
                {children}
            </div>
        </main>
    );
}

const noticeStyle = {
    padding: '10px 14px',
    marginBottom: 12,
    fontSize: '0.9rem',
} as const;
