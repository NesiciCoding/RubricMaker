import { Emoji, EmojiSuggestionPluginKey, type EmojiItem } from '@tiptap/extension-emoji';
import { ReactRenderer } from '@tiptap/react';
import EmojiSuggestionList, { type EmojiSuggestionListRef } from './EmojiSuggestionList';

const MAX_SUGGESTIONS = 18;

/** Emoji with `:shortcode:` autocompletion (roadmap Phase 26.4). Typing a shortcode, an emoticon, or pasting a literal emoji all normalize to the same node — see @tiptap/extension-emoji's input/paste rules. */
export function createEmojiExtension() {
    return Emoji.configure({
        enableEmoticons: true,
        suggestion: {
            pluginKey: EmojiSuggestionPluginKey,
            items: ({ query, editor }) => {
                const emojis = (editor.storage.emoji?.emojis ?? []) as EmojiItem[];
                if (!query) return emojis.slice(0, MAX_SUGGESTIONS);
                const q = query.toLowerCase();
                return emojis
                    .filter(
                        (item) =>
                            item.name.includes(q) ||
                            item.shortcodes.some((s) => s.includes(q)) ||
                            item.tags.some((t) => t.includes(q))
                    )
                    .slice(0, MAX_SUGGESTIONS);
            },
            render: () => {
                let component: ReactRenderer<EmojiSuggestionListRef>;
                let unmount: (() => void) | undefined;

                return {
                    onStart: (props) => {
                        component = new ReactRenderer(EmojiSuggestionList, { props, editor: props.editor });
                        if (!props.clientRect) return;
                        unmount = props.mount(component.element);
                    },
                    onUpdate(props) {
                        component.updateProps(props);
                    },
                    onKeyDown(props) {
                        if (props.event.key === 'Escape') {
                            unmount?.();
                            component.destroy();
                            return true;
                        }
                        return component.ref?.onKeyDown(props) ?? false;
                    },
                    onExit() {
                        unmount?.();
                        component.destroy();
                    },
                };
            },
        },
    });
}
