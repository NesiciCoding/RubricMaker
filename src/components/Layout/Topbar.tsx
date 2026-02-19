import React, { ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface TopbarProps {
    title: string;
    actions?: ReactNode;
}

export default function Topbar({ title, actions }: TopbarProps) {
    const { settings, updateSettings } = useApp();

    return (
        <header className="topbar">
            <span className="topbar-title">{title}</span>
            <div className="topbar-actions">
                {actions}
                <button
                    className="btn btn-ghost btn-icon"
                    onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
                    title="Toggle theme"
                >
                    {settings.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>
            </div>
        </header>
    );
}
