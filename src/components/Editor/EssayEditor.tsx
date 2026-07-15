import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor, EditorContent } from '@tiptap/react';
import { getTipTapExtensions, TIPTAP_CONTENT_STYLES } from './tiptapExtensions';
import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Strikethrough,
    Superscript as SuperscriptIcon,
    Subscript as SubscriptIcon,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    List,
    ListOrdered,
    ListChecks,
    Quote,
    Minus,
    Link2,
    Table as TableIcon,
    Highlighter,
    Undo2,
    Redo2,
    RemoveFormatting,
    Unlink,
    FileText,
} from 'lucide-react';

// ── Constants ───────────────────────────────────────────────────────────────

const FONT_FAMILIES = [
    { label: 'Inter (default)', value: '' },
    { label: 'Arial', value: 'Arial, sans-serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Times New Roman', value: "'Times New Roman', serif" },
    { label: 'Courier New', value: "'Courier New', monospace" },
];

const FONT_SIZES = ['', '8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '72'];

const LINE_HEIGHTS = [
    { label: 'Line height', value: '' },
    { label: '1.0', value: '1.0' },
    { label: '1.15', value: '1.15' },
    { label: '1.25', value: '1.25' },
    { label: '1.5', value: '1.5' },
    { label: '1.75', value: '1.75' },
    { label: '2.0', value: '2.0' },
    { label: '2.5', value: '2.5' },
    { label: '3.0', value: '3.0' },
];

// ── Sub-components ──────────────────────────────────────────────────────────

interface EssayEditorProps {
    content: string;
    onChange: (html: string) => void;
    editable?: boolean;
    placeholder?: string;
    defaultPageMode?: boolean;
    /** Min-height of the compact (non-page-mode) editor area in px. Defaults to the essay-length 420. */
    minHeight?: number;
    /** Whether the A4 "page view" toggle is offered. Defaults to true; set false for short fields
     * (e.g. a question prompt) where a full simulated page makes no sense. */
    allowPageMode?: boolean;
}

function Divider() {
    return <div style={{ width: 1, height: 22, background: '#e2e8f0', margin: '0 4px', flexShrink: 0 }} />;
}

interface ToolbarBtnProps {
    active?: boolean;
    onClick: () => void;
    title: string;
    disabled?: boolean;
    children: React.ReactNode;
}

function ToolbarBtn({ active, onClick, title, disabled, children }: ToolbarBtnProps) {
    return (
        <button
            type="button"
            title={title}
            disabled={disabled}
            onClick={onClick}
            style={{
                padding: '4px 6px',
                borderRadius: 5,
                border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: active ? '#e0e7ff' : 'transparent',
                color: active ? '#6366f1' : '#1e293b',
                opacity: disabled ? 0.4 : 1,
                flexShrink: 0,
            }}
        >
            {children}
        </button>
    );
}

const selectStyle: React.CSSProperties = {
    fontSize: '0.82rem',
    padding: '3px 6px',
    borderRadius: 5,
    border: '1px solid #e2e8f0',
    background: '#fff',
    color: '#1e293b',
    cursor: 'pointer',
    height: 28,
};

export default function EssayEditor({
    content,
    onChange,
    editable = true,
    placeholder,
    defaultPageMode = false,
    minHeight = 420,
    allowPageMode = true,
}: EssayEditorProps) {
    const { t } = useTranslation();
    const colorInputRef = useRef<HTMLInputElement>(null);
    const highlightInputRef = useRef<HTMLInputElement>(null);
    const [showInvisibles, setShowInvisibles] = useState(false);
    const [pageMode, setPageMode] = useState(allowPageMode && defaultPageMode);
    const lastTableInsertRef = useRef(0);

    const editor = useEditor({
        extensions: getTipTapExtensions(),
        content,
        editable,
        onUpdate: ({ editor }) => onChange(editor.getHTML()),
        editorProps: { attributes: { class: 'essay-editor-content' } },
    });

    // Sync the editable prop dynamically — TipTap only reads it at init time.
    useEffect(() => {
        if (editor && editor.isEditable !== editable) {
            editor.setEditable(editable ?? true);
        }
    }, [editor, editable]);

    if (!editor) return null;

    const handleInsertLink = () => {
        const prev = editor.getAttributes('link').href ?? '';
        const url = window.prompt('Enter link URL:', prev);
        if (url === null) return;
        if (url === '') {
            editor.chain().focus().unsetLink().run();
        } else {
            editor.chain().focus().setLink({ href: url }).run();
        }
    };

    const handleInsertTable = () => {
        // ponytail: guards against an autoclicker hammering this button — each table
        // insertion is a full ProseMirror doc re-render, so dozens per second cause
        // visible flicker. 300ms is well above human click cadence.
        const now = Date.now();
        if (now - lastTableInsertRef.current < 300) return;
        lastTableInsertRef.current = now;
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    };

    const currentFontFamily = editor.getAttributes('textStyle').fontFamily ?? '';
    const currentFontSize = (editor.getAttributes('textStyle').fontSize as string | undefined)?.replace('pt', '') ?? '';
    const currentLineHeight =
        editor.getAttributes('paragraph').lineHeight ?? editor.getAttributes('heading').lineHeight ?? '';

    return (
        <div
            style={{
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                overflow: 'hidden',
                background: '#fff',
                color: '#1e293b',
            }}
        >
            {/* ── Toolbar ─────────────────────────────────────────────────── */}
            {editable && (
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 2,
                        padding: '8px 10px',
                        borderBottom: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        rowGap: 6,
                    }}
                >
                    {/* ── History ── */}
                    <ToolbarBtn
                        onClick={() => editor.chain().focus().undo().run()}
                        title="Undo (Ctrl+Z)"
                        disabled={!editor.can().undo()}
                    >
                        <Undo2 size={15} />
                    </ToolbarBtn>
                    <ToolbarBtn
                        onClick={() => editor.chain().focus().redo().run()}
                        title="Redo (Ctrl+Y)"
                        disabled={!editor.can().redo()}
                    >
                        <Redo2 size={15} />
                    </ToolbarBtn>

                    <Divider />

                    {/* ── Paragraph / Heading ── */}
                    <select
                        value={
                            editor.isActive('heading', { level: 1 })
                                ? 'h1'
                                : editor.isActive('heading', { level: 2 })
                                  ? 'h2'
                                  : editor.isActive('heading', { level: 3 })
                                    ? 'h3'
                                    : 'p'
                        }
                        onChange={(e) => {
                            const v = e.target.value;
                            if (v === 'p') editor.chain().focus().setParagraph().run();
                            else
                                editor
                                    .chain()
                                    .focus()
                                    .toggleHeading({ level: parseInt(v[1]) as 1 | 2 | 3 })
                                    .run();
                        }}
                        style={selectStyle}
                        title="Paragraph style"
                    >
                        <option value="p">Paragraph</option>
                        <option value="h1">Heading 1</option>
                        <option value="h2">Heading 2</option>
                        <option value="h3">Heading 3</option>
                    </select>

                    {/* ── Font Family ── */}
                    <select
                        value={currentFontFamily}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (v === '') editor.chain().focus().unsetFontFamily().run();
                            else editor.chain().focus().setFontFamily(v).run();
                        }}
                        style={{ ...selectStyle, maxWidth: 140 }}
                        title="Font family"
                    >
                        {FONT_FAMILIES.map((f) => (
                            <option key={f.value} value={f.value}>
                                {f.label}
                            </option>
                        ))}
                    </select>

                    {/* ── Font Size ── */}
                    <select
                        value={currentFontSize}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (v === '') editor.chain().focus().unsetFontSize().run();
                            else editor.chain().focus().setFontSize(`${v}pt`).run();
                        }}
                        style={{ ...selectStyle, width: 60 }}
                        title="Font size"
                    >
                        <option value="">Size</option>
                        {FONT_SIZES.filter((s) => s !== '').map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>

                    <Divider />

                    {/* ── Character formatting ── */}
                    <ToolbarBtn
                        active={editor.isActive('bold')}
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        title="Bold (Ctrl+B)"
                    >
                        <Bold size={15} />
                    </ToolbarBtn>
                    <ToolbarBtn
                        active={editor.isActive('italic')}
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        title="Italic (Ctrl+I)"
                    >
                        <Italic size={15} />
                    </ToolbarBtn>
                    <ToolbarBtn
                        active={editor.isActive('underline')}
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        title="Underline (Ctrl+U)"
                    >
                        <UnderlineIcon size={15} />
                    </ToolbarBtn>
                    <ToolbarBtn
                        active={editor.isActive('strike')}
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                        title="Strikethrough"
                    >
                        <Strikethrough size={15} />
                    </ToolbarBtn>
                    <ToolbarBtn
                        active={editor.isActive('superscript')}
                        onClick={() => editor.chain().focus().toggleSuperscript().run()}
                        title="Superscript"
                    >
                        <SuperscriptIcon size={15} />
                    </ToolbarBtn>
                    <ToolbarBtn
                        active={editor.isActive('subscript')}
                        onClick={() => editor.chain().focus().toggleSubscript().run()}
                        title="Subscript"
                    >
                        <SubscriptIcon size={15} />
                    </ToolbarBtn>

                    <Divider />

                    {/* ── Colour + highlight ── */}
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }} title="Text colour">
                        <button
                            type="button"
                            onClick={() => colorInputRef.current?.click()}
                            style={{
                                padding: '3px 6px',
                                borderRadius: 5,
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 1,
                                background: 'transparent',
                                color: '#1e293b',
                                flexShrink: 0,
                            }}
                            title="Text colour"
                        >
                            <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1, fontFamily: 'serif' }}>A</span>
                            <span
                                style={{
                                    width: 14,
                                    height: 3,
                                    borderRadius: 2,
                                    background: editor.getAttributes('textStyle').color ?? '#000',
                                }}
                            />
                        </button>
                        <input
                            ref={colorInputRef}
                            type="color"
                            defaultValue="#000000"
                            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
                            title="Text colour"
                        />
                    </div>
                    <div
                        style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
                        title="Highlight colour"
                    >
                        <button
                            type="button"
                            onClick={() => {
                                if (editor.isActive('highlight')) {
                                    editor.chain().focus().unsetHighlight().run();
                                } else {
                                    highlightInputRef.current?.click();
                                }
                            }}
                            style={{
                                padding: '4px 6px',
                                borderRadius: 5,
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                background: editor.isActive('highlight') ? '#e0e7ff' : 'transparent',
                                color: '#1e293b',
                                flexShrink: 0,
                            }}
                            title="Highlight"
                        >
                            <Highlighter size={15} />
                        </button>
                        <input
                            ref={highlightInputRef}
                            type="color"
                            defaultValue="#fde68a"
                            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                            onChange={(e) => editor.chain().focus().setHighlight({ color: e.target.value }).run()}
                            title="Highlight colour"
                        />
                    </div>
                    <ToolbarBtn
                        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
                        title="Clear formatting"
                    >
                        <RemoveFormatting size={15} />
                    </ToolbarBtn>

                    <Divider />

                    {/* ── Line Height ── */}
                    <select
                        value={currentLineHeight}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (v === '') editor.chain().focus().unsetLineHeight().run();
                            else editor.chain().focus().setLineHeight(v).run();
                        }}
                        style={{ ...selectStyle, width: 100 }}
                        title="Line height"
                    >
                        {LINE_HEIGHTS.map((lh) => (
                            <option key={lh.value} value={lh.value}>
                                {lh.label}
                            </option>
                        ))}
                    </select>

                    {/* ── Alignment ── */}
                    <ToolbarBtn
                        active={editor.isActive({ textAlign: 'left' })}
                        onClick={() => editor.chain().focus().setTextAlign('left').run()}
                        title="Align left"
                    >
                        <AlignLeft size={15} />
                    </ToolbarBtn>
                    <ToolbarBtn
                        active={editor.isActive({ textAlign: 'center' })}
                        onClick={() => editor.chain().focus().setTextAlign('center').run()}
                        title="Align centre"
                    >
                        <AlignCenter size={15} />
                    </ToolbarBtn>
                    <ToolbarBtn
                        active={editor.isActive({ textAlign: 'right' })}
                        onClick={() => editor.chain().focus().setTextAlign('right').run()}
                        title="Align right"
                    >
                        <AlignRight size={15} />
                    </ToolbarBtn>
                    <ToolbarBtn
                        active={editor.isActive({ textAlign: 'justify' })}
                        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
                        title="Justify"
                    >
                        <AlignJustify size={15} />
                    </ToolbarBtn>

                    <Divider />

                    {/* ── Lists ── */}
                    <ToolbarBtn
                        active={editor.isActive('bulletList')}
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        title="Bullet list"
                    >
                        <List size={15} />
                    </ToolbarBtn>
                    <ToolbarBtn
                        active={editor.isActive('orderedList')}
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        title="Numbered list"
                    >
                        <ListOrdered size={15} />
                    </ToolbarBtn>
                    <ToolbarBtn
                        active={editor.isActive('taskList')}
                        onClick={() => editor.chain().focus().toggleTaskList().run()}
                        title="Checklist"
                    >
                        <ListChecks size={15} />
                    </ToolbarBtn>

                    <Divider />

                    {/* ── Block elements ── */}
                    <ToolbarBtn
                        active={editor.isActive('blockquote')}
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                        title="Blockquote"
                    >
                        <Quote size={15} />
                    </ToolbarBtn>
                    <ToolbarBtn
                        onClick={() => editor.chain().focus().setHorizontalRule().run()}
                        title="Horizontal line"
                    >
                        <Minus size={15} />
                    </ToolbarBtn>

                    <Divider />

                    {/* ── Link ── */}
                    <ToolbarBtn
                        active={editor.isActive('link')}
                        onClick={handleInsertLink}
                        title="Insert / edit link (Ctrl+K)"
                    >
                        <Link2 size={15} />
                    </ToolbarBtn>
                    {editor.isActive('link') && (
                        <ToolbarBtn onClick={() => editor.chain().focus().unsetLink().run()} title="Remove link">
                            <Unlink size={15} />
                        </ToolbarBtn>
                    )}

                    {/* ── Table ── */}
                    <ToolbarBtn onClick={handleInsertTable} title="Insert table (3×3)">
                        <TableIcon size={15} />
                    </ToolbarBtn>

                    <Divider />

                    {/* ── Show invisibles ── */}
                    <ToolbarBtn
                        active={showInvisibles}
                        onClick={() => setShowInvisibles((v) => !v)}
                        title="Show formatting marks"
                    >
                        <span style={{ fontSize: 14, lineHeight: 1, fontFamily: 'serif', fontWeight: 400 }}>¶</span>
                    </ToolbarBtn>

                    {allowPageMode && (
                        <>
                            <Divider />

                            {/* ── A4 page mode ── */}
                            <ToolbarBtn
                                active={pageMode}
                                onClick={() => setPageMode((v) => !v)}
                                title={pageMode ? t('editor.switchToCompactView') : t('editor.switchToPageView')}
                            >
                                <FileText size={15} />
                            </ToolbarBtn>
                        </>
                    )}
                </div>
            )}

            {/* ── Editor area ── */}
            {pageMode ? (
                // Deliberately hardcoded to a light "paper" look, matching the rest of this
                // editor's chrome (toolbar, borders) — this component always renders like a
                // white document regardless of app theme. Previously this used theme vars,
                // which under the dark theme made the page background near-black while the
                // text stayed the editor's hardcoded dark colour, i.e. unreadable.
                <div
                    style={{
                        background: '#f1f5f9',
                        padding: '32px 24px',
                        minHeight: 500,
                    }}
                    className={showInvisibles ? 'show-invisibles' : ''}
                >
                    <div
                        style={{
                            width: '100%',
                            maxWidth: 794,
                            minHeight: 1123,
                            margin: '0 auto',
                            background: '#fff',
                            boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
                            borderRadius: 2,
                            padding: '96px 96px 96px',
                            boxSizing: 'border-box',
                        }}
                    >
                        <EditorContent editor={editor} placeholder={placeholder} />
                    </div>
                </div>
            ) : (
                <div style={{ padding: '18px 22px', minHeight }} className={showInvisibles ? 'show-invisibles' : ''}>
                    <EditorContent editor={editor} placeholder={placeholder} />
                </div>
            )}

            {/* ── Table context controls (shown when cursor is inside a table) ── */}
            {editable && editor.isActive('table') && (
                <div
                    style={{
                        display: 'flex',
                        gap: 6,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        padding: '8px 12px',
                        borderTop: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        fontSize: '0.75rem',
                    }}
                >
                    <span style={{ color: '#64748b', fontWeight: 600, marginRight: 4 }}>Table:</span>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                        onClick={() => editor.chain().focus().addColumnAfter().run()}
                    >
                        + Column
                    </button>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                        onClick={() => editor.chain().focus().addRowAfter().run()}
                    >
                        + Row
                    </button>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                        onClick={() => editor.chain().focus().deleteColumn().run()}
                    >
                        − Column
                    </button>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                        onClick={() => editor.chain().focus().deleteRow().run()}
                    >
                        − Row
                    </button>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.72rem', padding: '2px 8px', color: '#ef4444' }}
                        onClick={() => editor.chain().focus().deleteTable().run()}
                    >
                        Delete table
                    </button>
                </div>
            )}

            {/* ── Scoped styles ── */}
            <style>{`
                ${TIPTAP_CONTENT_STYLES}

                /* ── Show invisibles ── */
                .show-invisibles .essay-editor-content p::after { content: '¶'; color: #94a3b8; font-weight: 400; margin-left: 2px; pointer-events: none; }
                .show-invisibles .essay-editor-content br::after { content: '↵'; color: #94a3b8; pointer-events: none; }
            `}</style>
        </div>
    );
}
