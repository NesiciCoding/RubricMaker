import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { EmptyState } from '../components/ui/EmptyState';
import { LiveWritingAdapter } from '../services/database/LiveWritingAdapter';
import type { LiveWritingSession } from '../types';
import { liveWritingStatusKey } from '../utils/liveWriting';

export default function LiveWritingListPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const adapter = useMemo(() => LiveWritingAdapter.forTeacher(), []);
    const [sessions, setSessions] = useState<LiveWritingSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!adapter) {
            setLoading(false);
            return;
        }
        let alive = true;
        adapter
            .listSessions()
            .then((list) => {
                if (alive) setSessions(list);
            })
            .catch(() => {
                if (alive) setFailed(true);
            })
            .finally(() => {
                if (alive) setLoading(false);
            });
        return () => {
            alive = false;
        };
    }, [adapter]);

    return (
        <>
            <Topbar
                title={t('liveWriting.title')}
                actions={
                    <button className="btn btn-primary btn-sm" onClick={() => navigate('/live/new')}>
                        <Plus size={15} /> {t('liveWriting.new_session')}
                    </button>
                }
            />
            <div className="page-content fade-in">
                <p className="text-muted" style={{ marginTop: -8, marginBottom: 20, maxWidth: 640 }}>
                    {t('liveWriting.subtitle')}
                </p>

                {!adapter ? (
                    <EmptyState icon={Radio} title={t('liveWriting.db_required')} titleLevel={2} />
                ) : loading ? (
                    <p className="text-muted">{t('liveWriting.loading')}</p>
                ) : failed ? (
                    <p className="text-muted" role="alert">
                        {t('liveWriting.load_failed')}
                    </p>
                ) : sessions.length === 0 ? (
                    <EmptyState
                        icon={Radio}
                        title={t('liveWriting.no_sessions')}
                        titleLevel={2}
                        description={t('liveWriting.no_sessions_hint')}
                        action={{
                            label: t('liveWriting.new_session'),
                            icon: Plus,
                            onClick: () => navigate('/live/new'),
                        }}
                    />
                ) : (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                            gap: 16,
                        }}
                    >
                        {sessions.map((session) => (
                            <Link
                                key={session.id}
                                to={`/live/${session.id}`}
                                className="card"
                                style={{ padding: 20, color: 'inherit', textDecoration: 'none' }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'flex-start',
                                        gap: 12,
                                    }}
                                >
                                    <h2 className="item-heading" style={{ margin: 0 }}>
                                        {session.title}
                                    </h2>
                                    <span className="text-muted text-xs" style={{ whiteSpace: 'nowrap' }}>
                                        {t(liveWritingStatusKey(session.status))}
                                    </span>
                                </div>
                                <div className="text-muted text-xs" style={{ marginTop: 10 }}>
                                    {t('liveWriting.rounds_short', { count: session.roundCount })} ·{' '}
                                    {t('liveWriting.minutes_short', { count: session.minutesPerRound })}
                                </div>
                                <div
                                    className="text-muted text-xs"
                                    style={{ marginTop: 6, fontFamily: 'monospace', letterSpacing: 1 }}
                                >
                                    {session.joinCode}
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
