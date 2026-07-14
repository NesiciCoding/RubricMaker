import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Plus } from 'lucide-react';
import { ClozeGap, promptToClozeContent, clozeContentToPrompt } from '../Editor/ClozeGapExtension';

// Deliberately disables everything except doc/paragraph/text/history — the stored value must stay
// a flat {{gap|alt}}-annotated string that clozeParse.ts can parse unchanged, so no bold/tables/
// lists/headings here (unlike the full essay editor config in tiptapExtensions.ts).
const CLOZE_STARTER_KIT = StarterKit.configure({
    bold: false,
    italic: false,
    strike: false,
    code: false,
    codeBlock: false,
    blockquote: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    heading: false,
    horizontalRule: false,
    hardBreak: false,
    link: false,
    underline: false,
    dropcursor: false,
    gapcursor: false,
    trailingNode: false,
});

interface Props {
    value: string;
    onChange: (prompt: string) => void;
    allowDropdown: boolean;
    insertGapLabel: string;
    insertDropdownGapLabel: string;
}

/**
 * Minimal rich editor for cloze/cloze-dropdown prompts: plain text plus clickable gap pills that
 * insert/edit {{alt1|alt2}} syntax without hand-typing it. Deliberately restricted to
 * Document/Paragraph/Text/ClozeGap — no bold/tables/etc — since the stored value must stay a flat
 * string that clozeParse.ts can parse unchanged.
 */
export default function ClozeGapEditor({ value, onChange, allowDropdown, insertGapLabel, insertDropdownGapLabel }: Props) {
    const editor = useEditor({
        extensions: [CLOZE_STARTER_KIT, ClozeGap],
        content: promptToClozeContent(value),
        onUpdate: ({ editor }) => onChange(clozeContentToPrompt(editor)),
        editorProps: { attributes: { class: 'cloze-gap-editor-content' } },
    });

    // Keep the editor in sync when the prompt changes from outside (e.g. switching question type).
    useEffect(() => {
        if (!editor) return;
        if (clozeContentToPrompt(editor) === value) return;
        editor.commands.setContent(promptToClozeContent(value));
    }, [editor, value]);

    if (!editor) return null;

    return (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div
                style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    padding: '6px 8px',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                }}
            >
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    // Prevents the contenteditable from blurring on click, which would otherwise
                    // lose the caret position and make the gap insert at the wrong spot.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => editor.chain().focus().insertClozeGap(['answer']).run()}
                >
                    <Plus size={14} /> {insertGapLabel}
                </button>
                {allowDropdown && (
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor.chain().focus().insertClozeGap(['correct', 'wrong1', 'wrong2']).run()}
                    >
                        <Plus size={14} /> {insertDropdownGapLabel}
                    </button>
                )}
            </div>
            <div style={{ padding: '8px 10px' }}>
                <EditorContent editor={editor} />
            </div>
            <style>{`
                .cloze-gap-editor-content { outline: none; min-height: 1.5em; line-height: 1.6; }
                .cloze-gap-pill {
                    display: inline-flex;
                    align-items: center;
                    gap: 2px;
                    padding: 1px 8px;
                    margin: 0 1px;
                    border-radius: 999px;
                    background: color-mix(in srgb, var(--accent) 16%, transparent);
                    color: var(--accent);
                    font-weight: 600;
                    cursor: pointer;
                    user-select: none;
                }
                .cloze-gap-pill sup { font-size: 0.7em; opacity: 0.75; margin-left: 1px; }
            `}</style>
        </div>
    );
}
