import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    BookOpen,
    Users,
    FileText,
    Settings,
    Download,
    MessageSquare,
    BarChart3,
    Layers,
    ChevronLeft,
    ChevronRight,
    Shield,
    X,
    GraduationCap,
    HelpCircle,
    Languages,
    ClipboardCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';

const COLLAPSE_KEY = 'rm_sidebar_collapsed';

interface SidebarProps {
    mobileOpen?: boolean;
    onMobileClose?: () => void;
}

export default function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
    const { t } = useTranslation();
    const { rubrics, students, settings } = useApp();
    const isAdmin = settings.userRole === 'admin';
    const location = useLocation();

    const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === 'true');

    useEffect(() => {
        const w = collapsed ? '64px' : '260px';
        document.documentElement.style.setProperty('--sidebar-w', w);
        localStorage.setItem(COLLAPSE_KEY, String(collapsed));
    }, [collapsed]);

    // Auto-close mobile drawer on navigation
    useEffect(() => {
        if (mobileOpen && onMobileClose) {
            onMobileClose();
        }
        // We intentionally only depend on location — not mobileOpen/onMobileClose
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location]);

    const navItemsTop = [
        { to: '/', icon: LayoutDashboard, label: t('navigation.dashboard'), end: true },
        { to: '/rubrics', icon: BookOpen, label: t('navigation.rubrics') },
        { to: '/tests', icon: ClipboardCheck, label: t('navigation.tests') },
        { to: '/students', icon: Users, label: t('navigation.students') },
        { to: '/cefr-overview', icon: GraduationCap, label: t('navigation.cefr_overview') },
    ];

    const navItemsBottom = [
        { to: '/attachments', icon: FileText, label: t('navigation.attachments') },
        { to: '/export', icon: Download, label: t('navigation.export') },
        { to: '/statistics', icon: BarChart3, label: t('navigation.statistics') },
        { to: '/vocabulary', icon: Languages, label: t('navigation.vocabulary') },
        { to: '/comments', icon: MessageSquare, label: t('navigation.comment_bank') },
        { to: '/docs', icon: HelpCircle, label: t('navigation.docs') },
    ];

    const renderNavLink = ({
        to,
        icon: Icon,
        label,
        end,
    }: {
        to: string;
        icon: React.ElementType;
        label: string;
        end?: boolean;
    }) => (
        <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            data-tour={to}
            aria-label={collapsed ? label : undefined}
            data-tooltip={collapsed ? label : undefined}
            style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : undefined}
        >
            <Icon size={16} aria-hidden="true" />
            {!collapsed && label}
        </NavLink>
    );

    return (
        <>
            {/* Mobile backdrop — click to close drawer */}
            <div
                className={`sidebar-backdrop${mobileOpen ? ' visible' : ''}`}
                onClick={onMobileClose}
                aria-hidden="true"
            />
            <aside
                className={`sidebar${mobileOpen ? ' mobile-open' : ''}`}
                data-collapsed={collapsed ? 'true' : undefined}
                style={{ width: collapsed ? 64 : 260 }}
                aria-label={t('sidebar.nav_label')}
            >
                {/* Logo + collapse toggle */}
                <div
                    className="sidebar-logo"
                    style={{
                        justifyContent: collapsed ? 'center' : 'space-between',
                        padding: collapsed ? '18px 14px' : '18px 16px',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                        <div className="logo-icon" style={{ flexShrink: 0 }}>
                            <Layers size={18} />
                        </div>
                        {!collapsed && (
                            <span style={{ fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap' }}>
                                Rubric Maker
                            </span>
                        )}
                    </div>
                    {/* On mobile, show close (✕) button; on desktop, show collapse toggle */}
                    <button
                        className="btn btn-ghost btn-icon btn-sm sidebar-close-btn"
                        onClick={onMobileClose}
                        aria-label="Close navigation menu"
                        style={{ flexShrink: 0 }}
                    >
                        <X size={15} />
                    </button>
                    <button
                        className="btn btn-ghost btn-icon btn-sm sidebar-collapse-btn"
                        onClick={() => setCollapsed((c) => !c)}
                        aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
                        aria-expanded={!collapsed}
                        style={{ flexShrink: 0, marginLeft: collapsed ? 0 : 4 }}
                    >
                        {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {!collapsed && <span className="nav-section-label">{t('sidebar.main_section')}</span>}

                    {navItemsTop.map(renderNavLink)}

                    {navItemsBottom.map(renderNavLink)}

                    {!collapsed && (
                        <>
                            <span className="nav-section-label" style={{ marginTop: 12 }}>
                                {t('sidebar.quick_stats')}
                            </span>
                            <div style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span>{t('sidebar.rubrics_count')}</span>
                                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{rubrics.length}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{t('sidebar.students_count')}</span>
                                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{students.length}</span>
                                </div>
                            </div>
                        </>
                    )}
                </nav>

                <div className="sidebar-footer">
                    <NavLink
                        to="/settings"
                        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        data-tour="/settings"
                        aria-label={collapsed ? t('common.settings') : undefined}
                        data-tooltip={collapsed ? t('common.settings') : undefined}
                        style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : undefined}
                    >
                        <Settings size={16} aria-hidden="true" />
                        {!collapsed && t('common.settings')}
                    </NavLink>
                    {isAdmin && (
                        <NavLink
                            to="/admin"
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            aria-label={collapsed ? t('admin.title') : undefined}
                            data-tooltip={collapsed ? t('admin.title') : undefined}
                            style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : undefined}
                        >
                            <Shield size={16} aria-hidden="true" />
                            {!collapsed && t('admin.title')}
                        </NavLink>
                    )}
                    <NavLink
                        to="/privacy"
                        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        aria-label={collapsed ? 'Privacy & AVG' : undefined}
                        data-tooltip={collapsed ? 'Privacy & AVG' : undefined}
                        style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : undefined}
                    >
                        <Shield size={16} aria-hidden="true" />
                        {!collapsed && 'Privacy & AVG'}
                    </NavLink>
                </div>
            </aside>
        </>
    );
}
