import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, ExternalLink, ShieldAlert } from 'lucide-react';
import { downloadSebConfigForAssignment, type SebConfigEndpoint } from '../../utils/sebConfig';

const SEB_DOWNLOAD_URL = 'https://safeexambrowser.org/download_en.html';

export interface SebGateProps {
    requireSEB: boolean;
    /** The URL this config must start in. Without it the gate can only explain, not launch. */
    startUrl?: string;
    /** Base name for the downloaded .seb file. */
    fileName?: string;
    /** Server endpoint that builds the per-assignment config; omitted offline. */
    configEndpoint?: SebConfigEndpoint;
    children: React.ReactNode;
}

/**
 * Blocks access to the wrapped content unless the page is running inside
 * Safe Exam Browser. Detection is user-agent sniffing only — a deterrent,
 * not a hard enforcement mechanism (matches StudentEssayPage's isInSEB check).
 */
export default function SebGate({ requireSEB, startUrl, fileName, configEndpoint, children }: SebGateProps) {
    const { t } = useTranslation();
    const [preparing, setPreparing] = useState(false);
    const isInSEB = /SEB/i.test(navigator.userAgent);

    async function handleDownload() {
        if (!startUrl) return;
        setPreparing(true);
        try {
            await downloadSebConfigForAssignment({
                endpoint: configEndpoint,
                startUrl,
                fileName: fileName || 'test',
            });
        } finally {
            setPreparing(false);
        }
    }

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
            <div style={{ maxWidth: 520 }}>
                <div style={{ textAlign: 'center' }}>
                    <ShieldAlert size={48} style={{ color: 'var(--red-text)', marginBottom: 16 }} />
                    <h2 style={{ marginBottom: 8, color: 'var(--text)' }}>{t('tests.taking.seb_blocked_title')}</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>{t('tests.taking.seb_blocked_desc')}</p>
                </div>
                <ol
                    style={{
                        margin: '0 0 20px',
                        paddingLeft: 22,
                        color: 'var(--text)',
                        fontSize: '0.9rem',
                        lineHeight: 1.7,
                    }}
                >
                    <li>{t('tests.taking.seb_step_install')}</li>
                    <li>{t('tests.taking.seb_step_download')}</li>
                    <li>{t('tests.taking.seb_step_open')}</li>
                </ol>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                    <a
                        className="btn btn-secondary btn-sm"
                        href={SEB_DOWNLOAD_URL}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                        <ExternalLink size={14} /> {t('tests.taking.seb_get_app')}
                    </a>
                    {startUrl && (
                        <button
                            className="btn btn-primary btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            aria-busy={preparing}
                            disabled={preparing}
                            onClick={() => void handleDownload()}
                        >
                            <Download size={14} /> {t('tests.taking.seb_download_config')}
                        </button>
                    )}
                </div>
                <p
                    style={{
                        color: 'var(--text-muted)',
                        fontSize: '0.8rem',
                        textAlign: 'center',
                        marginTop: 16,
                        marginBottom: 0,
                    }}
                >
                    {t('tests.taking.seb_blocked_no_bypass')}
                </p>
            </div>
        </div>
    );
}
