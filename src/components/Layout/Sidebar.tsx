import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
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
    ChevronDown,
    Shield,
    X,
    GraduationCap,
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
    const { rubrics, students } = useApp();
    const location = useLocation();
    const navigate = useNavigate();

    const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === 'true');
    const [cefrOpen, setCefrOpen] = useState(false);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
    const cefrBtnRef = useRef<HTMLButtonElement>(null);
    const cefrDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const w = collapsed ? '64px' : '260px';
        document.documentElement.style.setProperty('--sidebar-w', w);
        localStorage.setItem(COLLAPSE_KEY, String(collapsed));
    }, [collapsed]);

    // Auto-close mobile drawer and CEFR dropdown on navigation
    useEffect(() => {
        setCefrOpen(false);
        if (mobileOpen && onMobileClose) {
            onMobileClose();
        }
        // We intentionally only depend on location — not mobileOpen/onMobileClose
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location]);

    // Close CEFR dropdown on outside click
    useEffect(() => {
        if (!cefrOpen) return;
        function handler(e: MouseEvent) {
            if (
                cefrDropdownRef.current &&
                !cefrDropdownRef.current.contains(e.target as Node) &&
                cefrBtnRef.current &&
                !cefrBtnRef.current.contains(e.target as Node)
            ) {
                setCefrOpen(false);
            }
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [cefrOpen]);

    function handleCefrClick() {
        if (!cefrOpen && cefrBtnRef.current) {
            const rect = cefrBtnRef.current.getBoundingClientRect();
            if (collapsed) {
                setDropdownPos({ top: rect.top, left: rect.right + 10, width: 220 });
            } else {
                setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
            }
        }
        setCefrOpen((o) => !o);
    }

    const isCefrActive = location.pathname.includes('/cefr-overview');
    const sortedStudents = [...students].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

    const navItemsTop = [
        { to: '/', icon: LayoutDashboard, label: t('navigation.dashboard'), end: true },
        { to: '/rubrics', icon: BookOpen, label: t('navigation.rubrics') },
        { to: '/students', icon: Users, label: t('navigation.students') },
    ];

    const navItemsBottom = [
        { to: '/attachments', icon: FileText, label: t('navigation.attachments') },
        { to: '/export', icon: Download, label: t('navigation.export') },
        { to: '/statistics', icon: BarChart3, label: t('navigation.statistics') },
        { to: '/comments', icon: MessageSquare, label: t('navigation.comment_bank') },
    ];

    const renderNavLink = ({ to, icon: Icon, label, end }: { to: string; icon: React.ElementType; label: string; end?: boolean }) => (
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
                aria-hidden={undefined /* always visible on desktop; CSS handles mobile */}
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
                        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        style={{ flexShrink: 0, marginLeft: collapsed ? 0 : 4 }}
                    >
                        {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {!collapsed && <span className="nav-section-label">{t('sidebar.main_section')}</span>}

                    {navItemsTop.map(renderNavLink)}

                    {/* CEFR Overview — dropdown button */}
                    <button
                        ref={cefrBtnRef}
                        className={`nav-item ${isCefrActive ? 'active' : ''}`}
                        onClick={handleCefrClick}
                        aria-label={collapsed ? t('navigation.cefr_overview') : undefined}
                        data-tooltip={collapsed ? t('navigation.cefr_overview') : undefined}
                        style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : undefined}
                    >
                        <GraduationCap size={16} aria-hidden="true" />
                        {!collapsed && (
                            <>
                                <span style={{ flex: 1 }}>{t('navigation.cefr_overview')}</span>
                                <ChevronDown
                                    size={12}
                                    style={{
                                        opacity: 0.5,
                                        transform: cefrOpen ? 'rotate(180deg)' : 'none',
                                        transition: 'transform 0.2s',
                                    }}
                                />
                            </>
                        )}
                    </button>

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

            {/* CEFR student picker — rendered outside <aside> so overflow:hidden doesn't clip it */}
            {cefrOpen && (
                <div
                    ref={cefrDropdownRef}
                    style={{
                        position: 'fixed',
                        top: dropdownPos.top,
                        left: dropdownPos.left,
                        width: dropdownPos.width || 220,
                        zIndex: 600,
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        maxHeight: 300,
                        overflowY: 'auto',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    }}
                >
                    {sortedStudents.length === 0 ? (
                        <div style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            {t('students.no_students_yet', 'No students yet')}
                        </div>
                    ) : (
                        sortedStudents.map((s) => (
                            <button
                                key={s.id}
                                className="cefr-dropdown-item"
                                onClick={() => {
                                    navigate(`/students/${s.id}/cefr-overview`);
                                    setCefrOpen(false);
                                }}
                            >
                                <div
                                    style={{
                                        width: 26,
                                        height: 26,
                                        borderRadius: '50%',
                                        background: 'var(--accent-soft)',
                                        color: 'var(--accent)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        flexShrink: 0,
                                    }}
                                >
                                    {s.name?.charAt(0).toUpperCase() ?? '?'}
                                </div>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {s.name}
                                </span>
                            </button>
                        ))
                    )}
                </div>
            )}
        </>
    );
}
