import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, MonitorPlay, RefreshCw, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useClasses } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import { LiveWritingAdapter, type LiveWritingSessionInput } from '../services/database/LiveWritingAdapter';
import type { LiveWritingParticipant, LiveWritingSession, LiveWritingSessionStatus } from '../types';
import { liveWritingJoinLink, liveWritingStatusKey } from '../utils/liveWriting';

interface DraftState {
    title: string;
    prompt: string;
    classId: string;
    minutesPerRound: number;
    roundCount: number;
    minWords: number;
    maxWords: string;
    scaffoldEnabled: boolean;
    liveLeaderboard: boolean;
    lockAfterStart: boolean;
}

function emptyDraft(): DraftState {
    return {
        title: '',
        prompt: '',
        classId: '',
        minutesPerRound: 10,
        roundCount: 1,
        minWords: 0,
        maxWords: '',
        scaffoldEnabled: true,
        liveLeaderboard: true,
        lockAfterStart: false,
    };
}

function draftFromSession(session: LiveWritingSession): DraftState {
    return {
        title: session.title,
        prompt: session.prompt,
        classId: session.classId,
        minutesPerRound: session.minutesPerRound,
        roundCount: session.roundCount,
        minWords: session.minWords,
        maxWords: session.maxWords === undefined ? '' : String(session.maxWords),
        scaffoldEnabled: session.scaffoldEnabled,
        liveLeaderboard: session.liveLeaderboard,
        lockAfterStart: session.lockAfterStart,
    };
}

function toInput(draft: DraftState): LiveWritingSessionInput {
    const maxWords = draft.maxWords.trim() === '' ? null : Math.max(0, Math.floor(Number(draft.maxWords)));
    return {
        title: draft.title.trim(),
        prompt: draft.prompt.trim(),
        classId: draft.classId,
        minutesPerRound: Math.min(120, Math.max(1, Math.floor(draft.minutesPerRound) || 10)),
        roundCount: Math.min(3, Math.max(1, Math.floor(draft.roundCount) || 1)),
        minWords: Math.max(0, Math.floor(draft.minWords) || 0),
        maxWords: maxWords === null ? null : Math.max(0, maxWords),
        scaffoldEnabled: draft.scaffoldEnabled,
        liveLeaderboard: draft.liveLeaderboard,
        lockAfterStart: draft.lockAfterStart,
    };
}

