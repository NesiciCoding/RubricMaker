import { useTranslation } from 'react-i18next';
import { Users2, School } from 'lucide-react';
import type { MaterialSharing } from '../../types';

/** A small pill on a card saying who else can open it; renders nothing for private material. */
export default function SharingBadge({ sharing }: { sharing: MaterialSharing }) {
    const { t } = useTranslation();
    if (sharing.visibility === 'private') return null;
    const Icon = sharing.visibility === 'school' ? School : Users2;
    const label = t(`sharing.badge_${sharing.visibility}`);
    const access = sharing.access === 'edit' ? t('sharing.badge_editable') : '';
    return (
        <span
            title={access ? `${label} · ${access}` : label}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.7rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'var(--accent-soft)',
                color: 'var(--accent-text)',
                whiteSpace: 'nowrap',
            }}
        >
            <Icon size={11} aria-hidden="true" />
            {label}
            {access && <> · {access}</>}
        </span>
    );
}
