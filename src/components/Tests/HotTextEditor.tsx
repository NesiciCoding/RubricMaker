import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor, EditorContent } from '@tiptap/react';
import { Plus } from 'lucide-react';
import { HotTextFragment, passageToHotTextContent, hotTextContentToPassage } from '../Editor/HotTextFragmentExtension';
import { FLAT_PILL_STARTER_KIT, FlatPillEditorFrame } from '../Editor/flatPillEditor';

interface Props {
    passage: string;
    correctIndices: number[];
    onChange: (passage: string, correctIndices: number[]) => void;
    insertFragmentLabel: string;
}

/**
 * Minimal rich editor for hot-text passages: plain text plus clickable fragment pills that
 * mark/edit [[word]] syntax without hand-typing it or wrapping raw textarea selections. Mirrors
 * ClozeGapEditor's structure and pill/popover pattern (see HotTextFragmentExtension.tsx).
 */
export default function HotTextEditor({ passage, correctIndices, onChange, insertFragmentLabel }: Props) {
    const { t } = useTranslation();
    const extensions = useMemo(
        () => [
            FLAT_PILL_STARTER_KIT,
            HotTextFragment.configure({
                textLabel: t('tests.hot_text_fragment_text_label'),
                correctLabel: t('tests.hot_text_fragment_correct_label'),
                saveLabel: t('tests.cloze_gap_save'),
                cancelLabel: t('tests.cloze_gap_cancel'),
                pillLabel: t('tests.hot_text_fragment_pill_label'),
            }),
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );
    const editor = useEditor({
        extensions,
        content: passageToHotTextContent(passage, correctIndices),
        onUpdate: ({ editor }) => {
            const next = hotTextContentToPassage(editor);
            onChange(next.passage, next.correctIndices);
        },
        editorProps: { attributes: { class: 'hot-text-editor-content' } },
    });

    // Keep the editor in sync when the passage/correctIndices change from outside (e.g. switching
    // question type, or loading a different question).
    useEffect(() => {
        /* v8 ignore next -- useEditor initializes synchronously in this environment */
        if (!editor) return;
        const current = hotTextContentToPassage(editor);
        if (current.passage === passage && current.correctIndices.join(',') === correctIndices.join(',')) return;
        editor.commands.setContent(passageToHotTextContent(passage, correctIndices));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor, passage, correctIndices.join(',')]);

    /* v8 ignore next -- useEditor initializes synchronously in this environment */
    if (!editor) return null;

    return (
        <FlatPillEditorFrame
            toolbar={
                <>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        // Prevents the contenteditable from blurring on click, which would otherwise
                        // lose the selection and make the fragment wrap the wrong text.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor.chain().focus().markSelectionAsFragment().run()}
                    >
                        <Plus size={14} /> {insertFragmentLabel}
                    </button>
                </>
            }
            css={`
                .hot-text-editor-content {
                    outline: none;
                    min-height: 1.5em;
                    line-height: 1.6;
                }
                .hot-text-fragment-pill {
                    display: inline-flex;
                    align-items: center;
                    padding: 1px 8px;
                    margin: 0 1px;
                    border-radius: 999px;
                    background: color-mix(in srgb, var(--text-muted) 16%, transparent);
                    color: var(--text);
                    font-weight: 600;
                    cursor: pointer;
                    user-select: none;
                }
                .hot-text-fragment-pill.correct {
                    background: color-mix(in srgb, var(--green) 18%, transparent);
                    color: var(--green);
                }
                .hot-text-popover-label {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                }
                .hot-text-popover-input {
                    box-sizing: border-box;
                    width: 100%;
                    padding: 6px 8px;
                    font-size: 0.85rem;
                    color: var(--text);
                    background: var(--bg);
                    border: 1px solid var(--border);
                    border-radius: 6px;
                }
                .hot-text-popover-checkbox-row {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.8rem;
                    color: var(--text);
                    cursor: pointer;
                }
                .hot-text-popover-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 6px;
                }
                .hot-text-popover-actions button {
                    padding: 4px 10px;
                    font-size: 0.8rem;
                    color: var(--text);
                    background: var(--bg-panel);
                    border: 1px solid var(--border);
                    border-radius: 6px;
                    cursor: pointer;
                }
                .hot-text-popover-save {
                    background: var(--accent) !important;
                    border-color: var(--accent) !important;
                    color: #fff !important;
                }
            `}
        >
            <EditorContent editor={editor} />
        </FlatPillEditorFrame>
    );
}
