import React from 'react';

/** Card surface for the public share-link pages (/feedback, /preview); follows the app theme. */
export const sharedCardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    border: '1px solid var(--border)',
    boxShadow: '0 1px 3px rgba(0,0,0,.06)',
};

interface ShellProps {
    children: React.ReactNode;
    footer: string;
    fontFamily?: string;
    maxWidth: number;
}

export function SharedPageShell({ children, footer, fontFamily, maxWidth }: ShellProps) {
    return (
        <div
            style={{
                minHeight: '100vh',
                background: 'var(--bg)',
                color: 'var(--text)',
                padding: '24px 16px',
                fontFamily: fontFamily ?? 'Inter, system-ui, sans-serif',
            }}
        >
            <main style={{ maxWidth, margin: '0 auto' }}>{children}</main>
            <footer
                style={{
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '0.8rem',
                    marginTop: 24,
                    paddingBottom: 24,
                }}
            >
                {footer}
            </footer>
        </div>
    );
}

export function SharedPageInvalid({ title, body }: { title: string; body: string }) {
    return (
        <main
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg)',
                color: 'var(--text)',
                padding: 24,
            }}
        >
            <div style={{ maxWidth: 480, textAlign: 'center' }}>
                <div aria-hidden="true" style={{ fontSize: 48, marginBottom: 16 }}>
                    ⚠️
                </div>
                <h1 style={{ marginBottom: 8, fontSize: '1.4rem' }}>{title}</h1>
                <p style={{ color: 'var(--text-muted)' }}>{body}</p>
            </div>
        </main>
    );
}
