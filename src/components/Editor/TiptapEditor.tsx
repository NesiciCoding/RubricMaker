import React, { useImperativeHandle, forwardRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface TiptapEditorHandle {
    insertContent: (text: string) => void;
}

interface TiptapEditorProps {
    content: string;
    onChange: (content: string) => void;
    placeholder?: string;
}

const TiptapEditor = forwardRef<TiptapEditorHandle, TiptapEditorProps>(function TiptapEditor(
    { content, onChange, placeholder },
    ref
) {
    const { t } = useTranslation();
    const editor = useEditor({
        extensions: [StarterKit],
        content: content,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: 'tiptap-editor-content',
            },
        },
    });

    useImperativeHandle(
        ref,
        () => ({
            insertContent: (text: string) => {
                if (!editor) return;
                editor.chain().focus().insertContent(text).run();
            },
        }),
        [editor]
    );

    if (!editor) {
        return null;
    }

    return (
        <div className="tiptap-editor">
            <div className="tiptap-toolbar">
                <button
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={`toolbar-btn ${editor.isActive('bold') ? 'active' : ''}`}
                    title={t('editor.bold')}
                    type="button"
                >
                    <Bold size={14} />
                </button>
                <button
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={`toolbar-btn ${editor.isActive('italic') ? 'active' : ''}`}
                    title={t('editor.italic')}
                    type="button"
                >
                    <Italic size={14} />
                </button>
                <div className="toolbar-divider" />
                <button
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={`toolbar-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
                    title={t('editor.bullet_list')}
                    type="button"
                >
                    <List size={14} />
                </button>
                <button
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={`toolbar-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
                    title={t('editor.ordered_list')}
                    type="button"
                >
                    <ListOrdered size={14} />
                </button>
            </div>
            <EditorContent editor={editor} placeholder={placeholder} />
        </div>
    );
});

export default TiptapEditor;
