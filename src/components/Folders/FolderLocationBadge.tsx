import { useTranslation } from 'react-i18next';
import { Folder } from 'lucide-react';

/**
 * Where a card is filed: the folder's full path, e.g. “Year 1 / Essays”.
 *
 * The path is capped at one line and ellipsised, because a deep tree would otherwise push the
 * other badges off the card; the full path stays available as the title.
 */
export default function FolderLocationBadge({ path }: { path: string }) {
    const { t } = useTranslation();
    return (
        <span
            className="badge"
            title={t('folders.location_title', { path })}
            style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-muted)',
                maxWidth: '100%',
                minWidth: 0,
            }}
        >
            <Folder size={11} aria-hidden="true" style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</span>
        </span>
    );
}
