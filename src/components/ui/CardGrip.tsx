import React from 'react';
import { GripVertical } from 'lucide-react';

export interface CardGripProps extends React.HTMLAttributes<HTMLSpanElement> {
    /**
     * Accessible name, e.g. t('rubricList.drag_to_reorder').
     *
     * Omit it where the grip is not a control — editing the same question in a modal has no
     * `dragHandleProps`, so the span has no role, and a name on a role-less element is invalid
     * (#697). Render the text as a `sr-only` child in that case instead.
     */
    label?: string;
    /** Glyph size in px: 15 on cards, 13 where rows are tighter. */
    size?: number;
}

/**
 * The grab handle that starts a card drag.
 *
 * Spread @hello-pangea/dnd's `dragHandleProps` onto it — the role, tabIndex, keyboard
 * handlers and `data-rfd-*` attributes all come from there; this component only owns the look.
 *
 * The padding (cancelled by the negative margin, so the glyph does not move) grows the hit
 * area from a 15px glyph to a 25px target, and `touchAction: 'none'` keeps a touch drag from
 * scrolling the list instead of picking the card up.
 */
const CardGrip = React.forwardRef<HTMLSpanElement, CardGripProps>(function CardGrip(
    { label, size = 15, style, children, ...rest },
    ref
) {
    // Only set the attribute when there is a name: `aria-label={undefined}` is dropped by React,
    // but a `label=""` caller would leave an empty name on the element.
    const named = label ? { 'aria-label': label } : {};
    return (
        <span
            ref={ref}
            {...rest}
            {...named}
            style={{
                cursor: 'grab',
                color: 'var(--text-dim)',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
                padding: 5,
                margin: '-1px 0 0 -5px',
                touchAction: 'none',
                ...style,
            }}
        >
            {children ?? <GripVertical size={size} />}
        </span>
    );
});

export default CardGrip;
