import { describe, it, expect, vi } from 'vitest';
import type { EmojiItem } from '@tiptap/extension-emoji';
import { createEmojiExtension } from './emojiExtension';

const EMOJIS: EmojiItem[] = [
    { name: 'grinning', shortcodes: ['grin'], tags: ['face', 'smile'] } as EmojiItem,
    { name: 'heart', shortcodes: ['heart'], tags: ['love'] } as EmojiItem,
];

function fakeEditor(emojis: unknown) {
    return { storage: { emoji: { emojis } } };
}

type ItemsFn = (args: { query: string; editor: unknown }) => EmojiItem[];

function itemsFn(): ItemsFn {
    const ext = createEmojiExtension();
    const suggestion = (ext.options as unknown as { suggestion: { items: ItemsFn } }).suggestion;
    return suggestion.items;
}

type RenderView = {
    onStart: (props: { editor: unknown; clientRect: DOMRect | null; mount?: (el: HTMLElement) => () => void }) => void;
    onUpdate: (props: unknown) => void;
    onKeyDown: (props: { event: { key: string } }) => boolean;
    onExit: () => void;
};

function renderView(): RenderView {
    const ext = createEmojiExtension();
    const suggestion = (ext.options as unknown as { suggestion: { render: () => RenderView } }).suggestion;
    return suggestion.render();
}

describe('emojiExtension coverage', () => {
    it('returns all emojis up to the cap when there is no query', () => {
        const items = itemsFn();
        expect(items({ query: '', editor: fakeEditor(EMOJIS) })).toHaveLength(2);
        // Falls back to an empty list when the storage lacks emojis.
        expect(items({ query: '', editor: fakeEditor(undefined) })).toEqual([]);
        const many = Array.from({ length: 30 }, (_, i) => ({ name: `e${i}`, shortcodes: [], tags: [] })) as EmojiItem[];
        expect(items({ query: '', editor: fakeEditor(many) })).toHaveLength(18);
    });

    it('filters by name, shortcodes and tags case-insensitively', () => {
        const items = itemsFn();
        expect(items({ query: 'GRIN', editor: fakeEditor(EMOJIS) }).map((e) => e.name)).toEqual(['grinning']);
        expect(items({ query: 'heart', editor: fakeEditor(EMOJIS) }).map((e) => e.name)).toEqual(['heart']);
        expect(items({ query: 'smile', editor: fakeEditor(EMOJIS) }).map((e) => e.name)).toEqual(['grinning']);
        expect(items({ query: 'nomatch', editor: fakeEditor(EMOJIS) })).toEqual([]);
    });

    it('starts the render without a client rect and exits cleanly', () => {
        const view = renderView();
        view.onStart({ editor: fakeEditor(EMOJIS), clientRect: null });
        view.onUpdate({ items: EMOJIS });
        view.onExit();
    });

    it('mounts the suggestion popup, closes on Escape and handles other keys', () => {
        const unmount = vi.fn();
        const view = renderView();
        view.onStart({
            editor: fakeEditor(EMOJIS),
            clientRect: { top: 0 } as DOMRect,
            mount: (el: HTMLElement) => {
                expect(el).toBeTruthy();
                return unmount;
            },
        });
        expect(view.onKeyDown({ event: { key: 'Escape' } })).toBe(true);
        expect(unmount).toHaveBeenCalled();
        view.onExit();
    });

    it('falls through to the list ref for non-Escape keys', () => {
        const view = renderView();
        view.onStart({
            editor: fakeEditor(EMOJIS),
            clientRect: { top: 0 } as DOMRect,
            mount: () => () => {},
        });
        const handled = view.onKeyDown({ event: { key: 'ArrowDown' } });
        expect(typeof handled).toBe('boolean');
        view.onExit();
    });
});
