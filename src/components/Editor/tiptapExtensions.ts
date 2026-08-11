import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import Link from '@tiptap/extension-link';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import InvisibleCharacters from '@tiptap/extension-invisible-characters';
import UniqueId from '@tiptap/extension-unique-id';
import { Placeholder } from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { FileHandler } from '@tiptap/extension-file-handler';
import { TableOfContents, type TableOfContentData } from '@tiptap/extension-table-of-contents';
import { createEmojiExtension } from './emojiExtension';
import { fileToDataUrl } from '../../utils/fileToDataUrl';

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        fontFamily: {
            setFontFamily: (fontFamily: string) => ReturnType;
            unsetFontFamily: () => ReturnType;
        };
        fontSize: {
            setFontSize: (size: string) => ReturnType;
            unsetFontSize: () => ReturnType;
        };
        lineHeight: {
            setLineHeight: (lineHeight: string) => ReturnType;
            unsetLineHeight: () => ReturnType;
        };
    }
}

// ── Custom: FontFamily ──────────────────────────────────────────────────────

export const FontFamily = Extension.create({
    name: 'fontFamily',
    addOptions() {
        return { types: ['textStyle'] };
    },
    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    fontFamily: {
                        default: null,
                        parseHTML: (el: HTMLElement) => (el as HTMLElement).style.fontFamily || null,
                        renderHTML: (attrs: Record<string, string | null>) =>
                            attrs.fontFamily ? { style: `font-family: ${attrs.fontFamily}` } : {},
                    },
                },
            },
        ];
    },
    addCommands() {
        return {
            setFontFamily:
                (fontFamily: string) =>
                ({
                    chain,
                }: {
                    chain: () => { setMark: (name: string, attrs: Record<string, string>) => { run: () => boolean } };
                }) =>
                    chain().setMark('textStyle', { fontFamily }).run(),
            unsetFontFamily:
                () =>
                ({
                    chain,
                }: {
                    chain: () => {
                        setMark: (
                            name: string,
                            attrs: Record<string, string | null>
                        ) => { removeEmptyTextStyle: () => { run: () => boolean } };
                    };
                }) =>
                    chain().setMark('textStyle', { fontFamily: null }).removeEmptyTextStyle().run(),
        };
    },
});

// ── Custom: FontSize ─────────────────────────────────────────────────────────

export const FontSize = Extension.create({
    name: 'fontSize',
    addOptions() {
        return { types: ['textStyle'] };
    },
    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    fontSize: {
                        default: null,
                        parseHTML: (el: HTMLElement) => (el as HTMLElement).style.fontSize || null,
                        renderHTML: (attrs: Record<string, string | null>) =>
                            attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
                    },
                },
            },
        ];
    },
    addCommands() {
        return {
            setFontSize:
                (fontSize: string) =>
                ({
                    chain,
                }: {
                    chain: () => { setMark: (name: string, attrs: Record<string, string>) => { run: () => boolean } };
                }) =>
                    chain().setMark('textStyle', { fontSize }).run(),
            unsetFontSize:
                () =>
                ({
                    chain,
                }: {
                    chain: () => {
                        setMark: (
                            name: string,
                            attrs: Record<string, string | null>
                        ) => { removeEmptyTextStyle: () => { run: () => boolean } };
                    };
                }) =>
                    chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
        };
    },
});

// ── Custom: LineHeight ──────────────────────────────────────────────────────

export const LineHeight = Extension.create({
    name: 'lineHeight',
    addOptions() {
        return { types: ['paragraph', 'heading'] };
    },
    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    lineHeight: {
                        default: null,
                        parseHTML: (el: HTMLElement) => (el as HTMLElement).style.lineHeight || null,
                        renderHTML: (attrs: Record<string, string | null>) =>
                            attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {},
                    },
                },
            },
        ];
    },
    addCommands() {
        return {
            setLineHeight:
                (lineHeight: string) =>
                ({
                    commands,
                }: {
                    commands: { updateAttributes: (type: string, attrs: Record<string, string>) => boolean };
                }) =>
                    (this.options.types as string[]).every((type) => commands.updateAttributes(type, { lineHeight })),
            unsetLineHeight:
                () =>
                ({ commands }: { commands: { resetAttributes: (type: string, attr: string) => boolean } }) =>
                    (this.options.types as string[]).every((type) => commands.resetAttributes(type, 'lineHeight')),
        };
    },
});

