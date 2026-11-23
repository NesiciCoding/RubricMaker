import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import ErrorPassageEditor from '../ErrorPassageEditor';

afterEach(() => {
    document.querySelectorAll('.pill-popover').forEach((popover) => popover.remove());
});

const pill = (selector: string) => document.querySelector(selector) as HTMLElement | null;

describe('ErrorPassageEditor', () => {
    it('shows the passage with its error and correct fragments, and the accepted correction', async () => {
        render(<ErrorPassageEditor passage="He [[go|goes]] to [[school]] daily." onChange={vi.fn()} />);
        await waitFor(() => expect(document.querySelector('.error-passage-editor-content')).not.toBeNull());
        const error = pill('.error-fragment-pill.error')!;
        expect(error.textContent).toContain('go');
        expect(error.textContent).toContain('→ goes');
        expect(pill('.error-fragment-pill.fine')?.textContent).toBe('school');
    });

    it('labels the editor for assistive technology', async () => {
        render(<ErrorPassageEditor passage="Text" onChange={vi.fn()} />);
        await waitFor(() => expect(document.querySelector('.error-passage-editor-content')).not.toBeNull());
        expect(document.querySelector('.error-passage-editor-content')).toHaveAttribute('aria-label');
    });

    it('marks a fragment as an error, opens its popover at once and warns that it has no correction yet', async () => {
        const onChange = vi.fn();
        render(<ErrorPassageEditor passage="He go home" onChange={onChange} />);
        const [markError] = screen.getAllByRole('button');
        fireEvent.mouseDown(markError);
        fireEvent.click(markError);

        await waitFor(() => expect(onChange).toHaveBeenCalled());
        expect(onChange.mock.calls.at(-1)![0]).toContain('[[word');
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(document.querySelector('.error-fragment-popover')).not.toBeNull();
    });

    it('marks a fragment as fine without a warning', async () => {
        const onChange = vi.fn();
        render(<ErrorPassageEditor passage="He goes home" onChange={onChange} />);
        const buttons = screen.getAllByRole('button');
        fireEvent.mouseDown(buttons[1]);
        fireEvent.click(buttons[1]);

        await waitFor(() => expect(onChange).toHaveBeenCalled());
        expect(onChange.mock.calls.at(-1)![0]).toContain('[[word]]');
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('resyncs when the passage changes from outside, and reports back the same passage so the parent settles', async () => {
        const onChange = vi.fn();
        const { rerender } = render(<ErrorPassageEditor passage="First [[a|b]]" onChange={onChange} />);
        await waitFor(() =>
            expect(document.querySelector('.error-passage-editor-content')?.textContent).toContain('First')
        );
        rerender(<ErrorPassageEditor passage="Second [[c|d]] text" onChange={onChange} />);
        await waitFor(() => {
            const text = document.querySelector('.error-passage-editor-content')?.textContent ?? '';
            expect(text).toContain('Second');
            expect(text).not.toContain('First');
        });
        // Loading content reports an update; it must be the passage that was loaded, or the two would loop.
        for (const [reported] of onChange.mock.calls) expect(reported).toBe('Second [[c|d]] text');
    });
});
