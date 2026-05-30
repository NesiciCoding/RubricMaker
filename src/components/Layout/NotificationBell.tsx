import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useOverdueStudents } from '../../hooks/useOverdueStudents';

const SESSION_NOTIF_KEY = 'rubricmaker_notif_shown';

export default function NotificationBell() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { overdueStudents, threshold } = useOverdueStudents();
    const [open, setOpen] = useState(false);
    const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>('unsupported');
    const panelRef = useRef<HTMLDivElement>(null);

    // Sync permission state
    useEffect(() => {
        if (!('Notification' in window)) return;
        setPermissionState(Notification.permission);
    }, [open]);

    // Fire a browser notification once per session if there are overdue items
    useEffect(() => {
        if (overdueStudents.length === 0) return;
        if (!('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;
        if (sessionStorage.getItem(SESSION_NOTIF_KEY)) return;

        sessionStorage.setItem(SESSION_NOTIF_KEY, '1');
        new Notification(t('notifications.browser_title'), {
            body: t('notifications.browser_body', { count: overdueStudents.length, threshold }),
            icon: '/favicon.ico',
        });
    }, [overdueStudents.length, threshold, t]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        function onPointerDown(e: PointerEvent) {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    const requestPermission = useCallback(async () => {
        if (!('Notification' in window)) return;
        const result = await Notification.requestPermission();
        setPermissionState(result);
    }, []);

    const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
    const count = overdueStudents.length;
    const visible = overdueStudents.filter((s) => !dismissedIds.has(s.studentId));
    const visibleCount = visible.length;

    const handleToggle = () => {
        if (!open) setDismissedIds(new Set());
        setOpen((v) => !v);
    };

    return (
        <div style={{ position: 'relative' }} ref={panelRef}>
            <button
                className="btn btn-ghost btn-icon"
                onClick={handleToggle}
                title={t('notifications.bell_title', { count })}
                aria-label={t('notifications.bell_title', { count })}
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

            {open && (
                <div
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        right: 0,
                        width: 320,
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                        zIndex: 200,
                        overflow: 'hidden',
                    }}
                >
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
                            {visibleCount > 0 && (
                                <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ fontSize: 12, padding: '2px 8px' }}
                                    onClick={() => setDismissedIds(new Set(overdueStudents.map((s) => s.studentId)))}
                                >
                                    {t('notifications.clear_all')}
                                </button>
                            )}
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setDismissedIds(new Set()); setOpen(false); }}>
                                <X size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Overdue list */}
                    <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                        {count === 0 || visibleCount === 0 ? (
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
                                    {t('notifications.overdue_subtitle', { count: visibleCount, threshold })}
                                </div>
                                {visible.slice(0, 10).map((s) => (
                                    <button
                                        key={s.studentId}
                                        onClick={() => {
                                            navigate(`/students/${s.studentId}`);
                                            setOpen(false);
                                        }}
                                        style={{
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
                                        }}
                                    >
                                        <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>
                                            {s.studentName}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: 11,
                                                color: '#ef4444',
                                                background: 'color-mix(in srgb, #ef4444 10%, transparent)',
                                                borderRadius: 6,
                                                padding: '2px 7px',
                                                whiteSpace: 'nowrap',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {t('notifications.days_ago', { count: s.daysSince })}
                                        </span>
                                    </button>
                                ))}
                                {visibleCount > 10 && (
                                    <div
                                        style={{
                                            padding: '8px 16px',
                                            fontSize: 12,
                                            color: 'var(--text-muted)',
                                            textAlign: 'center',
                                        }}
                                    >
                                        {t('notifications.more_overdue', { count: visibleCount - 10 })}
                                    </div>
                                )}
                            </>
                        )}
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
                                <button className="btn btn-primary btn-sm" onClick={requestPermission}>
                                    {t('notifications.enable_btn')}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
