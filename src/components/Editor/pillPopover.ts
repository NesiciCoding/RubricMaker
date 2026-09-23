// Only one pill popover (cloze gap or hot-text fragment) is ever open at a time — opening a new
// one closes whichever is already open, across both extensions.
let activeClose: (() => void) | null = null;

/**
 * Opens a small floating popover anchored below `pill`. `build` receives the popover element and
 * a `close` callback to wire into Save/Cancel/Escape/outside-click handlers; the caller is
 * responsible for populating the popover's content. Returns the `close` callback so the caller's
 * node view can close it from `destroy()`.
 */
export function openPillPopover(
    pill: HTMLElement,
    className: string,
    build: (popover: HTMLDivElement, close: () => void) => void
): () => void {
    activeClose?.();

    const popover = document.createElement('div');
    popover.className = className;

    function onOutsideClick(e: MouseEvent) {
        if (!popover.contains(e.target as globalThis.Node) && e.target !== pill) close();
    }

    function close() {
        document.removeEventListener('mousedown', onOutsideClick, true);
        popover.remove();
        if (activeClose === close) activeClose = null;
    }

    // Attach before build() runs — build() focuses/selects an input it creates, which only works
    // once that input is connected to the document.
    document.body.appendChild(popover);
    build(popover, close);

    const rect = pill.getBoundingClientRect();
    popover.style.position = 'fixed';
    popover.style.top = `${rect.bottom + 4}px`;
    popover.style.left = `${rect.left}px`;

    activeClose = close;
    document.addEventListener('mousedown', onOutsideClick, true);

    return close;
}
