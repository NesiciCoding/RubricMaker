import React, { ReactNode } from 'react';
import { Moon, Sun, Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { useMobileMenu } from '../../context/MobileMenuContext';

interface TopbarProps {
    title: string;
    actions?: ReactNode;
}

export default function Topbar({ title, actions }: TopbarProps) {
    const { settings, updateSettings } = useApp();
    const { t } = useTranslation();
    const { open: openMobileMenu } = useMobileMenu();

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
                    onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
                    title={t('common.toggle_theme')}
                >
                    {settings.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>
            </div>
        </header>
    );
}
