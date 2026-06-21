import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Store, ThumbsUp, Copy, Upload, Check } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { useDbStatus } from '../hooks/useDbStatus';
import { storageSync } from '../services/database';
import type { MarketplaceListing } from '../types';

export default function MarketplacePage() {
    const { t } = useTranslation();
    const { rubrics, addRubric, settings } = useApp();
    const dbStatus = useDbStatus();
    const schoolId = settings.schoolId;

    const [listings, setListings] = useState<MarketplaceListing[]>([]);
    const [loading, setLoading] = useState(true);
    const [myUpvotes, setMyUpvotes] = useState<Set<string>>(new Set());
    const [showPublish, setShowPublish] = useState(false);
    const [publishRubricId, setPublishRubricId] = useState('');
    const [publishAttribution, setPublishAttribution] = useState(
        dbStatus.currentUser?.displayName ? `${t('marketplace.shared_by_prefix')} ${dbStatus.currentUser.displayName}` : ''
    );
    const [publishing, setPublishing] = useState(false);
    const [clonedId, setClonedId] = useState<string | null>(null);

    const canUseMarketplace = dbStatus.isConnected && !!schoolId;

    const load = useCallback(async () => {
        if (!canUseMarketplace || !schoolId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const list = await storageSync.adapter.listMarketplaceListings(schoolId);
        setListings(list);
        setLoading(false);
    }, [canUseMarketplace, schoolId]);

    useEffect(() => {
        load();
    }, [load]);

    async function handlePublish() {
        const rubric = rubrics.find((r) => r.id === publishRubricId);
        if (!rubric || !schoolId) return;
        setPublishing(true);
        const result = await storageSync.adapter.publishToMarketplace(
            schoolId,
            rubric,
            publishAttribution.trim() || undefined
        );
        setPublishing(false);
        if (result) {
            setShowPublish(false);
            setPublishRubricId('');
            await load();
        }
    }

    async function handleClone(listingId: string) {
        const cloned = await storageSync.adapter.cloneMarketplaceListing(listingId);
        if (!cloned) return;
        const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = cloned;
        addRubric(fields);
        setClonedId(listingId);
        setTimeout(() => setClonedId(null), 2000);
    }

    async function handleToggleUpvote(listingId: string) {
        const isUpvoted = myUpvotes.has(listingId);
        const result = isUpvoted
            ? await storageSync.adapter.removeUpvote(listingId)
            : await storageSync.adapter.upvoteListing(listingId);
        if (!result.success) return;
        setMyUpvotes((prev) => {
            const next = new Set(prev);
            if (isUpvoted) next.delete(listingId);
            else next.add(listingId);
            return next;
        });
        setListings((prev) =>
            prev.map((l) =>
                l.id === listingId ? { ...l, upvoteCount: l.upvoteCount + (isUpvoted ? -1 : 1) } : l
            )
        );
    }

    if (!canUseMarketplace) {
        return (
            <>
                <Topbar title={t('marketplace.title')} />
                <div className="page-content fade-in">
                    <div
                        className="card"
                        style={{ maxWidth: 480, margin: '40px auto', textAlign: 'center', padding: 32 }}
                    >
                        <Store size={32} style={{ margin: '0 auto 12px', display: 'block', color: 'var(--text-muted)' }} />
                        <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                            {t('marketplace.disabled_title')}
                        </p>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            {t('marketplace.disabled_body')}
                        </p>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Topbar
                title={t('marketplace.title')}
                actions={
                    <button className="btn btn-primary btn-sm" onClick={() => setShowPublish(true)}>
                        <Upload size={16} /> {t('marketplace.publish_button')}
                    </button>
                }
            />
            <div className="page-content fade-in">
                <p className="text-muted text-xs" style={{ marginBottom: 16 }}>
                    {t('marketplace.intro')}
                </p>

                {showPublish && (
                    <div className="card" style={{ marginBottom: 20, maxWidth: 480 }}>
                        <h3 style={{ marginBottom: 12 }}>{t('marketplace.publish_title')}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <label className="text-xs text-muted">{t('marketplace.publish_select_rubric')}</label>
                            <select value={publishRubricId} onChange={(e) => setPublishRubricId(e.target.value)}>
                                <option value="">{t('marketplace.publish_select_placeholder')}</option>
                                {rubrics.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.name}
                                    </option>
                                ))}
                            </select>
                            <label className="text-xs text-muted">{t('marketplace.publish_attribution_label')}</label>
                            <input
                                type="text"
                                value={publishAttribution}
                                onChange={(e) => setPublishAttribution(e.target.value)}
                                placeholder={t('marketplace.publish_attribution_placeholder')}
                            />
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                <button
                                    className="btn btn-primary btn-sm"
                                    disabled={!publishRubricId || publishing}
                                    onClick={handlePublish}
                                >
                                    {t('marketplace.publish_confirm')}
                                </button>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setShowPublish(false)}
                                    disabled={publishing}
                                >
                                    {t('common.cancel')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {loading ? (
                    <p className="text-muted text-xs">{t('marketplace.loading')}</p>
                ) : listings.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                        <p style={{ color: 'var(--text-muted)' }}>{t('marketplace.empty_state')}</p>
                    </div>
                ) : (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                            gap: 16,
                        }}
                    >
                        {listings.map((listing) => (
                            <div key={listing.id} className="card">
                                <div style={{ marginBottom: 8 }}>
                                    <h3>{listing.name}</h3>
                                    {listing.subject && (
                                        <div className="text-muted text-xs" style={{ marginTop: 2 }}>
                                            {listing.subject}
                                        </div>
                                    )}
                                </div>
                                {listing.description && (
                                    <p
                                        style={{
                                            fontSize: '0.85rem',
                                            color: 'var(--text-muted)',
                                            marginBottom: 8,
                                        }}
                                    >
                                        {listing.description}
                                    </p>
                                )}
                                {listing.attribution && (
                                    <p
                                        style={{
                                            fontSize: '0.75rem',
                                            color: 'var(--text-muted)',
                                            fontStyle: 'italic',
                                            marginBottom: 12,
                                        }}
                                    >
                                        {listing.attribution}
                                    </p>
                                )}
                                <div
                                    style={{
                                        display: 'flex',
                                        gap: 8,
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                    }}
                                >
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        style={{
                                            color: myUpvotes.has(listing.id) ? 'var(--accent)' : undefined,
                                        }}
                                        onClick={() => handleToggleUpvote(listing.id)}
                                        title={t('marketplace.upvote_title')}
                                    >
                                        <ThumbsUp size={14} /> {listing.upvoteCount}
                                    </button>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => handleClone(listing.id)}
                                        title={t('marketplace.clone_title')}
                                    >
                                        {clonedId === listing.id ? (
                                            <>
                                                <Check size={14} /> {t('marketplace.clone_done')}
                                            </>
                                        ) : (
                                            <>
                                                <Copy size={14} /> {t('marketplace.clone_button')}
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
