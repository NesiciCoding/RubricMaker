import type { ReactNode } from 'react';
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { Eye, EyeOff } from 'lucide-react';
import CardGrip from '../ui/CardGrip';

interface Props {
    title: string;
    hidden: boolean;
    dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
    onToggleHidden: () => void;
    hideLabel: string;
    showLabel: string;
    dragLabel: string;
    children: ReactNode;
}

/** Wraps one Dashboard widget while the teacher is customizing the layout: a grip to reorder it and an eye to hide/show it. Only rendered in customize mode — otherwise a widget is just its own content. */
export default function DashboardWidgetFrame({
    title,
    hidden,
    dragHandleProps,
    onToggleHidden,
    hideLabel,
    showLabel,
    dragLabel,
    children,
}: Props) {
    return (
        <div
            style={{
                border: '1px dashed var(--border)',
                borderRadius: 12,
                padding: 10,
                background: hidden ? 'var(--bg-elevated)' : undefined,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: hidden ? 0 : 8 }}>
                <CardGrip label={dragLabel} {...dragHandleProps} />
                <span
                    style={{
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        flex: 1,
                        opacity: hidden ? 0.6 : 1,
                    }}
                >
                    {title}
                </span>
                <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    aria-label={hidden ? showLabel : hideLabel}
                    title={hidden ? showLabel : hideLabel}
                    onClick={onToggleHidden}
                >
                    {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
            </div>
            {!hidden && <div style={{ pointerEvents: 'none' }}>{children}</div>}
        </div>
    );
}
