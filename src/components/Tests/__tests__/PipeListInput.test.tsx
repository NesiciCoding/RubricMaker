import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PipeListInput from '../PipeListInput';

function Controlled({ initial, onChange }: { initial: string[]; onChange: (items: string[]) => void }) {
    const [value, setValue] = useState(initial);
    return (
        <>
            <PipeListInput
                id="p"
                value={value}
                onChange={(items) => {
                    setValue(items);
                    onChange(items);
                }}
            />
            <button type="button" onClick={() => setValue(['reset'])}>
                reset
            </button>
        </>
    );
}

describe('PipeListInput', () => {
    it('keeps a typed trailing space so multi-word answers can be entered', () => {
        const onChange = vi.fn();
        render(<Controlled initial={[]} onChange={onChange} />);
        const input = screen.getByRole('textbox') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'He ' } });
        expect(input.value).toBe('He ');
        fireEvent.change(input, { target: { value: 'He goes to school' } });
        expect(input.value).toBe('He goes to school');
        expect(onChange).toHaveBeenLastCalledWith(['He goes to school']);
    });

    it('keeps a typed separator and reports trimmed alternatives', () => {
        const onChange = vi.fn();
        render(<Controlled initial={['grey']} onChange={onChange} />);
        const input = screen.getByRole('textbox') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'grey | ' } });
        expect(input.value).toBe('grey | ');
        expect(onChange).toHaveBeenLastCalledWith(['grey']);
    });

    it('resyncs when the value changes from outside', () => {
        render(<Controlled initial={['a']} onChange={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'reset' }));
        expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('reset');
    });
});