export default function LiveWritingSessionPage() {
    const { t } = useTranslation();
    const { sessionId } = useParams<{ sessionId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { classes } = useClasses();
    const adapter = useMemo(() => LiveWritingAdapter.forTeacher(), []);
    const isNew = !sessionId || sessionId === 'new';

    const [session, setSession] = useState<LiveWritingSession | null>(null);
    const [draft, setDraft] = useState<DraftState>(emptyDraft);
    const [participants, setParticipants] = useState<LiveWritingParticipant[]>([]);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);

    useEffect(() => {
        if (!isNew) return;
        setSession(null);
        setDraft(emptyDraft());
        setParticipants([]);
        setLoading(false);
    }, [isNew]);

    useEffect(() => {
        if (!adapter || isNew || !sessionId) return;
        let alive = true;
        setLoading(true);
        adapter
            .getSession(sessionId)
            .then((loaded) => {
                if (!alive) return;
                setSession(loaded);
                setDraft(draftFromSession(loaded));
                setLoadFailed(false);
            })
            .catch(() => {
                if (alive) setLoadFailed(true);
            })
            .finally(() => {
                if (alive) setLoading(false);
            });
        return () => {
            alive = false;
        };
    }, [adapter, isNew, sessionId]);

    const refreshParticipants = useCallback(async () => {
        if (!adapter || !session) return;
        try {
            setParticipants(await adapter.listParticipants(session.id));
        } catch {
            // The roster is supplementary while drafting; a failed poll should not interrupt the form.
        }
    }, [adapter, session]);

    useEffect(() => {
        if (!session || (session.status !== 'lobby' && session.status !== 'writing')) return;
        void refreshParticipants();
        const timer = setInterval(() => void refreshParticipants(), 6000);
        return () => clearInterval(timer);
    }, [session, refreshParticipants]);

    const editable = !session || session.status === 'draft';

    function patchDraft(patch: Partial<DraftState>) {
        setDraft((current) => ({ ...current, ...patch }));
    }

    async function persist(status?: LiveWritingSessionStatus) {
        if (!adapter) return;
        const input = toInput(draft);
        if (!input.title || !input.classId) {
            showToast(t('liveWriting.save_failed'), 'error');
            return;
        }
        setSaving(true);
        try {
            if (isNew) {
                let created = await adapter.createSession(input);
                if (status) created = await adapter.updateSession(created.id, { status });
                showToast(t('liveWriting.saved'), 'success');
                navigate(`/live/${created.id}`, { replace: true });
            } else if (session) {
                const updated = await adapter.updateSession(session.id, {
                    ...input,
                    ...(status ? { status } : {}),
                });
                setSession(updated);
                setDraft(draftFromSession(updated));
                showToast(t('liveWriting.saved'), 'success');
            }
        } catch {
            showToast(t('liveWriting.save_failed'), 'error');
        } finally {
            setSaving(false);
        }
    }

    async function copyJoinLink() {
        if (!session) return;
        try {
            await navigator.clipboard.writeText(liveWritingJoinLink(session.joinCode));
            showToast(t('liveWriting.link_copied'), 'success');
        } catch {
            showToast(t('liveWriting.join_code'), 'info');
        }
    }

    if (!adapter) {
        return (
            <>
                <Topbar title={t('liveWriting.title')} />
                <div className="page-content fade-in">
                    <p className="text-muted">{t('liveWriting.db_required')}</p>
                </div>
            </>
        );
    }

    return (
        <>
            <Topbar
                title={session ? session.title : t('liveWriting.new_session')}
                actions={
                    session ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <Link
                                to={`/live/${session.id}/project`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-ghost btn-sm"
                            >
                                <MonitorPlay size={15} /> {t('liveWriting.open_projector')}
                            </Link>
                            <Link to="/live" className="btn btn-ghost btn-sm">
                                <ArrowLeft size={15} /> {t('liveWriting.back_to_list')}
                            </Link>
                        </div>
                    ) : (
                        <Link to="/live" className="btn btn-ghost btn-sm">
                            <ArrowLeft size={15} /> {t('liveWriting.back_to_list')}
                        </Link>
                    )
                }
            />
            <div className="page-content fade-in" style={{ maxWidth: 1100 }}>
                {loading ? (
                    <p className="text-muted">{t('liveWriting.loading')}</p>
                ) : loadFailed ? (
                    <p className="text-muted" role="alert">
                        {t('liveWriting.load_failed')}
                    </p>
                ) : (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 340px)',
                            gap: 20,
                            alignItems: 'start',
                        }}
                    >
                        <div className="card" style={{ padding: 24 }}>
                            {session && (
                                <div className="text-muted text-xs" style={{ marginBottom: 16, letterSpacing: 0.4 }}>
                                    {t(liveWritingStatusKey(session.status))}
                                </div>
                            )}

                            <label htmlFor="live-title" style={{ display: 'block', marginBottom: 6 }}>
                                {t('liveWriting.session_title')}
                            </label>
                            <input
                                id="live-title"
                                className="input"
                                value={draft.title}
                                maxLength={200}
                                disabled={!editable}
                                placeholder={t('liveWriting.session_title_placeholder')}
                                onChange={(e) => patchDraft({ title: e.target.value })}
                                style={{ marginBottom: 16 }}
                            />

                            <label htmlFor="live-prompt" style={{ display: 'block', marginBottom: 6 }}>
                                {t('liveWriting.prompt')}
                            </label>
                            <textarea
                                id="live-prompt"
                                className="input"
                                value={draft.prompt}
                                maxLength={5000}
                                rows={4}
                                disabled={!editable}
                                placeholder={t('liveWriting.prompt_placeholder')}
                                onChange={(e) => patchDraft({ prompt: e.target.value })}
                                style={{ marginBottom: 16, resize: 'vertical' }}
                            />

                            <label htmlFor="live-class" style={{ display: 'block', marginBottom: 6 }}>
                                {t('liveWriting.class')}
                            </label>
                            <select
                                id="live-class"
                                className="input"
                                value={draft.classId}
                                disabled={!editable}
                                onChange={(e) => patchDraft({ classId: e.target.value })}
                                style={{ marginBottom: 24 }}
                            >
                                <option value="">{t('liveWriting.select_class')}</option>
                                {classes.map((cls) => (
                                    <option key={cls.id} value={cls.id}>
                                        {cls.name}
                                    </option>
                                ))}
                            </select>

                            <h2 className="item-heading" style={{ marginBottom: 12 }}>
                                {t('liveWriting.timing')}
                            </h2>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                                    gap: 12,
                                    marginBottom: 16,
                                }}
                            >
                                <div>
                                    <label htmlFor="live-minutes" style={{ display: 'block', marginBottom: 6 }}>
                                        {t('liveWriting.minutes_per_round')}
                                    </label>
                                    <input
                                        id="live-minutes"
                                        className="input"
                                        type="number"
                                        min={1}
                                        max={120}
                                        value={draft.minutesPerRound}
                                        disabled={!editable}
                                        onChange={(e) => patchDraft({ minutesPerRound: Number(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="live-rounds" style={{ display: 'block', marginBottom: 6 }}>
                                        {t('liveWriting.rounds')}
                                    </label>
                                    <select
                                        id="live-rounds"
                                        className="input"
                                        value={draft.roundCount}
                                        disabled={!editable}
                                        onChange={(e) => patchDraft({ roundCount: Number(e.target.value) })}
                                    >
                                        <option value={1}>1</option>
                                        <option value={2}>2</option>
                                        <option value={3}>3</option>
                                    </select>
                                </div>
                            </div>
                            <p className="text-muted text-xs" style={{ marginTop: -8, marginBottom: 20 }}>
                                {t('liveWriting.rounds_hint')}
                            </p>

                            <h2 className="item-heading" style={{ marginBottom: 12 }}>
                                {t('liveWriting.words')}
                            </h2>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                                    gap: 12,
                                    marginBottom: 24,
                                }}
                            >
                                <div>
                                    <label htmlFor="live-min-words" style={{ display: 'block', marginBottom: 6 }}>
                                        {t('liveWriting.min_words')}
                                    </label>
                                    <input
                                        id="live-min-words"
                                        className="input"
                                        type="number"
                                        min={0}
                                        value={draft.minWords}
                                        disabled={!editable}
                                        onChange={(e) => patchDraft({ minWords: Number(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="live-max-words" style={{ display: 'block', marginBottom: 6 }}>
                                        {t('liveWriting.max_words')}
                                    </label>
                                    <input
                                        id="live-max-words"
                                        className="input"
                                        type="number"
                                        min={0}
                                        value={draft.maxWords}
                                        disabled={!editable}
                                        onChange={(e) => patchDraft({ maxWords: e.target.value })}
                                    />
                                </div>
                            </div>

                            <h2 className="item-heading" style={{ marginBottom: 12 }}>
                                {t('liveWriting.options')}
                            </h2>
                            <div style={{ display: 'grid', gap: 14, marginBottom: 24 }}>
                                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                    <input
                                        type="checkbox"
                                        checked={draft.scaffoldEnabled}
                                        disabled={!editable}
                                        onChange={(e) => patchDraft({ scaffoldEnabled: e.target.checked })}
                                        style={{ marginTop: 3 }}
                                    />
                                    <span>
                                        {t('liveWriting.scaffold_toggle')}
                                        <span className="text-muted text-xs" style={{ display: 'block' }}>
                                            {t('liveWriting.scaffold_hint')}
                                        </span>
                                    </span>
                                </label>
                                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                    <input
                                        type="checkbox"
                                        checked={draft.liveLeaderboard}
                                        disabled={!editable}
                                        onChange={(e) => patchDraft({ liveLeaderboard: e.target.checked })}
                                        style={{ marginTop: 3 }}
                                    />
                                    <span>
                                        {t('liveWriting.leaderboard_toggle')}
                                        <span className="text-muted text-xs" style={{ display: 'block' }}>
                                            {t('liveWriting.leaderboard_hint')}
                                        </span>
                                    </span>
                                </label>
                                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                    <input
                                        type="checkbox"
                                        checked={draft.lockAfterStart}
                                        disabled={!editable}
                                        onChange={(e) => patchDraft({ lockAfterStart: e.target.checked })}
                                        style={{ marginTop: 3 }}
                                    />
                                    <span>{t('liveWriting.lock_after_start')}</span>
                                </label>
                            </div>

                            {(!session || session.status === 'draft') && (
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        disabled={saving}
                                        onClick={() => void persist()}
                                    >
                                        {saving ? t('liveWriting.saving') : t('liveWriting.save_draft')}
                                    </button>
                                    {session && (
                                        <button
                                            type="button"
                                            className="btn btn-ghost"
                                            disabled={saving}
                                            onClick={() => void persist('lobby')}
                                        >
                                            {t('liveWriting.open_lobby')}
                                        </button>
                                    )}
                                </div>
                            )}
                            {session?.status === 'lobby' && (
                                <p className="text-muted" style={{ marginTop: 12 }}>
                                    {t('liveWriting.lobby_open')}
                                </p>
                            )}
                        </div>

                        {session && (
                            <aside className="card" style={{ padding: 20 }}>
                                <div className="text-muted text-xs">{t('liveWriting.join_code')}</div>
                                <div
                                    style={{
                                        fontFamily: 'monospace',
                                        fontSize: 26,
                                        letterSpacing: 2,
                                        margin: '6px 0 12px',
                                    }}
                                >
                                    {session.joinCode}
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => void copyJoinLink()}
                                    style={{ marginBottom: 20 }}
                                >
                                    <Copy size={14} /> {t('liveWriting.copy_link')}
                                </button>

                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: 8,
                                    }}
                                >
                                    <h2 className="item-heading" style={{ margin: 0 }}>
                                        <Users size={15} /> {t('liveWriting.joined_students')}
                                    </h2>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-icon btn-sm"
                                        aria-label={t('liveWriting.refresh')}
                                        onClick={() => void refreshParticipants()}
                                    >
                                        <RefreshCw size={14} />
                                    </button>
                                </div>
                                <div className="text-muted text-xs" style={{ marginBottom: 10 }}>
                                    {t('liveWriting.participants_count', { count: participants.length })}
                                </div>
                                {participants.length === 0 ? (
                                    <p className="text-muted text-xs">{t('liveWriting.no_participants')}</p>
                                ) : (
                                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                        {participants.map((participant) => (
                                            <li
                                                key={participant.id}
                                                style={{
                                                    padding: '6px 0',
                                                    borderBottom: '1px solid var(--border)',
                                                }}
                                            >
                                                {participant.displayName}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </aside>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
