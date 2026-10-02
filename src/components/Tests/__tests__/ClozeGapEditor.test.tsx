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

    it('offers a stem field in the gap popover only for word formation, and writes it as (STEM)', async () => {
        const onChange = vi.fn();
        render(
            <ClozeGapEditor
                value="Her {{happiness}}(HAPPY) showed."
                onChange={onChange}
                allowDropdown={false}
                insertGapLabel="+ gap"
                insertDropdownGapLabel="+ dropdown"
                wordFormation
            />
        );
        const pill = await waitFor(() => {
            const el = document.querySelector('.cloze-gap-pill');
            expect(el).toHaveTextContent('happiness(HAPPY)');
            return el as HTMLElement;
        });
        fireEvent.click(pill);
        const inputs = document.querySelectorAll<HTMLInputElement>('.cloze-gap-popover-input');
        expect(inputs).toHaveLength(2);
        expect(inputs[1].value).toBe('HAPPY');
        fireEvent.change(inputs[1], { target: { value: 'JOY(' } });
        fireEvent.click(document.querySelector('.cloze-gap-popover-save') as HTMLElement);
        expect(onChange).toHaveBeenLastCalledWith('Her {{happiness}}(JOY) showed.');
    });

    it('does not turn a parenthesis after a gap into a stem when word formation is off', async () => {
        render(
            <ClozeGapEditor
                value="Her {{a}}(b) showed."
                onChange={vi.fn()}
                allowDropdown={false}
                insertGapLabel="+ gap"
                insertDropdownGapLabel="+ dropdown"
            />
        );
        const pill = await waitFor(() => document.querySelector('.cloze-gap-pill') as HTMLElement);
        expect(pill).toHaveTextContent(/^a$/);
        fireEvent.click(pill);
        expect(document.querySelectorAll('.cloze-gap-popover-input')).toHaveLength(1);
    });
});
