import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, AlertCircle, CheckCircle2, Mail, UserCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useNotificationFeed } from '../../hooks/useNotificationFeed';

const SESSION_NOTIF_KEY = 'rubricmaker_notif_shown';

const POPOVER_ITEM_CAP = 5;

export default function NotificationBell() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { overdueItems, messageItems, moderationItems, count, threshold, dismissAll } = useNotificationFeed();
    const [open, setOpen] = useState(false);
    const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>('unsupported');
    const panelRef = useRef<HTMLDivElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [popoverPos, setPopoverPos] = useState<{ top: number; right: number } | null>(null);

    // .topbar-actions has overflow-x: auto, which clips position:absolute
    // descendants on both axes — portal the panel out and position it via
    // the bell's own bounding rect instead.
    useEffect(() => {
        if (!open || !panelRef.current) return;
        const rect = panelRef.current.getBoundingClientRect();
        setPopoverPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }, [open]);

    // Sync permission state
    useEffect(() => {
        if (!('Notification' in window)) return;
        setPermissionState(Notification.permission);
    }, [open]);

    // Fire a browser notification once per session if there are overdue items
    useEffect(() => {
        if (overdueItems.length === 0) return;
        if (!('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;
        if (sessionStorage.getItem(SESSION_NOTIF_KEY)) return;

        sessionStorage.setItem(SESSION_NOTIF_KEY, '1');
        new Notification(t('notifications.browser_title'), {
            body: t('notifications.browser_body', { count: overdueItems.length, threshold }),
            icon: '/favicon.ico',
        });
    }, [overdueItems.length, threshold, t]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        function onPointerDown(e: PointerEvent) {
            const target = e.target as Node;
            if (panelRef.current?.contains(target)) return;
            if (popoverRef.current?.contains(target)) return;
            setOpen(false);
        }
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    const requestPermission = useCallback(async () => {
        if (!('Notification' in window)) return;
        const result = await Notification.requestPermission();
        setPermissionState(result);
    }, []);

    const handleToggle = () => {
        setOpen((v) => !v);
    };

    // Bulk-clears the two dismissible types shown here; unread messages aren't
    // included since "clearing" one means marking it read, a real action a teacher
    // should take deliberately from the message thread or the Notifications page.
    const clearAll = () => {
        dismissAll('overdue_grading');
        dismissAll('moderation_pending');
    };

    const goToNotifications = () => {
        navigate('/notifications');
        setOpen(false);
    };

    const notificationPanelContent = (
        <>
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border)',
                }}
            >
                <span style={{ fontWeight: 600, fontSize: 14 }}>{t('notifications.panel_title')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {(overdueItems.length > 0 || moderationItems.length > 0) && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: 12, padding: '2px 8px' }}
                            onClick={clearAll}
                        >
                            {t('notifications.clear_all')}
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        aria-label={t('common.close')}
                        onClick={() => setOpen(false)}
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {count === 0 ? (
                <div
                    style={{
                        padding: '20px 16px',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        fontSize: 13,
                    }}
                >
                    <CheckCircle2
                        size={28}
                        style={{
                            color: '#22c55e',
                            marginBottom: 8,
                            display: 'block',
                            margin: '0 auto 8px',
                        }}
                    />
                    {t('notifications.all_up_to_date', { threshold })}
                </div>
            ) : (
                <>
                    {/* Overdue grading */}
                    {overdueItems.length > 0 && (
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                            <div
                                style={{
                                    padding: '8px 16px',
                                    fontSize: 12,
                                    color: 'var(--text-muted)',
                                    background: 'color-mix(in srgb, #ef4444 8%, transparent)',
                                    borderBottom: '1px solid var(--border)',
                                }}
                            >
                                <AlertCircle
                                    size={12}
                                    style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
                                />
                                {t('notifications.overdue_subtitle', { count: overdueItems.length, threshold })}
                            </div>
                            {overdueItems.slice(0, POPOVER_ITEM_CAP).map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                        navigate(`/students/${item.studentId}`);
                                        setOpen(false);
                                    }}
                                    style={rowStyle}
                                >
                                    <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>
                                        {item.studentName}
                                    </span>
                                    <span
                                        style={{
                                            ...pillStyle,
                                            color: '#ef4444',
                                            background: 'color-mix(in srgb, #ef4444 10%, transparent)',
                                        }}
                                    >
                                        {t('notifications.days_ago', { count: item.daysSince })}
                                    </span>
                                </button>
                            ))}
                            {overdueItems.length > POPOVER_ITEM_CAP && (
                                <div style={moreStyle}>
                                    {t('notifications.more_overdue', { count: overdueItems.length - POPOVER_ITEM_CAP })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Unread student messages */}
                    {messageItems.length > 0 && (
                        <div style={{ maxHeight: 200, overflowY: 'auto', borderTop: '1px solid var(--border)' }}>
                            <div
                                style={{
                                    padding: '8px 16px',
                                    fontSize: 12,
                                    color: 'var(--text-muted)',
                                    background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                                    borderBottom: '1px solid var(--border)',
                                }}
                            >
                                <Mail
                                    size={12}
                                    style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
                                />
                                {t('notifications.unread_messages_subtitle', { count: messageItems.length })}
                            </div>
                            {messageItems.slice(0, POPOVER_ITEM_CAP).map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                        navigate('/messages');
                                        setOpen(false);
                                    }}
                                    style={rowStyle}
                                >
                                    <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>
                                        {item.studentName}
                                    </span>
                                    <span
                                        style={{
                                            ...pillStyle,
                                            color: 'var(--accent)',
                                            background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                                        }}
                                    >
                                        {item.unreadCount}
                                    </span>
                                </button>
                            ))}
                            {messageItems.length > POPOVER_ITEM_CAP && (
                                <div style={moreStyle}>
                                    {t('notifications.more_items', { count: messageItems.length - POPOVER_ITEM_CAP })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Pending moderation reviews */}
                    {moderationItems.length > 0 && (
                        <div style={{ maxHeight: 200, overflowY: 'auto', borderTop: '1px solid var(--border)' }}>
                            <div
                                style={{
                                    padding: '8px 16px',
                                    fontSize: 12,
                                    color: 'var(--text-muted)',
                                    background: 'color-mix(in srgb, #f59e0b 8%, transparent)',
                                    borderBottom: '1px solid var(--border)',
                                }}
                            >
                                <UserCheck
                                    size={12}
                                    style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
                                />
                                {t('notifications.moderation_subtitle', { count: moderationItems.length })}
                            </div>
                            {moderationItems.slice(0, POPOVER_ITEM_CAP).map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                        navigate('/moderation');
                                        setOpen(false);
                                    }}
                                    style={rowStyle}
                                >
                                    <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>
                                        {item.studentName}
                                    </span>
                                    {item.pendingDays !== null && (
                                        <span
                                            style={{
                                                ...pillStyle,
                                                color: '#f59e0b',
                                                background: 'color-mix(in srgb, #f59e0b 10%, transparent)',
                                            }}
                                        >
                                            {t('coGrading.pending_days', { count: item.pendingDays })}
                                        </span>
                                    )}
                                </button>
                            ))}
                            {moderationItems.length > POPOVER_ITEM_CAP && (
                                <div style={moreStyle}>
                                    {t('notifications.more_items', {
                                        count: moderationItems.length - POPOVER_ITEM_CAP,
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            <div style={{ borderTop: '1px solid var(--border)' }}>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', borderRadius: 0, padding: '10px 16px' }}
                    onClick={goToNotifications}
                >
                    {t('notifications.view_all')}
                </button>
            </div>

            {/* Browser notification opt-in */}
            {permissionState !== 'unsupported' && permissionState !== 'granted' && (
                <div
                    style={{
                        padding: '12px 16px',
                        borderTop: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                    }}
                >
                    <Bell size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4 }}>
                            {permissionState === 'denied'
                                ? t('notifications.permission_denied')
                                : t('notifications.enable_push')}
                        </div>
                    </div>
                    {permissionState !== 'denied' && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={requestPermission}>
                            {t('notifications.enable_btn')}
                        </button>
                    )}
                </div>
            )}
        </>
    );

    return (
        <div style={{ position: 'relative' }} ref={panelRef}>
            <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={handleToggle}
                aria-label={t('notifications.bell_title', { count })}
                aria-expanded={open}
                aria-haspopup="true"
            >
                <Bell size={18} />
                {count > 0 && (
                    <span
                        style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            background: 'var(--danger, #ef4444)',
                            color: '#fff',
                            borderRadius: '50%',
                            width: 16,
                            height: 16,
                            fontSize: 10,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pointerEvents: 'none',
                        }}
                    >
                        {count > 99 ? '99+' : count}
                    </span>
                )}
            </button>

            {open &&
                popoverPos &&
                createPortal(
                    <div
                        ref={popoverRef}
                        role="region"
                        aria-label={t('notifications.panel_label')}
                        style={{
                            position: 'fixed',
                            top: popoverPos.top,
                            right: popoverPos.right,
                            width: 320,
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 10,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                            zIndex: 200,
                            overflow: 'hidden',
                        }}
                    >
                        {notificationPanelContent}
                    </div>,
                    document.body
                )}
        </div>
    );
}

const rowStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
    textAlign: 'left',
    gap: 8,
};

const pillStyle: React.CSSProperties = {
    fontSize: 11,
    borderRadius: 6,
    padding: '2px 7px',
    whiteSpace: 'nowrap',
    fontWeight: 600,
};

const moreStyle: React.CSSProperties = {
    padding: '8px 16px',
    fontSize: 12,
    color: 'var(--text-muted)',
    textAlign: 'center',
};
