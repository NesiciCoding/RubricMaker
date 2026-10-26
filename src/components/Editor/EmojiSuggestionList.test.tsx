import React, { createRef } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import EmojiSuggestionList, { type EmojiSuggestionListRef } from './EmojiSuggestionList';
import type { EmojiItem } from '@tiptap/extension-emoji';
import type { SuggestionKeyDownProps } from '@tiptap/suggestion';

const items: EmojiItem[] = [
    { name: 'smile', emoji: '😀', shortcodes: [':smile:'], tags: ['happy'] },
    { name: 'heart', emoji: '❤️', shortcodes: [':heart:'], tags: ['love'] },
];

async function keyDown(ref: React.RefObject<EmojiSuggestionListRef | null>, key: string): Promise<boolean> {
    const event = new KeyboardEvent('keydown', { key });
    // The handle is invoked imperatively (not via a DOM event), so wrap it in act()
    // to flush the selection state update before asserting on styles.
    return act(() => ref.current!.onKeyDown({ event } as unknown as SuggestionKeyDownProps));
}

// jsdom resolves var() in computed styles, so toHaveStyle can't match the unresolved
// custom property — assert on the inline style instead.
function expectSelected(title: string) {
    expect(screen.getByTitle(title).style.background).toBe('var(--accent-soft)');
}

describe('EmojiSuggestionList', () => {
    it('renders a button per item with its shortcode as the title', () => {
        const command = vi.fn();
        render(<EmojiSuggestionList items={items} command={command} />);
        const smile = screen.getByTitle(':smile:');
        const heart = screen.getByTitle(':heart:');
        expect(smile).toHaveTextContent('😀');
        expect(heart).toHaveTextContent('❤️');
        expect(screen.getAllByRole('button')).toHaveLength(2);
    });

    it('selects an item by clicking its button', () => {
        const command = vi.fn();
        render(<EmojiSuggestionList items={items} command={command} />);
        fireEvent.click(screen.getByTitle(':heart:'));
        expect(command).toHaveBeenCalledWith({ name: 'heart' });
    });

    it('navigates with arrow keys and confirms with Enter via the imperative handle', async () => {
        const command = vi.fn();
        const ref = createRef<EmojiSuggestionListRef>();
        render(<EmojiSuggestionList ref={ref} items={items} command={command} />);

        // ArrowDown moves the selection from 0 to 1
        await expect(keyDown(ref, 'ArrowDown')).resolves.toBe(true);
        expectSelected(':heart:');

        // Enter confirms the selected (second) item
        await expect(keyDown(ref, 'Enter')).resolves.toBe(true);
        expect(command).toHaveBeenCalledWith({ name: 'heart' });
    });

    it('wraps the selection around at both ends', async () => {
        const command = vi.fn();
        const ref = createRef<EmojiSuggestionListRef>();
        render(<EmojiSuggestionList ref={ref} items={items} command={command} />);

        // ArrowUp from index 0 wraps to the last item
        await expect(keyDown(ref, 'ArrowUp')).resolves.toBe(true);
        expectSelected(':heart:');

        // ArrowDown from the last item wraps back to 0
        await expect(keyDown(ref, 'ArrowDown')).resolves.toBe(true);
        expectSelected(':smile:');
    });

    it('resets the selection to the first item when the item list changes', async () => {
        const command = vi.fn();
        const ref = createRef<EmojiSuggestionListRef>();
        const { rerender } = render(<EmojiSuggestionList ref={ref} items={items} command={command} />);
        await keyDown(ref, 'ArrowDown');
        expectSelected(':heart:');

        rerender(
            <EmojiSuggestionList
                ref={ref}
                items={[
                    { name: 'smile', emoji: '😀', shortcodes: [':smile:'], tags: [] },
                    { name: 'heart', emoji: '❤️', shortcodes: [':heart:'], tags: [] },
                    { name: 'star', emoji: '⭐', shortcodes: [':star:'], tags: [] },
                ]}
                command={command}
            />
        );
        expectSelected(':smile:');
    });

    it('renders nothing and ignores keys when there are no items', async () => {
        const command = vi.fn();
        const ref = createRef<EmojiSuggestionListRef>();
        const { container } = render(<EmojiSuggestionList ref={ref} items={[]} command={command} />);
        expect(container).toBeEmptyDOMElement();
        await expect(keyDown(ref, 'Enter')).resolves.toBe(false);
    });

    it('returns false for unhandled keys', async () => {
        const command = vi.fn();
        const ref = createRef<EmojiSuggestionListRef>();
        render(<EmojiSuggestionList ref={ref} items={items} command={command} />);
        await expect(keyDown(ref, 'Escape')).resolves.toBe(false);
    });
});
