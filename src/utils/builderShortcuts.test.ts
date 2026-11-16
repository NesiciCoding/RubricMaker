import { describe, expect, it } from 'vitest';
import { BUILDER_SHORTCUTS, builderCommandFor, isTypingTarget } from './builderShortcuts';

function press(key: string, modifiers: Partial<KeyboardEvent> = {}) {
    return builderCommandFor({ key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...modifiers });
}

describe('builderCommandFor', () => {
    it('maps the navigation, create, delete and reorder keys', () => {
        expect(press('ArrowUp', { altKey: true })).toBe('prev-question');
        expect(press('ArrowDown', { altKey: true })).toBe('next-question');
        expect(press('n')).toBe('new-question');
        expect(press('N')).toBe('new-question');
        expect(press('d')).toBe('duplicate-question');
        expect(press('Delete')).toBe('remove-question');
        expect(press('ArrowUp', { altKey: true, shiftKey: true })).toBe('move-question-up');
        expect(press('ArrowDown', { altKey: true, shiftKey: true })).toBe('move-question-down');
    });

    it('maps the quick jump, the overlay and the mac equivalents', () => {
        expect(press('k', { ctrlKey: true })).toBe('quick-jump');
        expect(press('k', { metaKey: true })).toBe('quick-jump');
        expect(press('?', { shiftKey: true })).toBe('shortcuts');
    });

    it('leaves save, undo, redo and modified combinations to the page', () => {
        expect(press('s', { ctrlKey: true })).toBeNull();
        expect(press('z', { ctrlKey: true })).toBeNull();
        expect(press('z', { ctrlKey: true, shiftKey: true })).toBeNull();
        expect(press('k', { ctrlKey: true, altKey: true })).toBeNull();
        expect(press('ArrowDown', { ctrlKey: true })).toBeNull();
        expect(press('Escape')).toBeNull();
        expect(press('x')).toBeNull();
    });

    it('describes every command it can produce in the shortcut list', () => {
        const ids = new Set(BUILDER_SHORTCUTS.map((shortcut) => shortcut.id));
        for (const command of ['next-question', 'quick-jump', 'shortcuts', 'remove-question'] as const) {
            expect(ids.has(command)).toBe(true);
        }
        for (const shortcut of BUILDER_SHORTCUTS) {
            expect(shortcut.labelKey.startsWith('tests.')).toBe(true);
            expect(shortcut.keys.length).toBeGreaterThan(0);
        }
    });
});

describe('isTypingTarget', () => {
    it('refuses fields and rich-text editors', () => {
        const input = document.createElement('input');
        const textarea = document.createElement('textarea');
        const select = document.createElement('select');
        const editable = document.createElement('div');
        editable.setAttribute('contenteditable', 'true');
        expect(isTypingTarget(input)).toBe(true);
        expect(isTypingTarget(textarea)).toBe(true);
        expect(isTypingTarget(select)).toBe(true);
        expect(isTypingTarget(editable)).toBe(true);
    });

    it('allows the page itself', () => {
        expect(isTypingTarget(document.createElement('div'))).toBe(false);
        expect(isTypingTarget(window)).toBe(false);
        expect(isTypingTarget(null)).toBe(false);
    });
});
