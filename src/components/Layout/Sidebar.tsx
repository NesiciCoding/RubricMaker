import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, BookOpen, Users, FileText, Settings,
    Download, MessageSquare, BarChart3, Layers, ChevronRight
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';

export default function Sidebar() {
    const { t } = useTranslation();
    const { rubrics, students } = useApp();
    const navigate = useNavigate();

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
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div className="logo-icon">
                    <Layers size={18} />
                </div>
                Rubric Maker
            </div>

            <nav className="sidebar-nav">
                <span className="nav-section-label">{t('sidebar.main_section')}</span>
                {navItems.map(({ to, icon: Icon, label, end }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={end}
                        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    >
                        <Icon size={16} />
                        {label}
                    </NavLink>
                ))}

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
            </nav>

            <div className="sidebar-footer">
                <NavLink
                    to="/settings"
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                    <Settings size={16} />
                    {t('common.settings')}
                </NavLink>
            </div>
        </aside>
    );
}
