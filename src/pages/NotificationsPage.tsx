import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Mail, UserCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useNotificationFeed, NotificationFeedItem } from '../hooks/useNotificationFeed';

type FilterKind = 'all' | 'overdue_grading' | 'unread_message' | 'moderation_pending';

const FILTERS: FilterKind[] = ['all', 'overdue_grading', 'unread_message', 'moderation_pending'];

const TYPE_ICON: Record<NotificationFeedItem['type'], React.ElementType> = {
    overdue_grading: AlertCircle,
    unread_message: Mail,
    moderation_pending: UserCheck,
};

export default function NotificationsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { items, overdueItems, messageItems, moderationItems, threshold, dismiss, dismissAll, markThreadRead } =
        useNotificationFeed();
    const [filter, setFilter] = useState<FilterKind>('all');

    const filtered = useMemo(
        () => (filter === 'all' ? items : items.filter((item) => item.type === filter)),
        [items, filter]
    );

    function detailFor(item: NotificationFeedItem): string {
        if (item.type === 'overdue_grading') return t('notifications.days_ago', { count: item.daysSince });
        if (item.type === 'unread_message') return t('notifications.unread_count', { count: item.unreadCount });
        return item.pendingDays !== null ? t('coGrading.pending_days', { count: item.pendingDays }) : '';
    }

    function viewTarget(item: NotificationFeedItem): string {
        if (item.type === 'overdue_grading') return `/students/${item.studentId}`;
        if (item.type === 'unread_message') return '/messages';
        return '/moderation';
    }

    // Deliberately never bulk-marks unread messages as read — same rationale as
    // NotificationBell's clearAll: Message.readByTeacher is real, synced state, so
    // clearing it is a deliberate per-thread action (the "Mark read" button below),
    // not something a broad "Clear all" click should do silently and irreversibly.
    function handleClearVisible() {
        if (filter === 'all' || filter === 'overdue_grading') dismissAll('overdue_grading');
        if (filter === 'all' || filter === 'moderation_pending') dismissAll('moderation_pending');
    }

    const canClearVisible = filter !== 'unread_message' && filtered.length > 0;

    return (
        <>
            <Topbar title={t('notifications.page_title')} />
            <div className="page-content fade-in">
                <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
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
                                <span style={{ marginLeft: 6, opacity: 0.75 }}>
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
                    {canClearVisible && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ marginLeft: 'auto' }}
                            onClick={handleClearVisible}
                        >
                            {t('notifications.clear_all')}
                        </button>
                    )}
                </div>

                {filtered.length === 0 ? (
                    <div className="empty-state">
                        <CheckCircle2 size={40} style={{ color: '#22c55e' }} />
                        <h3>{t('notifications.all_up_to_date', { threshold })}</h3>
                        <p className="text-muted text-sm">{t('notifications.empty_desc')}</p>
                    </div>
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
                                            <div
                                                style={{
                                                    fontWeight: 600,
                                                    fontSize: 14,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {item.studentName}
                                            </div>
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
