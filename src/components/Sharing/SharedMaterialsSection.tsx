import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Folder as FolderIcon, Pencil, Eye, RefreshCw, Share2 } from 'lucide-react';
import type { Folder, Rubric, Test } from '../../types';
import { childFolders } from '../../utils/folders';
import { groupSharedByOwner, nonEmptyFolderIds, type SharedEntry } from '../../utils/materialSharing';
import { useSharedMaterials, type SharedKind } from '../../hooks/useSharedMaterials';

interface Props<K extends SharedKind> {
    kind: K;
    onOpen: (id: string) => void;
    onDuplicate: (entry: SharedEntry<K extends 'rubric' ? Rubric : Test>) => void;
    /** Extra buttons on each row (assign, score sheet…), shown before Duplicate. */
    renderActions?: (entry: SharedEntry<K extends 'rubric' ? Rubric : Test>) => React.ReactNode;
    /** A second line under the item name (subject, mode…). */
    subtitle?: (item: K extends 'rubric' ? Rubric : Test) => string | undefined;
}

const ALL = '__all__';

/**
 * Colleagues' rubrics or tests this teacher may open, grouped per teacher in that teacher's own
 * folder tree. An admin sees every teacher in their school, so the teacher filter matters there.
 */
export default function SharedMaterialsSection<K extends SharedKind>({
    kind,
    onOpen,
    onDuplicate,
    subtitle,
    renderActions,
}: Props<K>) {
    type Item = K extends 'rubric' ? Rubric : Test;
    const { t } = useTranslation();
    const shared = useSharedMaterials(kind);
    const [ownerFilter, setOwnerFilter] = useState(ALL);

    const groups = useMemo(
        () => groupSharedByOwner(shared.items as SharedEntry<Item>[], shared.folders),
        [shared.items, shared.folders]
    );
    const visibleGroups = ownerFilter === ALL ? groups : groups.filter((g) => g.ownerId === ownerFilter);

    if (!shared.connected) return null;
    if (shared.status !== 'error' && groups.length === 0) return null;

    const headingId = `shared-${kind}-heading`;
    const folderKind = kind;

    function renderItem(entry: SharedEntry<Item>) {
        const item = entry.item;
        const sub = subtitle?.(item);
        return (
            <li
                key={item.id}
                className="card"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', listStyle: 'none' }}
            >
                <div style={{ flex: 1, minWidth: 0 }}>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => onOpen(item.id)}
                        style={{ padding: 0, fontWeight: 600, fontSize: '0.9rem', justifyContent: 'flex-start' }}
                    >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.name}
                        </span>
                    </button>
                    {sub && <div className="text-muted text-xs">{sub}</div>}
                </div>
                <span
                    className="text-xs"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        color: entry.access === 'edit' ? 'var(--accent-text)' : 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {entry.access === 'edit' ? (
                        <Pencil size={12} aria-hidden="true" />
                    ) : (
                        <Eye size={12} aria-hidden="true" />
                    )}
                    {entry.access === 'edit' ? t('sharing.can_edit') : t('sharing.view_only')}
                </span>
                {renderActions?.(entry)}
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onDuplicate(entry)}
                    aria-label={t('sharing.duplicate_named', { name: item.name })}
                    title={t('sharing.duplicate')}
                >
                    <Copy size={13} aria-hidden="true" /> <span className="hide-mobile">{t('sharing.duplicate')}</span>
                </button>
            </li>
        );
    }

    function renderLevel(folders: Folder[], items: SharedEntry<Item>[], keep: Set<string>, parentId?: string) {
        const subfolders = childFolders(folders, folderKind, parentId).filter((f) => keep.has(f.id));
        const here = items.filter((e) => (e.item.folderId ?? undefined) === parentId);
        return (
            <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {subfolders.map((f) => (
                    <li key={f.id} style={{ listStyle: 'none' }}>
                        <details open>
                            <summary
                                style={{
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    padding: '4px 0',
                                }}
                            >
                                <FolderIcon size={14} style={{ color: 'var(--accent-text)' }} aria-hidden="true" />
                                {f.name}
                            </summary>
                            <div style={{ paddingLeft: 18, paddingTop: 4 }}>
                                {renderLevel(folders, items, keep, f.id)}
                            </div>
                        </details>
                    </li>
                ))}
                {here.map(renderItem)}
            </ul>
        );
    }

    return (
        <section aria-labelledby={headingId} style={{ marginTop: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <Share2 size={15} style={{ color: 'var(--accent-text)' }} aria-hidden="true" />
                <h3 id={headingId} style={{ margin: 0, fontSize: '1rem', fontWeight: 600, flex: 1 }}>
                    {t('sharing.shared_with_me')}
                </h3>
                {groups.length > 1 && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
                        <span className="text-muted">{t('sharing.filter_teacher')}</span>
                        <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
                            <option value={ALL}>{t('sharing.filter_all_teachers')}</option>
                            {groups.map((g) => (
                                <option key={g.ownerId} value={g.ownerId}>
                                    {g.ownerName || t('sharing.unknown_teacher')}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={shared.refresh}
                    aria-label={t('sharing.refresh')}
                    title={t('sharing.refresh')}
                >
                    <RefreshCw size={14} />
                </button>
            </div>
            {shared.status === 'error' && (
                <p role="alert" className="text-sm" style={{ color: 'var(--red-text)' }}>
                    {t('sharing.load_error')}
                </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {visibleGroups.map((g) => {
                    const keep = nonEmptyFolderIds(
                        g.folders,
                        g.items.map((e) => e.item)
                    );
                    return (
                        <div key={g.ownerId}>
                            <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                {g.ownerName || t('sharing.unknown_teacher')}
                            </h4>
                            {renderLevel(g.folders, g.items, keep)}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
