export type BuilderCommand =
    | 'next-question'
    | 'prev-question'
    | 'new-question'
    | 'duplicate-question'
    | 'remove-question'
    | 'move-question-up'
    | 'move-question-down'
    | 'quick-jump'
    | 'shortcuts';

export interface BuilderShortcut {
    id: BuilderCommand | 'save' | 'undo' | 'redo' | 'close';
    /** i18n key naming what the shortcut does. */
    labelKey: string;
    /** The keys themselves — not translated, because a keycap reads the same in every language. */
    keys: string;
}

/** The `?` overlay and the docs both read this list, so a new shortcut is described once. */
export const BUILDER_SHORTCUTS: BuilderShortcut[] = [
    { id: 'next-question', labelKey: 'tests.shortcut_next_question', keys: 'Alt+↓' },
    { id: 'prev-question', labelKey: 'tests.shortcut_prev_question', keys: 'Alt+↑' },
    { id: 'new-question', labelKey: 'tests.shortcut_new_question', keys: 'N' },
    { id: 'duplicate-question', labelKey: 'tests.shortcut_duplicate_question', keys: 'D' },
    { id: 'remove-question', labelKey: 'tests.shortcut_remove_question', keys: 'Delete' },
    { id: 'move-question-up', labelKey: 'tests.shortcut_move_up', keys: 'Alt+Shift+↑' },
    { id: 'move-question-down', labelKey: 'tests.shortcut_move_down', keys: 'Alt+Shift+↓' },
    { id: 'quick-jump', labelKey: 'tests.shortcut_quick_jump', keys: 'Ctrl+K' },
    { id: 'save', labelKey: 'tests.shortcut_save', keys: 'Ctrl+S' },
    { id: 'undo', labelKey: 'tests.shortcut_undo', keys: 'Ctrl+Z' },
    { id: 'redo', labelKey: 'tests.shortcut_redo', keys: 'Ctrl+Shift+Z' },
    { id: 'shortcuts', labelKey: 'tests.shortcut_shortcuts', keys: '?' },
    { id: 'close', labelKey: 'tests.shortcut_close', keys: 'Esc' },
];

type KeyEventLike = Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

/** Typing must never trigger a builder shortcut — the field's own behaviour wins. */
export function isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element?.tagName) return false;
    return Boolean(
        element.tagName === 'INPUT' ||
        element.tagName === 'TEXTAREA' ||
        element.tagName === 'SELECT' ||
        element.isContentEditable ||
        element.closest?.('[contenteditable="true"]')
    );
}

/**
 * Maps a key press to a builder command. Save, undo/redo and Escape are handled by the page itself:
 * they must also work while a field has focus, which is exactly what this mapping refuses to do.
 */
export function builderCommandFor(event: KeyEventLike): BuilderCommand | null {
    const key = event.key;
    const mod = event.ctrlKey || event.metaKey;
    if (mod) {
        if (!event.altKey && !event.shiftKey && key.toLowerCase() === 'k') return 'quick-jump';
        return null;
    }
    if (event.altKey && event.shiftKey) {
        if (key === 'ArrowUp') return 'move-question-up';
        if (key === 'ArrowDown') return 'move-question-down';
        return null;
    }
    if (event.altKey) {
        if (key === 'ArrowUp') return 'prev-question';
        if (key === 'ArrowDown') return 'next-question';
        return null;
    }
    if (key === '?') return 'shortcuts';
    if (key === 'Delete') return 'remove-question';
    if (key.toLowerCase() === 'n') return 'new-question';
    if (key.toLowerCase() === 'd') return 'duplicate-question';
    return null;
}
