import React, { useEffect } from 'react';
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
    Shield,
    X,
    GraduationCap,
    HelpCircle,
    Languages,
    ClipboardCheck,
    PenLine,
    LayoutGrid,
    Store,
    UserCheck,
    PenTool,
    Folder,
    Mail,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';

interface SidebarProps {
    mobileOpen?: boolean;
    onMobileClose?: () => void;
}

interface SubItem {
    to: string;
    icon: React.ElementType;
    label: string;
    end?: boolean;
}

interface Domain {
    key: string;
    icon: React.ElementType;
    label: string;
    /** Pathname prefixes that activate this domain (besides its own sub-items). */
    matchPrefixes: string[];
    items: SubItem[];
}

export default function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
    const { t } = useTranslation();
    const { settings } = useApp();
    const isAdmin = settings.userRole === 'admin';
    const location = useLocation();

    // Auto-close mobile drawer on navigation
    useEffect(() => {
        if (mobileOpen && onMobileClose) {
            onMobileClose();
        }
        // We intentionally only depend on location — not mobileOpen/onMobileClose
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location]);

    const domains: Domain[] = [
        {
            key: 'overview',
            icon: LayoutDashboard,
            label: t('sidebar.domain_overview'),
            matchPrefixes: ['/', '/activity-dashboard'],
            items: [
                { to: '/', icon: LayoutDashboard, label: t('navigation.dashboard'), end: true },
                { to: '/activity-dashboard', icon: LayoutGrid, label: t('navigation.activity_dashboard') },
            ],
        },
        {
            key: 'assessments',
            icon: BookOpen,
            label: t('sidebar.domain_assessments'),
            matchPrefixes: [
                '/rubrics',
                '/tests',
                '/essays',
                '/marketplace',
                '/peer-analytics',
                '/grade-comparative',
                '/speaking',
            ],
            items: [
                { to: '/rubrics', icon: BookOpen, label: t('navigation.rubrics') },
                { to: '/tests', icon: ClipboardCheck, label: t('navigation.tests') },
                { to: '/essays', icon: PenLine, label: t('navigation.essays') },
                { to: '/marketplace', icon: Store, label: t('navigation.marketplace') },
            ],
        },
        {
            key: 'students',
            icon: Users,
            label: t('sidebar.domain_students'),
            matchPrefixes: ['/students', '/cefr-overview', '/vocabulary'],
            items: [
                { to: '/students', icon: Users, label: t('navigation.students') },
                { to: '/cefr-overview', icon: GraduationCap, label: t('navigation.cefr_overview') },
                { to: '/vocabulary', icon: Languages, label: t('navigation.vocabulary') },
            ],
        },
        {
            key: 'grading',
            icon: PenTool,
            label: t('sidebar.domain_grading'),
            matchPrefixes: ['/moderation', '/messages'],
            items: [
                { to: '/moderation', icon: UserCheck, label: t('navigation.moderation') },
                { to: '/messages', icon: Mail, label: t('navigation.messages') },
            ],
        },
        {
            key: 'insights',
            icon: BarChart3,
            label: t('sidebar.domain_insights'),
            matchPrefixes: ['/statistics', '/export'],
            items: [
                { to: '/statistics', icon: BarChart3, label: t('navigation.statistics') },
                { to: '/export', icon: Download, label: t('navigation.export') },
            ],
        },
        {
            key: 'library',
            icon: Folder,
            label: t('sidebar.domain_library'),
            matchPrefixes: ['/comments', '/attachments'],
            items: [
                { to: '/comments', icon: MessageSquare, label: t('navigation.comment_bank') },
                { to: '/attachments', icon: FileText, label: t('navigation.attachments') },
            ],
        },
    ];

    const matchedDomain = domains.find((d) =>
        d.matchPrefixes.some((p) => (p === '/' ? location.pathname === '/' : location.pathname.startsWith(p)))
    );
    // Footer pages (/settings, /docs, /admin, /privacy) and unmapped dynamic routes match no
    // domain — keep the previously-active domain highlighted instead of jumping to Overview.
    const [lastDomainKey, setLastDomainKey] = React.useState(matchedDomain?.key ?? domains[0].key);
    useEffect(() => {
        if (matchedDomain) setLastDomainKey(matchedDomain.key);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matchedDomain?.key]);
    const activeDomain = matchedDomain ?? domains.find((d) => d.key === lastDomainKey) ?? domains[0];

    const renderNavLink = ({ to, icon: Icon, label, end }: SubItem) => (
        <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            data-tour={to}
        >
            <Icon size={16} aria-hidden="true" />
            {label}
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
            <aside className={`sidebar${mobileOpen ? ' mobile-open' : ''}`} aria-label={t('sidebar.nav_label')}>
                {/* Icon rail — one button per domain */}
                <nav className="nav-rail" aria-label={t('sidebar.domain_rail_label')}>
                    <div className="nav-rail-logo">
                        <Layers size={18} />
                    </div>
                    {domains.map((d) => (
                        <NavLink
                            key={d.key}
                            to={d.items[0].to}
                            className={`nav-rail-item${d.key === activeDomain.key ? ' active' : ''}`}
                            aria-label={d.label}
                            data-tour={`rail:${d.key}`}
                        >
                            <d.icon size={20} aria-hidden="true" />
                            {d.label}
                        </NavLink>
                    ))}
                </nav>

                {/* Sub-panel — items within the active domain */}
                <div className="nav-sub-panel">
                    <div
                        className="nav-sub-panel-header"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                        {activeDomain.label}
                        <button
                            className="btn btn-ghost btn-icon btn-sm sidebar-close-btn"
                            onClick={onMobileClose}
                            aria-label="Close navigation menu"
                        >
                            <X size={15} />
                        </button>
                    </div>
                    <nav className="sidebar-nav">{activeDomain.items.map(renderNavLink)}</nav>

                    <div className="sidebar-footer">
                        <NavLink
                            to="/settings"
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            data-tour="/settings"
                        >
                            <Settings size={16} aria-hidden="true" />
                            {t('common.settings')}
                        </NavLink>
                        <NavLink to="/docs" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <HelpCircle size={16} aria-hidden="true" />
                            {t('navigation.docs')}
                        </NavLink>
                        {isAdmin && (
                            <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <Shield size={16} aria-hidden="true" />
                                {t('admin.title')}
                            </NavLink>
                        )}
                        <NavLink to="/privacy" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Shield size={16} aria-hidden="true" />
                            Privacy & AVG
                        </NavLink>
                    </div>
                </div>
            </aside>
        </>
    );
}
