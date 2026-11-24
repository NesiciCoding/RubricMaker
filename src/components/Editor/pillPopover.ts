// Only one pill popover (cloze gap or hot-text fragment) is ever open at a time — opening a new
// one closes whichever is already open, across both extensions.
let activeClose: (() => void) | null = null;

/** Gap between the pill and the popover, and the minimum distance from the viewport edge. */
const GAP = 4;
const EDGE = 8;

/**
 * Opens a small floating popover anchored below `pill`. `build` receives the popover element and
 * a `close` callback to wire into Save/Cancel/Escape/outside-click handlers; the caller is
 * responsible for populating the popover's content. Returns the `close` callback so the caller's
 * node view can close it from `destroy()`.
 *
 * The popover is appended to <body>, not next to the pill: it is `position: fixed` with viewport
 * coordinates, and any ancestor with a transform would otherwise become its containing block and
 * shift it (#1017). Because it now floats free of the editor's scroll box, it re-anchors to the
 * pill on every scroll and resize instead of being positioned once (#1022), and it closes if the
 * pill goes away (ProseMirror replacing the node without calling `destroy()`).
 */
export function openPillPopover(
    pill: HTMLElement,
    className: string,
    build: (popover: HTMLDivElement, close: () => void) => void,
    label?: string
): () => void {
    activeClose?.();

    const popover = document.createElement('div');
    popover.setAttribute('role', 'dialog');
    if (label) popover.setAttribute('aria-label', label);
    // Remembered rather than read at close: Save refocuses the editor before it closes the popover.
    let focusWasInside = false;
    popover.addEventListener('focusin', () => {
        focusWasInside = true;
    });
    // On the panel rather than one input: Tab can move focus to a checkbox or button inside it.
    popover.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        close();
    });
    // `.pill-popover` in index.css owns the panel itself; the caller's class styles its contents.
    popover.className = `pill-popover ${className}`;

    function onOutsideClick(e: MouseEvent) {
        if (!popover.contains(e.target as globalThis.Node) && e.target !== pill) close();
    }

    /**
     * Places the panel under the pill, nudged left so it cannot hang off the right edge. Reading
     * the rect after `scroll` is cheap — the browser has already done layout by then — so this
     * runs synchronously rather than behind a frame callback that would let the panel lag.
     */
    function position() {
        const rect = pill.getBoundingClientRect();
        popover.style.top = `${rect.bottom + GAP}px`;
        const maxLeft = window.innerWidth - popover.offsetWidth - EDGE;
        popover.style.left = `${Math.max(EDGE, Math.min(rect.left, maxLeft))}px`;
    }

    function onScrollOrResize() {
        // The pill is gone (the node was replaced): the popover would otherwise float over
        // unrelated content until something else closed it.
        if (!pill.isConnected) {
            close();
            return;
        }
        position();
    }

    function close() {
        document.removeEventListener('mousedown', onOutsideClick, true);
        document.removeEventListener('scroll', onScrollOrResize, true);
        window.removeEventListener('resize', onScrollOrResize);
        popover.remove();
        if (activeClose === close) activeClose = null;
        // A keyboard user opened this from the pill, so they land back on it instead of losing their place.
        if (focusWasInside && pill.isConnected) {
            pill.focus();
            // Save runs editor.chain().focus() first, and tiptap applies that focus on the next frame —
            // after this point — so take focus back unless the user has since moved somewhere else.
            requestAnimationFrame(() => {
                const active = document.activeElement;
                const editorRoot = pill.closest('.ProseMirror');
                const stolenByEditor = active === document.body || (!!editorRoot && editorRoot.contains(active));
                if (pill.isConnected && active !== pill && stolenByEditor) pill.focus();
            });
        }
    }

    // Attach before build() runs — build() focuses/selects an input it creates, which only works
    // once that input is connected to the document.
    document.body.appendChild(popover);
    build(popover, close);
    position();

    activeClose = close;
    document.addEventListener('mousedown', onOutsideClick, true);
    // Capture phase: the scroll that matters comes from the editor's own scrollable box, and
    // scroll events do not bubble.
    document.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    return close;
}

/**
 * Makes a pill (a non-editable atom inside the editor) operable from the keyboard: focusable, announced as a
 * button that opens a dialog, and activated by Enter or Space like a click. Returns a function that updates the
 * accessible name when the pill's content changes.
 */
export function makePillAccessible(pill: HTMLElement): (label: string) => void {
    pill.setAttribute('role', 'button');
    pill.setAttribute('aria-haspopup', 'dialog');
    pill.tabIndex = 0;
    pill.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        // Without this ProseMirror would treat Enter as "split the paragraph" instead of "open the pill".
        e.preventDefault();
        e.stopPropagation();
        pill.click();
    });
    return (label) => pill.setAttribute('aria-label', label);
}
