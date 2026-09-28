import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { subscribe, getUpdateSW, getUpdateVersion } from '../../pwaUpdateStore';
import { PWA_UPDATE_NOTES } from '../../pwaChangelog';

const ISSUES_URL = 'https://github.com/NesiciCoding/RubricMaker/issues';

export function UpdateAvailableToast() {
    const { t } = useTranslation();
    const updateSW = useSyncExternalStore(subscribe, getUpdateSW);
    const version = useSyncExternalStore(subscribe, getUpdateVersion);
    const [dismissedVersion, setDismissedVersion] = useState(0);

    if (!updateSW || version === dismissedVersion) return null;

    return (
        <div
            role="status"
            style={{
                position: 'fixed',
                bottom: '1.5rem',
                left: '1.5rem',
                zIndex: 9999,
                maxWidth: '22rem',
                padding: '1rem',
                borderRadius: '0.5rem',
                background: 'color-mix(in srgb, var(--accent) 18%, var(--bg-elevated))',
                border: '1px solid var(--accent)',
                color: 'var(--text)',
                fontSize: '0.875rem',
                lineHeight: '1.4',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <strong>{t('pwa.update_available_title')}</strong>
                <button
                    onClick={() => setDismissedVersion(version)}
                    aria-label={t('pwa.update_available_dismiss')}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        lineHeight: 1,
                        padding: 0,
                    }}
                >
                    ✕
                </button>
            </div>
            {PWA_UPDATE_NOTES.length > 0 && (
                <ul style={{ margin: '0.5rem 0', paddingLeft: '1.1rem' }}>
                    {PWA_UPDATE_NOTES.map((note) => (
                        <li key={note}>{note}</li>
                    ))}
                </ul>
            )}
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.75rem' }}>
                <button
                    onClick={() => updateSW()}
                    style={{
                        padding: '0.4rem 0.9rem',
                        borderRadius: '0.375rem',
                        border: 'none',
                        background: 'var(--accent)',
                        color: 'var(--bg-elevated)',
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    {t('pwa.update_available_refresh')}
                </button>
                <a href={ISSUES_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--text)' }}>
                    {t('pwa.update_available_report_issue')}
                </a>
            </div>
        </div>
    );
}
