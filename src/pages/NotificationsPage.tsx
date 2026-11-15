import React, { useMemo, useState } from 'react';
import PageTour from '../components/Tour/PageTour';
import { usePageTourState } from '../hooks/usePageTourState';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Mail, UserCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useNotificationFeed, NotificationFeedItem } from '../hooks/useNotificationFeed';
import { EmptyState } from '../components/ui/EmptyState';

type FilterKind = 'all' | 'overdue_grading' | 'unread_message' | 'moderation_pending';

const FILTERS: FilterKind[] = ['all', 'overdue_grading', 'unread_message', 'moderation_pending'];

const TYPE_ICON: Record<NotificationFeedItem['type'], React.ElementType> = {
    overdue_grading: AlertCircle,
    unread_message: Mail,
    moderation_pending: UserCheck,
};

export default function NotificationsPage() {
    const { t } = useTranslation();
    const tour = usePageTourState('notifications');
    const navigate = useNavigate();
    const {
        items,
        overdueItems,
        messageItems,
        moderationItems,
        threshold,
        dismiss,
        dismissAll,
        markThreadRead,
        markAllMessagesRead,
    } = useNotificationFeed();
    const [filter, setFilter] = useState<FilterKind>('all');

    const filtered = useMemo(
        () => (filter === 'all' ? items : items.filter((item) => item.type === filter)),
        [items, filter]
    );

    function detailFor(item: NotificationFeedItem): string {
        if (item.type === 'overdue_grading') {
            return `${t('notifications.waiting_count', { count: item.waitingCount })} · ${t('notifications.days_ago', { count: item.daysSince })}`;
        }
        if (item.type === 'unread_message') return t('notifications.unread_count', { count: item.unreadCount });
        return item.pendingDays !== null ? t('coGrading.pending_days', { count: item.pendingDays }) : '';
    }

    function viewTarget(item: NotificationFeedItem): string {
        if (item.type === 'overdue_grading') return item.path;
        if (item.type === 'unread_message') return '/messages';
        return '/moderation';
    }

    // One clear action per dismissible type, labelled with the type it clears: the old single
    // "Clear all" left unread messages and any filtered-out type behind, so the label promised
    // more than the click did. Unread messages are never bulk-cleared here — Message.readByTeacher
    // is real synced state, so clearing it is the explicit "Mark all read" action instead.
    type ClearableKind = 'overdue_grading' | 'moderation_pending';
    const clearableKinds: ClearableKind[] =
        filter === 'all' ? ['overdue_grading', 'moderation_pending'] : filter === 'unread_message' ? [] : [filter];
    const visibleClearableKinds = clearableKinds.filter(
        (kind) => (kind === 'overdue_grading' ? overdueItems : moderationItems).length > 0
    );

    return (
        <>
            <PageTour {...tour.tourProps} />
            <Topbar
                title={t('notifications.page_title')}
                actions={
                    <button className="btn btn-ghost btn-sm" onClick={tour.start}>
                        {t('tutorial.page_tour_button')}
                    </button>
                }
            />
            <div className="page-content fade-in" data-tour="nt-content">
                <div
                    data-tour="nt-filters"
                    style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}
                >
                    {FILTERS.map((kind) => (
                        <button
                            key={kind}
                            type="button"
                            aria-pressed={filter === kind}
                            className={`btn btn-sm ${filter === kind ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setFilter(kind)}
                        >
                            {t(`notifications.filter_${kind}`)}
                            {kind !== 'all' && (
                                <span style={{ marginLeft: 6 }}>
                                    (
                                    {kind === 'overdue_grading'
                                        ? overdueItems.length
                                        : kind === 'unread_message'
                                          ? messageItems.length
                                          : moderationItems.length}
                                    )
                                </span>
                            )}
                        </button>
                    ))}
                    {visibleClearableKinds.map((kind, index) => (
                        <button
                            key={kind}
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={index === 0 ? { marginLeft: 'auto' } : undefined}
                            onClick={() => dismissAll(kind)}
                        >
                            {t('notifications.clear_type', { type: t(`notifications.filter_${kind}`) })}
                        </button>
                    ))}
                    {filter === 'unread_message' && messageItems.length > 0 && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ marginLeft: 'auto' }}
                            onClick={markAllMessagesRead}
                        >
                            {t('notifications.mark_all_read')}
                        </button>
                    )}
                </div>

                {filtered.length === 0 ? (
                    <EmptyState
                        icon={CheckCircle2}
                        title={t('notifications.all_up_to_date', { threshold })}
                        titleLevel={2}
                        description={t('notifications.empty_desc')}
                    />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {filtered.map((item) => {
                            const Icon = TYPE_ICON[item.type];
                            return (
                                <div
                                    key={item.id}
                                    className="card"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 12,
                                        padding: '12px 16px',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                        <Icon size={16} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                                        <div style={{ minWidth: 0 }}>
                                            <h2
                                                style={{
                                                    margin: 0,
                                                    fontWeight: 600,
                                                    fontSize: 14,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {item.type === 'overdue_grading' ? item.title : item.studentName}
                                            </h2>
                                            <div className="text-muted text-xs">
                                                {t(`notifications.filter_${item.type}`)} · {detailFor(item)}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => navigate(viewTarget(item))}
                                        >
                                            {t('notifications.action_view')}
                                        </button>
                                        {item.type === 'unread_message' ? (
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => markThreadRead(item)}
                                            >
                                                {t('notifications.action_mark_read')}
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => dismiss(item)}
                                            >
                                                {t('notifications.action_dismiss')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}
