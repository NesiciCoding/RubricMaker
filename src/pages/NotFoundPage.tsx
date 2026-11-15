import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';

export default function NotFoundPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();

    // A share link into a stale hash route has no in-app history to return to, and navigate(-1)
    // then either does nothing or leaves the app entirely. Send that case home instead.
    function goBack() {
        if (location.key === 'default') navigate('/', { replace: true });
        else navigate(-1);
    }

    const destinations = [
        { to: '/rubrics', label: t('navigation.rubrics') },
        { to: '/students', label: t('navigation.students') },
        { to: '/docs', label: t('navigation.docs') },
    ];

    return (
        <>
            <Topbar title={t('tooltips.page_not_found')} />
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '60vh',
                    gap: '1rem',
                    padding: '2rem',
                    textAlign: 'center',
                }}
            >
                <FileQuestion size={48} style={{ color: 'var(--text-dim)' }} aria-hidden="true" />
                {/* The Topbar owns the page's <h1>; the 404 message is its content heading. */}
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)' }}>{t('notFound.heading')}</h2>
                <p style={{ color: 'var(--text-muted)', maxWidth: '360px', fontSize: '0.9rem' }}>
                    {t('notFound.body')}
                </p>
                <p style={{ color: 'var(--text-dim)', maxWidth: '360px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                    {location.pathname}
                </p>
                <div
                    style={{ display: 'flex', gap: 8, marginTop: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}
                >
                    <button className="btn btn-secondary" onClick={goBack}>
                        {t('notFound.go_back', { defaultValue: 'Go back' })}
                    </button>
                    <Link to="/" className="btn btn-primary">
                        {t('notFound.go_dashboard')}
                    </Link>
                </div>
                <div style={{ marginTop: '1rem' }}>
                    <div className="text-muted text-xs" style={{ marginBottom: 6 }}>
                        {t('notFound.quick_links')}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {destinations.map((destination) => (
                            <Link key={destination.to} to={destination.to} className="btn btn-ghost btn-sm">
                                {destination.label}
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
