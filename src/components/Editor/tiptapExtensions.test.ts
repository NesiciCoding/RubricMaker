import { describe, it, expect, vi, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import {
    getTipTapExtensions,
    createPlaceholderExtension,
    createTableOfContentsExtension,
    createImageEmbedExtension,
    TIPTAP_CONTENT_STYLES,
} from './tiptapExtensions';

const editors: Editor[] = [];

function makeEditor(content = '<p>Hello <strong>world</strong></p>'): Editor {
    const editor = new Editor({ extensions: getTipTapExtensions(), content });
    editors.push(editor);
    return editor;
}

afterEach(() => {
    for (const e of editors.splice(0)) e.destroy();
});

describe('getTipTapExtensions', () => {
    it('returns the shared extension set and constructs an editor with it', () => {
        const exts = getTipTapExtensions();
        expect(exts.length).toBeGreaterThan(10);
        const names = exts.map((e) => e.name);
        for (const expected of [
            'underline',
            'textStyle',
            'link',
            'table',
            'taskList',
            'fontFamily',
            'fontSize',
            'lineHeight',
            'uniqueID',
            'emoji',
        ]) {
            expect(names).toContain(expected);
        }
        const editor = makeEditor();
        expect(editor.getHTML()).toContain('<p>Hello <strong>world</strong></p>');
    });
});

describe('font family extension', () => {
    it('sets and unsets font-family via commands', () => {
        const editor = makeEditor();
        editor.chain().selectAll().setFontFamily('Georgia').run();
        expect(editor.getHTML()).toContain('font-family: Georgia');

        editor.chain().selectAll().unsetFontFamily().run();
        expect(editor.getHTML()).not.toContain('font-family');
    });

    it('round-trips an inline font-family through parse and render', () => {
        const editor = new Editor({
            extensions: getTipTapExtensions(),
            content: '<p><span style="font-family: Georgia">styled</span></p>',
        });
        editors.push(editor);
        expect(editor.getHTML()).toContain('font-family: Georgia');
    });
});

describe('font size extension', () => {
    it('sets and unsets font-size via commands', () => {
        const editor = makeEditor();
        editor.chain().selectAll().setFontSize('18px').run();
        expect(editor.getHTML()).toContain('font-size: 18px');

        editor.chain().selectAll().unsetFontSize().run();
        expect(editor.getHTML()).not.toContain('font-size');
    });

    it('round-trips an inline font-size through parse and render', () => {
        const editor = new Editor({
            extensions: getTipTapExtensions(),
            content: '<p><span style="font-size: 18px">big</span></p>',
        });
        editors.push(editor);
        expect(editor.getHTML()).toContain('font-size: 18px');
    });
});

describe('line height extension', () => {
    it('sets and unsets line-height on paragraphs and headings', () => {
        const editor = makeEditor('<h1>Title</h1><p>Body</p>');
        editor.chain().selectAll().setLineHeight('1.5').run();
        const html = editor.getHTML();
        expect(html).toContain('line-height: 1.5');

        editor.chain().selectAll().unsetLineHeight().run();
        expect(editor.getHTML()).not.toContain('line-height');
    });

    it('round-trips an inline line-height through parse and render', () => {
        const editor = new Editor({
            extensions: getTipTapExtensions(),
            content: '<p style="line-height: 2">Tall</p>',
        });
        editors.push(editor);
        expect(editor.getHTML()).toContain('line-height: 2');
    });
});

describe('createPlaceholderExtension', () => {
    it('builds a placeholder extension with the given text', () => {
        const ext = createPlaceholderExtension('Write here…');
        expect(ext.name).toBe('placeholder');
        expect(ext.options.placeholder).toBe('Write here…');
    });
});

describe('createTableOfContentsExtension', () => {
    it('wires onUpdate into the table-of-contents extension', () => {
        const onUpdate = vi.fn();
        const ext = createTableOfContentsExtension(onUpdate);
        expect(ext.name).toBe('tableOfContents');
        expect(ext.options.onUpdate).toBe(onUpdate);
    });
});

describe('createImageEmbedExtension', () => {
    it('returns the Image and FileHandler extensions', () => {
        const [image, fileHandler] = createImageEmbedExtension();
        expect(image.name).toBe('image');
        expect(fileHandler.name).toBe('fileHandler');
        expect((fileHandler.options as unknown as { allowedMimeTypes?: string[] }).allowedMimeTypes).toContain(
            'image/svg+xml'
        );
    });

    it('embeds a dropped image file as a data URL at the given position', async () => {
        const insertContentAt = vi.fn(() => ({ focus: () => ({ run: vi.fn(() => true) }) }));
        const fakeEditor = {
            state: { selection: { anchor: 5 } },
            chain: () => ({ insertContentAt }),
        };
        const [, fileHandler] = createImageEmbedExtension();
        const { onDrop } = fileHandler.options as unknown as {
            onDrop: (editor: unknown, files: File[], pos?: number) => void;
        };
        const file = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'pic.svg', {
            type: 'image/svg+xml',
        });
        onDrop(fakeEditor, [file], 3);
        await vi.waitFor(() =>
            expect(insertContentAt).toHaveBeenCalledWith(3, {
                type: 'image',
                attrs: expect.objectContaining({
                    src: expect.stringContaining('data:image/svg+xml'),
                    alt: 'pic.svg',
                }),
            })
        );
    });

    it('embeds a pasted image at the current cursor and ignores non-images', async () => {
        const insertContentAt = vi.fn(() => ({ focus: () => ({ run: vi.fn(() => true) }) }));
        const fakeEditor = {
            state: { selection: { anchor: 9 } },
            chain: () => ({ insertContentAt }),
        };
        const [, fileHandler] = createImageEmbedExtension();
        const { onPaste } = fileHandler.options as unknown as {
            onPaste: (editor: unknown, files: File[]) => void;
        };

        const png = new File(['png-bytes'], 'img.png', { type: 'image/png' });
        const text = new File(['nope'], 'notes.txt', { type: 'text/plain' });
        onPaste(fakeEditor, [png, text]);
        await vi.waitFor(() => expect(insertContentAt).toHaveBeenCalledTimes(1));
        expect((insertContentAt.mock.calls[0] as unknown[])[0]).toBe(9);
    });

    it('ignores oversized images', async () => {
        const insertContentAt = vi.fn(() => ({ focus: () => ({ run: vi.fn(() => true) }) }));
        const fakeEditor = {
            state: { selection: { anchor: 0 } },
            chain: () => ({ insertContentAt }),
        };
        const [, fileHandler] = createImageEmbedExtension();
        const { onDrop } = fileHandler.options as unknown as {
            onDrop: (editor: unknown, files: File[], pos?: number) => void;
        };

        const big = new File([new ArrayBuffer(5 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' });
        onDrop(fakeEditor, [big], 0);
        await vi.waitFor(() => expect(insertContentAt).not.toHaveBeenCalled());
    });
});

describe('TIPTAP_CONTENT_STYLES', () => {
    it('includes the shared editor styles', () => {
        expect(TIPTAP_CONTENT_STYLES).toContain('.essay-editor-content p');
        expect(TIPTAP_CONTENT_STYLES).toContain('.tableWrapper');
        expect(TIPTAP_CONTENT_STYLES).toContain('taskList');
        expect(TIPTAP_CONTENT_STYLES).toContain('comment-highlight');
    });
});
