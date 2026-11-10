import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LiveWritingAdapter } from '../services/database/LiveWritingAdapter';
import type { LiveWritingJoin, LiveWritingRosterEntry } from '../types';
import { isCompleteJoinCode, normalizeJoinCode } from '../utils/liveWriting';

function errorKey(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('too_many_attempts')) return 'liveWriting.too_many_attempts';
    if (message.includes('student_not_in_class')) return 'liveWriting.student_not_in_class';
    if (message.includes('invalid_code')) return 'liveWriting.invalid_code';
    return 'liveWriting.join_failed';
}

export default function StudentLiveWritePage() {
    const { t } = useTranslation();
    const { code: routeCode } = useParams<{ code: string }>();
    const adapter = useMemo(() => LiveWritingAdapter.forStudent(), []);

    const [code, setCode] = useState(routeCode ?? '');
    const [roster, setRoster] = useState<LiveWritingRosterEntry[] | null>(null);
    const [joined, setJoined] = useState<LiveWritingJoin | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(adapter ? null : 'liveWriting.join_unavailable');

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
            setJoined(null);
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

    useEffect(() => {
        if (routeCode) void lookup(routeCode);
    }, [routeCode, lookup]);

    async function pick(studentId: string) {
        if (!adapter) return;
        setBusy(true);
        setError(null);
        try {
            setJoined(await adapter.join(normalizeJoinCode(code), studentId));
        } catch (err) {
            setError(errorKey(err));
        } finally {
            setBusy(false);
        }
    }

    function changeName() {
        setJoined(null);
        setError(null);
    }

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
            }}
        >
            <div className="card" style={{ width: '100%', maxWidth: 560, padding: 28 }}>
                <div className="text-muted text-xs" style={{ letterSpacing: 1, marginBottom: 8 }}>
                    RUBRICMAKER · {t('liveWriting.title').toUpperCase()}
                </div>

                {joined ? (
                    <div>
                        <h1 style={{ marginTop: 0 }}>{t('liveWriting.waiting_title')}</h1>
                        <p style={{ fontSize: 18, marginBottom: 6 }}>{joined.title}</p>
                        <p className="text-muted" style={{ marginBottom: 4 }}>
                            {t('liveWriting.round_of', {
                                current: joined.currentRound,
                                total: joined.roundCount,
                            })}{' '}
                            · {t('liveWriting.minutes', { count: joined.minutesPerRound })}
                        </p>
                        <p className="text-muted">
                            {joined.status === 'writing'
                                ? t('liveWriting.session_in_progress')
                                : t('liveWriting.waiting_for_teacher')}
                        </p>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={changeName}>
                            {t('liveWriting.change_name')}
                        </button>
                    </div>
                ) : roster ? (
                    <div>
                        <h1 style={{ marginTop: 0 }}>{t('liveWriting.roster_title')}</h1>
                        <p className="text-muted" style={{ marginBottom: 18 }}>
                            {t('liveWriting.roster_hint')}
                        </p>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                                gap: 8,
                            }}
                        >
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
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                void lookup(code);
                            }}
                        >
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
            </div>
        </div>
    );
}
