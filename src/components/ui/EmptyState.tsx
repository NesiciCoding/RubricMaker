import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: {
        label: string;
        onClick: () => void;
    };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '3rem 1.5rem',
                gap: '0.75rem',
                textAlign: 'center',
                color: 'var(--text-dim)',
            }}
        >
            <Icon size={40} strokeWidth={1.5} aria-hidden="true" />
            <p style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-muted)', margin: 0 }}>{title}</p>
            {description && (
                <p style={{ fontSize: '0.875rem', color: 'var(--text-dim)', maxWidth: '340px', margin: 0 }}>
                    {description}
                </p>
            )}
            {action && (
                <button className="btn btn-primary" style={{ marginTop: '0.5rem' }} onClick={action.onClick}>
                    {action.label}
                </button>
            )}
        </div>
    );
}
