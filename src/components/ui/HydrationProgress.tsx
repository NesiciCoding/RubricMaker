import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader } from 'lucide-react';
import { loadDb } from '../../services/database/lazyDb';
import { loadSupabaseConfig } from '../../services/database/supabaseConfig';

type Progress = { done: number; total: number };

// Shown while a full cloud pull is in flight, so a slow first load (fresh browser, large
// account) reads as "loading" rather than "my data is gone".
export function HydrationProgress() {
    const { t } = useTranslation();
    const [progress, setProgress] = useState<Progress | null>(null);

    useEffect(() => {
        if (!loadSupabaseConfig()) return;
        let unsub: (() => void) | undefined;
        let cancelled = false;
        void loadDb().then(({ storageSync }) => {
            if (cancelled) return;
            const read = () =>
                setProgress(storageSync.getStatus() === 'syncing' ? storageSync.getHydrateProgress() : null);
            read();
            unsub = storageSync.subscribe(read);
        });
        return () => {
            cancelled = true;
            unsub?.();
        };
    }, []);

    if (!progress) return null;
    const pct = Math.min(100, Math.round((progress.done / progress.total) * 100));

    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                position: 'fixed',
                top: '1rem',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 9999,
                width: 'min(22rem, calc(100vw - 2rem))',
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: '0.875rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Loader className="spin" size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{t('toast.sync_hydrating')}</span>
                <span style={{ color: 'var(--text-muted)' }}>{pct}%</span>
            </div>
            <div
                role="progressbar"
                aria-label={t('toast.sync_hydrating')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                style={{ marginTop: '0.5rem', height: 4, borderRadius: 2, background: 'var(--bg-panel)' }}
            >
                <div
                    style={{
                        width: `${pct}%`,
                        height: '100%',
                        borderRadius: 2,
                        background: 'var(--accent)',
                        transition: 'width 0.2s ease',
                    }}
                />
            </div>
            <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {t('toast.sync_hydrating_hint')}
            </div>
        </div>
    );
}
