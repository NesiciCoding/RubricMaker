import React from 'react';
import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';

export default function NotFoundPage() {
    const { t } = useTranslation();
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
                <Link to="/" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
                    {t('notFound.go_dashboard')}
                </Link>
            </div>
        </>
    );
}
