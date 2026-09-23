import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import HotTextEditor from '../HotTextEditor';

describe('HotTextEditor', () => {
    it('renders the insert-fragment button and the editor content area', async () => {
        render(
            <HotTextEditor
                passage="Click here now"
                correctIndices={[]}
                onChange={vi.fn()}
                insertFragmentLabel="+ fragment"
            />
        );
        expect(screen.getByRole('button', { name: '+ fragment' })).toBeInTheDocument();
        await waitFor(() => {
            expect(document.querySelector('.hot-text-editor-content')).toBeInTheDocument();
        });
    });

    it('inserts a fragment at the cursor and reports it through onChange', async () => {
        const onChange = vi.fn();
        render(
            <HotTextEditor passage="Text" correctIndices={[]} onChange={onChange} insertFragmentLabel="+ fragment" />
        );
        const btn = screen.getByRole('button', { name: '+ fragment' });
        fireEvent.mouseDown(btn);
        fireEvent.click(btn);
        await waitFor(() => {
            expect(onChange).toHaveBeenCalled();
            expect(onChange.mock.calls.at(-1)![0]).toContain('[[word]]');
            expect(onChange.mock.calls.at(-1)![1]).toEqual([]);
        });
    });

    it('resyncs the editor when the passage changes from outside', async () => {
        const onChange = vi.fn();
        const { rerender } = render(
            <HotTextEditor passage="First" correctIndices={[]} onChange={onChange} insertFragmentLabel="+ fragment" />
        );
        rerender(
            <HotTextEditor
                passage="Replaced [[word]]"
                correctIndices={[0]}
                onChange={onChange}
                insertFragmentLabel="+ fragment"
            />
        );
        await waitFor(() => {
            expect(document.querySelector('.hot-text-editor-content')?.textContent).toContain('Replaced');
            expect(document.querySelector('.hot-text-fragment-pill.correct')).not.toBeNull();
        });
    });
});
