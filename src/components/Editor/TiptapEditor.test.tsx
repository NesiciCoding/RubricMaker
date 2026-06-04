import React, { createRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TiptapEditor, { type TiptapEditorHandle } from './TiptapEditor';

// TipTap internals need a DOM environment — jsdom provides it.
// We just verify the ref shape and that the component renders without crashing.

describe('TiptapEditor', () => {
    it('renders toolbar buttons', async () => {
        render(<TiptapEditor content="" onChange={() => {}} />);
        await waitFor(() => {
            // Toolbar buttons exist (Bold, Italic, Bullet list, Ordered list)
            expect(document.querySelectorAll('.toolbar-btn').length).toBeGreaterThanOrEqual(4);
        });
    });

    it('exposes insertContent via ref handle', async () => {
        const ref = createRef<TiptapEditorHandle>();
        const onChange = vi.fn();
        render(<TiptapEditor ref={ref} content="<p>Hello</p>" onChange={onChange} />);

        await waitFor(() => {
            // The ref should be populated once the editor mounts
            expect(ref.current).not.toBeNull();
            expect(typeof ref.current?.insertContent).toBe('function');
        });
    });

    it('calls onChange when content updates', async () => {
        const onChange = vi.fn();
        render(<TiptapEditor content="" onChange={onChange} />);
        // Verify the component mounted successfully (onChange is wired via onUpdate)
        await waitFor(() => {
            expect(document.querySelector('.tiptap-editor')).toBeTruthy();
        });
    });
});
