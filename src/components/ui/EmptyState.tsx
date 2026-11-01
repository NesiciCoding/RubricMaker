import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface EmptyStateAction {
    label: string;
    onClick: () => void;
    /** Glyph inside the button, when the CTA names an object (`Plus` for "New deck"). */
    icon?: LucideIcon;
}

export interface EmptyStateProps {
    icon?: LucideIcon;
    /** Glyph size in px: 40 on a page, 28 inside a dense panel or modal. */
    iconSize?: number;
    /**
     * Heading above the message. Omit it for a lone hint (search results, a picker's
     * "no matches") where a heading would punctuate the page outline for no gain.
     */
    title?: string;
    /**
     * Heading level for `title`. 3 inside a page section; 2 on a standalone page whose own
     * heading is an h1, because a jump from h1 to h3 is an axe `heading-order` violation.
     */
    titleLevel?: 2 | 3;
    /** The sentence under the heading — the whole message when there is no title. */
    description?: string;
    /** Primary call to action; rendered last so the eye lands on it. */
    action?: EmptyStateAction;
    /** Anything else the block needs, e.g. a secondary button or a link, before the action. */
    children?: React.ReactNode;
    /** Padding overrides for tight spots (`{ padding: 32 }` in a dropdown). */
    style?: React.CSSProperties;
    className?: string;
}

/**
 * The one empty state: no items yet, no results, nothing to show.
 *
 * `.empty-state` in index.css owns the layout (centred column, 12px gap, muted colour), so a
 * caller only decides *what* is in it. The icon, heading level and description style are fixed
 * here rather than repeated at ~60 call sites, which is how they drifted apart before (#1011).
 */
export function EmptyState({
    icon: Icon,
    iconSize = 40,
    title,
    titleLevel = 3,
    description,
    action,
    children,
    style,
    className,
}: EmptyStateProps) {
    return (
        <div className={className ? `empty-state ${className}` : 'empty-state'} style={style}>
            {Icon && <Icon size={iconSize} aria-hidden="true" />}
            {title && React.createElement(`h${titleLevel}`, null, title)}
            {description && <p className="text-muted text-sm">{description}</p>}
            {children}
            {action && (
                <button className="btn btn-primary" onClick={action.onClick}>
                    {action.icon && <action.icon size={16} aria-hidden="true" />} {action.label}
                </button>
            )}
        </div>
    );
}

export default EmptyState;
