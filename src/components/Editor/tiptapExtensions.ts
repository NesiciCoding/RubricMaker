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

/**
 * CSS for the `.essay-editor-content` class, shared by the live editor (`EssayEditor`) and the
 * read-only renderer (`RichContent`) so authored HTML looks identical in both places.
 */
export const TIPTAP_CONTENT_STYLES = `
    .essay-editor-content { outline: none; }
    .essay-editor-content p { margin: 0 0 0.6em; line-height: 1.75; }
    .essay-editor-content h1 { font-size: 1.6em; font-weight: 700; margin: 0.8em 0 0.4em; line-height: 1.25; }
    .essay-editor-content h2 { font-size: 1.3em; font-weight: 700; margin: 0.8em 0 0.35em; line-height: 1.3; }
    .essay-editor-content h3 { font-size: 1.1em; font-weight: 700; margin: 0.7em 0 0.3em; line-height: 1.35; }
    .essay-editor-content ul, .essay-editor-content ol { padding-left: 1.4em; margin: 0 0 0.6em; }
    .essay-editor-content li { margin-bottom: 0.2em; line-height: 1.7; }
    .essay-editor-content blockquote { border-left: 3px solid #6366f1; margin: 0.8em 0; padding: 0.4em 1em; color: #64748b; font-style: italic; }
    .essay-editor-content hr { border: none; border-top: 1.5px solid #e2e8f0; margin: 1.2em 0; }
    .essay-editor-content a { color: #6366f1; text-decoration: underline; }
    .essay-editor-content table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
    /* A cell with a large font size (or a long unbroken word) can force the table
       wider than its column. Without this, that overflow spills out and is silently
       clipped by a rounded-corner container (overflow: hidden on the outer wrapper) —
       the content becomes invisible with no way to scroll to it. */
    .essay-editor-content .tableWrapper { overflow-x: auto; }
    .essay-editor-content th, .essay-editor-content td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; min-width: 60px; }
    .essay-editor-content th { background: #f8fafc; font-weight: 700; }
    .essay-editor-content .selectedCell { background: #e0e7ff; }
    .essay-editor-content ul[data-type="taskList"] { padding-left: 0.2em; list-style: none; }
    .essay-editor-content ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5em; }
    .essay-editor-content ul[data-type="taskList"] li > label { margin-top: 0.2em; flex-shrink: 0; cursor: pointer; }
    .essay-editor-content ul[data-type="taskList"] li > div { flex: 1; }
    .essay-editor-content .is-empty::before { content: attr(data-placeholder); color: var(--text-dim, #94a3b8); pointer-events: none; position: absolute; }
    .essay-editor-content sup { font-size: 0.72em; vertical-align: super; }
    .essay-editor-content sub { font-size: 0.72em; vertical-align: sub; }
`;

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
    ];
}
