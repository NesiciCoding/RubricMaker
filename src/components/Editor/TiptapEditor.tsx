import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered, Type } from 'lucide-react';

interface TiptapEditorProps {
    content: string;
    onChange: (content: string) => void;
    placeholder?: string;
}

export default function TiptapEditor({ content, onChange, placeholder }: TiptapEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit,
        ],
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

    if (!editor) {
        return null;
    }

    return (
        <div className="tiptap-editor">
            <div className="tiptap-toolbar">
                <button
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={`toolbar-btn ${editor.isActive('bold') ? 'active' : ''}`}
                    title="Bold"
                    type="button"
                >
                    <Bold size={14} />
                </button>
                <button
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={`toolbar-btn ${editor.isActive('italic') ? 'active' : ''}`}
                    title="Italic"
                    type="button"
                >
                    <Italic size={14} />
                </button>
                <div className="toolbar-divider" />
                <button
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={`toolbar-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
                    title="Bullet List"
                    type="button"
                >
                    <List size={14} />
                </button>
                <button
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={`toolbar-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
                    title="Ordered List"
                    type="button"
                >
                    <ListOrdered size={14} />
                </button>
            </div>
            <EditorContent editor={editor} placeholder={placeholder} />
        </div>
    );
}
