import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
    /** Accessible name, e.g. "Resize the inspector". */
    label: string;
    /** Current width of the pane this handle resizes, in px. */
    value: number;
    min: number;
    max: number;
    /** Width restored by double-click or Enter (the layout's default). */
    defaultValue: number;
    /** Which side of the handle the pane sits on: 'end' = to the left, 'start' = to the right. */
    side: 'start' | 'end';
    onChange: (next: number) => void;
    testId: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Draggable seam between two builder columns. Pointer drag, arrow keys (Shift for a bigger step),
 * Home/End for the limits, Enter or double-click to reset, and `role="separator"` with the width as its value,
 * so the pane widths are reachable without a mouse.
 */
export default function ColumnResizer({ label, value, min, max, defaultValue, side, onChange, testId }: Props) {
    const { t } = useTranslation();
    const [dragging, setDragging] = useState(false);
    const origin = useRef<{ x: number; value: number } | null>(null);

    // Dragging right grows a pane on the left of the handle and shrinks one on its right.
    const delta = (dx: number) => (side === 'end' ? dx : -dx);

    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        origin.current = { x: event.clientX, value };
        setDragging(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!origin.current) return;
        onChange(clamp(origin.current.value + delta(event.clientX - origin.current.x), min, max));
    };

    const endDrag = (event?: PointerEvent<HTMLDivElement>) => {
        if (!origin.current) return;
        origin.current = null;
        setDragging(false);
        const target = event?.currentTarget;
        if (target && target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const step = event.shiftKey ? 48 : 16;
        let next: number | null = null;
        if (event.key === 'ArrowLeft') next = value - delta(step);
        else if (event.key === 'ArrowRight') next = value + delta(step);
        else if (event.key === 'Home') next = min;
        else if (event.key === 'End') next = max;
        else if (event.key === 'Enter') next = defaultValue;
        if (next === null) return;
        event.preventDefault();
        onChange(clamp(next, min, max));
    };

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={label}
            aria-valuenow={Math.round(value)}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuetext={`${Math.round(value)} px`}
            title={t('tests.resize_hint')}
            tabIndex={0}
            data-testid={testId}
            className={`column-resizer${dragging ? ' is-dragging' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onDoubleClick={() => onChange(defaultValue)}
            onKeyDown={handleKeyDown}
        >
            <span aria-hidden="true" className="column-resizer-grip" />
        </div>
    );
}
