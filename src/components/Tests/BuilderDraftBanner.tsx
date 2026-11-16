import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';

interface Props {
    savedAt: string;
    onRestore: () => void;
    onDiscard: () => void;
}

/** Offered when this device holds a newer draft of the test than the saved one. */
export default function BuilderDraftBanner({ savedAt, onRestore, onDiscard }: Props) {
    const { t } = useTranslation();
    const date = new Date(savedAt);
    const time = Number.isNaN(date.getTime()) ? savedAt : date.toLocaleString();
    return (
        <div
            role="status"
            data-testid="draft-banner"
            className="card"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 20,
                padding: '12px 16px',
                borderColor: 'var(--accent)',
                background: 'var(--accent-soft)',
            }}
        >
            <History size={16} style={{ color: 'var(--accent-text)', flexShrink: 0 }} aria-hidden="true" />
            <div style={{ flex: 1, minWidth: 200, fontSize: '0.85rem' }}>
                <strong>{t('tests.draft_found_title')}</strong> {t('tests.draft_found_body', { time })}
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={onRestore}>
                {t('tests.draft_restore')}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onDiscard}>
                {t('tests.draft_discard')}
            </button>
        </div>
    );
}
