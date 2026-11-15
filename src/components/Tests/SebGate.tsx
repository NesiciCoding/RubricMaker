import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, ExternalLink, ShieldAlert } from 'lucide-react';
import {
    downloadSebConfigForAssignment,
    isRunningInSEB,
    prepareSebConfigBlob,
    saveSebConfigBlob,
    type SebConfigEndpoint,
} from '../../utils/sebConfig';

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
    const isInSEB = isRunningInSEB();

    // Prefetched ahead of the click so the download can save synchronously from inside the click
    // handler: Safari only treats `saveAs`'s anchor click as a trusted download request within
    // the synchronous extent of a user gesture, and the server-config fetch is async.
    const preparedBlobRef = useRef<Blob | null>(null);
    useEffect(() => {
        preparedBlobRef.current = null;
        if (!startUrl) return;
        let cancelled = false;
        void prepareSebConfigBlob({ endpoint: configEndpoint, startUrl }).then((blob) => {
            if (!cancelled) preparedBlobRef.current = blob;
        });
        return () => {
            cancelled = true;
        };
    }, [configEndpoint, startUrl]);

    function handleDownload() {
        if (!startUrl) return;
        if (preparedBlobRef.current) {
            saveSebConfigBlob(preparedBlobRef.current, fileName || 'test');
            return;
        }
        // Prefetch hasn't landed yet (slow connection, or the click came right after mount) —
        // fall back to the original fetch-then-save path.
        setPreparing(true);
        void downloadSebConfigForAssignment({
            endpoint: configEndpoint,
            startUrl,
            fileName: fileName || 'test',
        }).finally(() => setPreparing(false));
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
                            onClick={handleDownload}
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
