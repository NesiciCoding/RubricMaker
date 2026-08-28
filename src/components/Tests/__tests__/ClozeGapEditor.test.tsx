import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ClozeGapEditor from '../ClozeGapEditor';

describe('ClozeGapEditor', () => {
    it('renders the single-gap button and the editor content area', async () => {
        render(
            <ClozeGapEditor
                value="Fill in the blank."
                onChange={vi.fn()}
                allowDropdown={false}
                insertGapLabel="+ gap"
                insertDropdownGapLabel="+ dropdown"
            />
        );
        expect(screen.getByRole('button', { name: '+ gap' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '+ dropdown' })).not.toBeInTheDocument();
        await waitFor(() => {
            expect(document.querySelector('.cloze-gap-editor-content')).toBeInTheDocument();
        });
    });

    it('renders the dropdown-gap button only when allowDropdown is set', () => {
        render(
            <ClozeGapEditor
                value=""
                onChange={vi.fn()}
                allowDropdown
                insertGapLabel="+ gap"
                insertDropdownGapLabel="+ dropdown"
            />
        );
        expect(screen.getByRole('button', { name: '+ gap' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '+ dropdown' })).toBeInTheDocument();
    });

    it('inserts a single-answer gap and reports it through onChange', async () => {
        const onChange = vi.fn();
        render(
            <ClozeGapEditor
                value="The capital is ."
                onChange={onChange}
                allowDropdown={false}
                insertGapLabel="+ gap"
                insertDropdownGapLabel="+ dropdown"
            />
        );
        const gapBtn = screen.getByRole('button', { name: '+ gap' });
        fireEvent.mouseDown(gapBtn);
        fireEvent.click(gapBtn);
        await waitFor(() => {
            expect(onChange).toHaveBeenCalled();
            expect(onChange.mock.calls.at(-1)![0]).toContain('{{answer}}');
        });
    });

    it('inserts a dropdown gap with three alternatives when enabled', async () => {
        const onChange = vi.fn();
        render(
            <ClozeGapEditor
                value="Pick one."
                onChange={onChange}
                allowDropdown
                insertGapLabel="+ gap"
                insertDropdownGapLabel="+ dropdown"
            />
        );
        const dropdownBtn = screen.getByRole('button', { name: '+ dropdown' });
        fireEvent.mouseDown(dropdownBtn);
        fireEvent.click(dropdownBtn);
        await waitFor(() => {
            expect(onChange).toHaveBeenCalled();
            expect(onChange.mock.calls.at(-1)![0]).toContain('{{correct|wrong1|wrong2}}');
        });
    });

    it('resyncs the editor when the value changes from outside', async () => {
        const onChange = vi.fn();
        const { rerender } = render(
            <ClozeGapEditor
                value="First"
                onChange={onChange}
                allowDropdown={false}
                insertGapLabel="+ gap"
                insertDropdownGapLabel="+ dropdown"
            />
        );
        rerender(
            <ClozeGapEditor
                value="Replaced {{gap}}"
                onChange={onChange}
                allowDropdown={false}
                insertGapLabel="+ gap"
                insertDropdownGapLabel="+ dropdown"
            />
        );
        await waitFor(() => {
            expect(document.querySelector('.cloze-gap-editor-content')?.textContent).toContain('Replaced');
        });
    });
});
