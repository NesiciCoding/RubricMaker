import { useTranslation } from 'react-i18next';
import { Copy, Eye, Pencil } from 'lucide-react';
import type { MaterialAccess } from '../../types';

interface Props {
    ownerName: string;
    access: MaterialAccess;
    onDuplicate: () => void;
}

/** Shown above a colleague's rubric or test: whose it is, and whether saving changes their original. */
export default function SharedMaterialBanner({ ownerName, access, onDuplicate }: Props) {
    const { t } = useTranslation();
    const owner = ownerName || t('sharing.unknown_teacher');
    const Icon = access === 'edit' ? Pencil : Eye;
    return (
        <div
            role="status"
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
            <Icon size={16} style={{ color: 'var(--accent-text)', flexShrink: 0 }} aria-hidden="true" />
            <div style={{ flex: 1, minWidth: 200, fontSize: '0.85rem' }}>
                <strong>{t('sharing.banner_owner', { name: owner })}</strong>{' '}
                {access === 'edit' ? t('sharing.banner_edit', { name: owner }) : t('sharing.banner_view')}
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onDuplicate}>
                <Copy size={14} aria-hidden="true" /> {t('sharing.duplicate')}
            </button>
        </div>
    );
}
