import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, BookOpen, Users, FileText, Settings,
    Download, MessageSquare, BarChart3, Layers, ChevronRight
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/rubrics', icon: BookOpen, label: 'Rubrics' },
    { to: '/students', icon: Users, label: 'Students & Classes' },
    { to: '/attachments', icon: FileText, label: 'Attachments' },
    { to: '/export', icon: Download, label: 'Export' },
    { to: '/statistics', icon: BarChart3, label: 'Statistics' },
    { to: '/comments', icon: MessageSquare, label: 'Comment Bank' },
];

export default function Sidebar() {
    const { rubrics, students } = useApp();
    const navigate = useNavigate();

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div className="logo-icon">
                    <Layers size={18} />
                </div>
                Rubric Maker
            </div>

            <nav className="sidebar-nav">
                <span className="nav-section-label">Main</span>
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

                <span className="nav-section-label" style={{ marginTop: 12 }}>Quick Stats</span>
                <div style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span>Rubrics</span>
                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{rubrics.length}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Students</span>
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
                    Settings
                </NavLink>
            </div>
        </aside>
    );
}
