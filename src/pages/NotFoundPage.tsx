import React from 'react';
import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';

export default function NotFoundPage() {
    return (
        <>
            <Topbar title="Page not found" />
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
                <h1 style={{ fontSize: '1.4rem', color: 'var(--text)' }}>404 — Page not found</h1>
                <p style={{ color: 'var(--text-muted)', maxWidth: '360px', fontSize: '0.9rem' }}>
                    The page you're looking for doesn't exist or has been moved.
                </p>
                <Link to="/" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
                    Go to Dashboard
                </Link>
            </div>
        </>
    );
}
