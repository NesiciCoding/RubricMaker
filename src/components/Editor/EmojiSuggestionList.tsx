import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { EmojiItem } from '@tiptap/extension-emoji';
import type { SuggestionKeyDownProps } from '@tiptap/suggestion';

interface EmojiSuggestionListProps {
    items: EmojiItem[];
    command: (item: { name: string }) => void;
}

export interface EmojiSuggestionListRef {
    onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const EmojiSuggestionList = forwardRef<EmojiSuggestionListRef, EmojiSuggestionListProps>(({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [items]);

    const select = (index: number) => {
        const item = items[index];
        if (item) command({ name: item.name });
    };

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }) => {
            if (items.length === 0) return false;
            if (event.key === 'ArrowUp') {
                setSelectedIndex((i) => (i + items.length - 1) % items.length);
                return true;
            }
            if (event.key === 'ArrowDown') {
                setSelectedIndex((i) => (i + 1) % items.length);
                return true;
            }
            if (event.key === 'Enter') {
                select(selectedIndex);
                return true;
            }
            return false;
        },
    }));

    if (items.length === 0) return null;

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: 2,
                padding: 6,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                boxShadow: 'var(--shadow)',
                maxWidth: 220,
            }}
        >
            {items.map((item, index) => (
                <button
                    key={item.name}
                    type="button"
                    title={`:${item.name}:`}
                    onClick={() => select(index)}
                    style={{
                        fontSize: '1.1rem',
                        lineHeight: 1,
                        padding: 6,
                        borderRadius: 6,
                        border: 'none',
                        cursor: 'pointer',
                        background: index === selectedIndex ? 'var(--accent-soft)' : 'transparent',
                    }}
                >
                    {item.emoji}
                </button>
            ))}
        </div>
    );
});

EmojiSuggestionList.displayName = 'EmojiSuggestionList';

export default EmojiSuggestionList;
