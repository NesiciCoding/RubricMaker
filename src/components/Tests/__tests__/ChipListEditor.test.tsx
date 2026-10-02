import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChipListEditor from '../ChipListEditor';

const setup = (values: string[], extra: Partial<React.ComponentProps<typeof ChipListEditor>> = {}) => {
    const onChange = vi.fn();
    render(
        <ChipListEditor
            values={values}
            onChange={onChange}
            ariaLabel="chips"
            removeLabel={(v) => `remove ${v}`}
            {...extra}
        />
    );
    return { onChange, input: screen.getByLabelText('chips') };
};

describe('ChipListEditor', () => {
    it('adds a chip on Enter and on blur, ignoring blank text', () => {
        const { onChange, input } = setup(['a']);
        fireEvent.change(input, { target: { value: ' b ' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenLastCalledWith(['a', 'b']);
        fireEvent.change(input, { target: { value: 'c' } });
        fireEvent.blur(input);
        expect(onChange).toHaveBeenLastCalledWith(['a', 'c']);
        onChange.mockClear();
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).not.toHaveBeenCalled();
    });

    it('does not commit on Enter while an IME composition is confirming', () => {
        const { onChange, input } = setup([]);
        fireEvent.change(input, { target: { value: 'にほ' } });
        fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
        fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
        expect(onChange).not.toHaveBeenCalled();
    });

    it('commits typed separators, removes chips, and Backspace removes the last one', () => {
        const { onChange, input } = setup(['a', 'b']);
        fireEvent.change(input, { target: { value: 'x, y,z' } });
        expect(onChange).toHaveBeenLastCalledWith(['a', 'b', 'x', 'y']);
        fireEvent.click(screen.getByRole('button', { name: 'remove a' }));
        expect(onChange).toHaveBeenLastCalledWith(['b']);
        fireEvent.change(input, { target: { value: '' } });
        fireEvent.keyDown(input, { key: 'Backspace' });
        expect(onChange).toHaveBeenLastCalledWith(['a']);
    });
});
