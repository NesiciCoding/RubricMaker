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
 * The 44px minimum is the WCAG 2.5.5 target, not the 25px that 2.5.8 asks for; the 5px padding
 * and the negative margin keep the glyph where the surrounding layout expects it. `touchAction:
 * 'none'` keeps a touch drag from scrolling the list instead of picking the card up.
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
                justifyContent: 'center',
                padding: 5,
                minWidth: 44,
                minHeight: 44,
                // The box grew by 19px on each side; pulling it back by 10px leaves the 15px glyph
                // within half a pixel of where the 25px box put it.
                margin: '-1px 0 0 -10px',
                touchAction: 'none',
                ...style,
            }}
        >
            {children ?? <GripVertical size={size} />}
        </span>
    );
});

export default CardGrip;
