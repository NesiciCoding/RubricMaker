import { renderHook } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import type { DocumentMark } from '../../types';
import { useMarkSuggestions } from './useMarkSuggestions';
import { hashSnippet } from '../../utils/proofRail';

const editors: Editor[] = [];

function makeEditor(content: string): Editor {
    const editor = new Editor({
        extensions: [
            StarterKit.configure({ link: false, underline: false, undoRedo: {} }),
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
        ],
        content,
    });
    editors.push(editor);
    return editor;
}

afterEach(() => {
    for (const editor of editors.splice(0)) editor.destroy();
});

function mark(overrides: Partial<DocumentMark> = {}): DocumentMark {
    return {
        id: 'm1',
        attachmentId: 'a1',
        authorId: 't1',
        symbolId: 'del',
        anchor: { from: 7, to: 12 },
        snippetHash: hashSnippet('world'),
        status: 'noted',
        createdAt: '2024-01-01T00:00:00Z',
        ...overrides,
    };
}

describe('useMarkSuggestions', () => {
    it('returns nothing before the editor exists', () => {
        const { result } = renderHook(() => useMarkSuggestions(null, [mark()]));

        expect(result.current).toEqual({});
    });

    it('derives the suggestion for a text-operation mark by id', () => {
        const editor = makeEditor('<p>Hello world again</p>');
        const { result } = renderHook(() => useMarkSuggestions(editor, [mark()]));

        expect(result.current).toEqual({
            m1: { key: 'proofMarks.apply.suggestion.deleteWithSpace', values: { text: 'world' } },
        });
    });

    it('leaves formatting marks and stale anchors out', () => {
        const editor = makeEditor('<p>Hello world again</p>');
        const { result } = renderHook(() =>
            useMarkSuggestions(editor, [
                mark({ id: 'italic', symbolId: 'ital' }),
                mark({ id: 'stale', snippetHash: hashSnippet('gone') }),
            ])
        );

        expect(result.current).toEqual({});
    });

    it('reports an advisory mark with its reason', () => {
        const editor = makeEditor('<p>Hello world again</p>');
        const { result } = renderHook(() =>
            useMarkSuggestions(editor, [mark({ symbolId: 'tr', anchor: { from: 7, to: 12 } })])
        );

        expect(result.current.m1).toEqual({
            key: 'proofMarks.apply.advisory',
            reasonKey: 'proofMarks.apply.reason.needsTwoWords',
        });
    });
});