// Re-exported for existing call sites that import it from here. The string itself lives in its own
// dependency-free module so the read-only RichContent renderer doesn't pull this whole heavy module.
export { TIPTAP_CONTENT_STYLES } from './tiptapContentStyles';

/** Shared rich-text extension set used by every TipTap editor instance in the app. */
export function getTipTapExtensions() {
    return [
        StarterKit.configure({ undoRedo: {}, link: false, underline: false }),
        Underline,
        TextStyle,
        Color,
        Highlight.configure({ multicolor: true }),
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        Superscript,
        Subscript,
        Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
        TaskList,
        TaskItem.configure({ nested: true }),
        FontFamily,
        FontSize,
        LineHeight,
        InvisibleCharacters.configure({ visible: false }),
        // Headings only — this is what TableOfContents' click-to-scroll and stable anchors rely on;
        // harmless to include even where no TOC/emoji feature is opted into (read-only viewers included).
        UniqueId.configure({ types: ['heading'] }),
        createEmojiExtension(),
    ];
}

/**
 * Placeholder text shown when the editor (or, with `showOnlyWhenEditable`'s default of true,
 * only while editable) is empty. Opt-in per caller via `EssayEditor`'s existing `placeholder`
 * prop — this is the extension the pre-existing `.is-empty::before` CSS rule and dormant
 * `placeholder` prop were always waiting on (roadmap Phase 26.4).
 */
export function createPlaceholderExtension(placeholder: string) {
    return Placeholder.configure({ placeholder });
}

/**
 * Renders a heading outline as `TableOfContentData` via `onUpdate`, for a caller-owned sidebar
 * (roadmap Phase 26.4). Relies on `UniqueId`'s heading ids (already in the shared extension set)
 * for stable anchors rather than TableOfContents' own content-hash fallback.
 */
export function createTableOfContentsExtension(onUpdate: (data: TableOfContentData) => void) {
    return TableOfContents.configure({ onUpdate });
}

/** Matches `MAX_FILE_SIZE_BYTES` in `questionBankImport.ts` — the project's existing size-cap convention. Images embed as base64 data URIs in the stored `content` HTML, so an oversized one bloats the synced jsonb document the same way an unbounded import file would. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Inserts each dropped/pasted image file as a data URI, mirroring `TestQuestion.imageUrl`'s existing "public URL or data URI" convention — no upload step or attachment record needed. Non-image and oversized files are ignored. */
function insertImageFiles(editor: Editor, files: File[], pos?: number) {
    // Captured synchronously, before the async FileReader resolves — the paste path has no
    // caller-supplied `pos`, so if this read `editor.state.selection.anchor` from inside the
    // `.then()` instead, a selection change while the file is still being read would insert the
    // image at the wrong (later) cursor position.
    const insertPos = pos ?? editor.state.selection.anchor;
    files.forEach((file) => {
        if (!file.type.startsWith('image/') || file.size > MAX_IMAGE_BYTES) return;
        fileToDataUrl(file)
            .then((src) => {
                editor
                    .chain()
                    .insertContentAt(insertPos, { type: 'image', attrs: { src, alt: file.name } })
                    .focus()
                    .run();
            })
            .catch(() => {
                // Unreadable file (corrupt blob) — nothing was inserted, nothing to roll back.
            });
    });
}

/**
 * Inline image embedding for teacher-authoring surfaces only (Test Builder passage editor,
 * Question Bank section editor, Question Editor prompts) — roadmap Phase 26.4. Deliberately not
 * wired into student essay writing/answering.
 */
export function createImageEmbedExtension() {
    return [
        Image.configure({ HTMLAttributes: { style: 'max-width: 100%; height: auto;' } }),
        FileHandler.configure({
            allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'],
            onDrop: (editor, files, pos) => insertImageFiles(editor, files, pos),
            onPaste: (editor, files) => insertImageFiles(editor, files),
        }),
    ];
}
