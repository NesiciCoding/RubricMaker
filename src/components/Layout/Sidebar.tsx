import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard, BookOpen, Users, FileText, Settings,
    Download, MessageSquare, BarChart3, Layers, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';

const COLLAPSE_KEY = 'rm_sidebar_collapsed';

export default function Sidebar() {
    const { t } = useTranslation();
    const { rubrics, students } = useApp();

    const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === 'true');

    useEffect(() => {
        const w = collapsed ? '64px' : '260px';
        document.documentElement.style.setProperty('--sidebar-w', w);
        localStorage.setItem(COLLAPSE_KEY, String(collapsed));
    }, [collapsed]);

    const navItems = [
        { to: '/', icon: LayoutDashboard, label: t('navigation.dashboard'), end: true },
        { to: '/rubrics', icon: BookOpen, label: t('navigation.rubrics') },
        { to: '/students', icon: Users, label: t('navigation.students') },
        { to: '/attachments', icon: FileText, label: t('navigation.attachments') },
        { to: '/export', icon: Download, label: t('navigation.export') },
        { to: '/statistics', icon: BarChart3, label: t('navigation.statistics') },
        { to: '/comments', icon: MessageSquare, label: t('navigation.comment_bank') },
    ];

    return (
        <aside className="sidebar" data-collapsed={collapsed ? 'true' : undefined} style={{ width: collapsed ? 64 : 260 }}>
            {/* Logo + collapse toggle */}
            <div className="sidebar-logo" style={{ justifyContent: collapsed ? 'center' : 'space-between', padding: collapsed ? '18px 14px' : '18px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                    <div className="logo-icon" style={{ flexShrink: 0 }}>
                        <Layers size={18} />
                    </div>
                    {!collapsed && <span style={{ fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap' }}>Rubric Maker</span>}
                </div>
                <button
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => setCollapsed(c => !c)}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    style={{ flexShrink: 0, marginLeft: collapsed ? 0 : 4 }}
                >
                    {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
                </button>
            </div>

            <nav className="sidebar-nav">
                {!collapsed && <span className="nav-section-label">{t('sidebar.main_section')}</span>}
                {navItems.map(({ to, icon: Icon, label, end }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={end}
                        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        data-tour={to}
                        title={collapsed ? label : undefined}
                        style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : undefined}
                    >
                        <Icon size={16} />
                        {!collapsed && label}
                    </NavLink>
                ))}

                {!collapsed && (
                    <>
                        <span className="nav-section-label" style={{ marginTop: 12 }}>{t('sidebar.quick_stats')}</span>
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
                    title={collapsed ? t('common.settings') : undefined}
                    style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : undefined}
                >
                    <Settings size={16} />
                    {!collapsed && t('common.settings')}
                </NavLink>
            </div>
        </aside>
    );
}
