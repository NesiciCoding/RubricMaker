import React, { ReactNode, useEffect, useState } from 'react';
import { Moon, Sun, Menu, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { useMobileMenu } from '../../context/MobileMenuContext';
import NotificationBell from './NotificationBell';
import GlobalSearch from '../Search/GlobalSearch';

interface TopbarProps {
    title: string;
    actions?: ReactNode;
}

function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

export default function Topbar({ title, actions }: TopbarProps) {
    const { settings, updateSettings } = useApp();
    const { t } = useTranslation();
    const { open: openMobileMenu } = useMobileMenu();
    const [searchOpen, setSearchOpen] = useState(false);

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !isTypingTarget(e.target)) {
                e.preventDefault();
                setSearchOpen(true);
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <header className="topbar">
            <button
                className="btn btn-ghost btn-icon topbar-menu-btn"
                onClick={openMobileMenu}
                aria-label="Open navigation menu"
            >
                <Menu size={20} aria-hidden="true" />
            </button>
            <span className="topbar-title">{title}</span>
            <div className="topbar-actions">
                {actions}
                <button
                    className="btn btn-ghost btn-icon"
                    onClick={() => setSearchOpen(true)}
                    title={t('search.open_search')}
                    aria-label={t('search.open_search')}
                >
                    <Search size={18} />
                </button>
                <NotificationBell />
                <button
                    className="btn btn-ghost btn-icon"
                    onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
                    title={t('common.toggle_theme')}
                >
                    {settings.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>
            </div>
            {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
        </header>
    );
}
