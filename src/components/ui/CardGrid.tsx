import React from 'react';

export interface CardGridProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Space between tiles, in px. Card lists use 16; the folder row is tighter. */
    gap?: number;
}

/**
 * The wrapping flex row every card list shares.
 *
 * Cards are laid out with `flex-wrap` rather than CSS grid because @hello-pangea/dnd needs
 * the draggable elements to stay in normal flow while they are lifted; a grid area snaps them
 * back and the drag preview jumps. Having one component own that decision means a list cannot
 * quietly reintroduce a different layout.
 *
 * Forwards its ref and all div props, so the dnd `Droppable` props and ref can be spread on it.
 */
const CardGrid = React.forwardRef<HTMLDivElement, CardGridProps>(function CardGrid(
    { gap = 16, style, children, ...rest },
    ref
) {
    return (
        <div ref={ref} {...rest} style={{ display: 'flex', flexWrap: 'wrap', gap, ...style }}>
            {children}
        </div>
    );
});

export default CardGrid;
