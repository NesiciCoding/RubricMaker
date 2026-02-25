import React, { ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';

interface TopbarProps {
    title: string;
    actions?: ReactNode;
}

export default function Topbar({ title, actions }: TopbarProps) {
    const { settings, updateSettings } = useApp();
    const { t } = useTranslation();

    return (
        <header className="topbar">
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
