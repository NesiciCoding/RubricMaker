import React from 'react';

/** Width a list tile aims for. Fixed so every row of a list reads as one grid. */
export const CARD_TILE_WIDTH = 400;

export interface CardTileProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Pixel basis for this tile. Folder tiles are deliberately narrower. */
    width?: number;
    /** Tint the border on hover, for tiles that open something when clicked. */
    hoverable?: boolean;
}

/**
 * One tile in a CardGrid.
 *
 * The width policy lives here, once:
 * - a **fixed basis with no grow**, because a growing basis made the last, half-empty row's
 *   cards wider than the full rows above them;
 * - **`minWidth: 0`**, because a flex item's automatic minimum size is its min-content width —
 *   a nowrap (`.truncate`) description used to override the basis and stretch its card to the
 *   width of the whole sentence, 1364px wide and off the page.
 *
 * `style` is merged last, so a caller can spread dnd's `draggableProps` (whose `style` carries
 * the lift transforms) straight onto the tile and dnd still wins.
 */
const CardTile = React.forwardRef<HTMLDivElement, CardTileProps>(function CardTile(
    { width = CARD_TILE_WIDTH, hoverable = false, className = 'card', style, onMouseEnter, onMouseLeave, ...rest },
    ref
) {
    const [hovered, setHovered] = React.useState(false);
    return (
        <div
            ref={ref}
            {...rest}
            className={className}
            style={{
                transition: 'border-color var(--transition)',
                flex: `0 1 ${width}px`,
                minWidth: 0,
                maxWidth: '100%',
                ...(hoverable ? { borderColor: hovered ? 'var(--accent)' : 'var(--border)' } : null),
                ...style,
            }}
            onMouseEnter={(event) => {
                setHovered(true);
                onMouseEnter?.(event);
            }}
            onMouseLeave={(event) => {
                setHovered(false);
                onMouseLeave?.(event);
            }}
        />
    );
});

export default CardTile;
