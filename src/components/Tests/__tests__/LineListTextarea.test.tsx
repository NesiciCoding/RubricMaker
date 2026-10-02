import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LineListTextarea from '../LineListTextarea';

describe('LineListTextarea', () => {
    it('keeps a trailing newline while typing and reports only non-blank lines', () => {
        const onChange = vi.fn();
        render(<LineListTextarea id="t" value={['one']} onChange={onChange} />);
        const box = screen.getByRole('textbox') as HTMLTextAreaElement;
        fireEvent.change(box, { target: { value: 'one\n' } });
        expect(box.value).toBe('one\n');
        expect(onChange).toHaveBeenLastCalledWith(['one']);
        fireEvent.change(box, { target: { value: 'one\ntwo\n\n' } });
        expect(onChange).toHaveBeenLastCalledWith(['one', 'two']);
    });
});
