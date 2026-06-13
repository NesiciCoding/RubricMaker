import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';

export interface SebGateProps {
    requireSEB: boolean;
    children: React.ReactNode;
}

/**
 * Blocks access to the wrapped content unless the page is running inside
 * Safe Exam Browser. Detection is user-agent sniffing only — a deterrent,
 * not a hard enforcement mechanism (matches StudentEssayPage's isInSEB check).
 */
export default function SebGate({ requireSEB, children }: SebGateProps) {
    const { t } = useTranslation();
    const isInSEB = /SEB/i.test(navigator.userAgent);

    if (!requireSEB || isInSEB) return <>{children}</>;

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg)',
                padding: 24,
            }}
        >
            <div style={{ maxWidth: 480, textAlign: 'center' }}>
                <ShieldAlert size={48} style={{ color: 'var(--red)', marginBottom: 16 }} />
                <h2 style={{ marginBottom: 8, color: 'var(--text)' }}>{t('tests.taking.seb_blocked_title')}</h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: 8 }}>{t('tests.taking.seb_blocked_desc')}</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {t('tests.taking.seb_blocked_no_bypass')}
                </p>
            </div>
        </div>
    );
}
