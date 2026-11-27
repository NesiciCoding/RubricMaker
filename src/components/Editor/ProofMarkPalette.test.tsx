import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProofMarkPalette from './ProofMarkPalette';
import { PROOF_MARK_IDS, PROOF_MARKS } from '../../data/proofMarks';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => (values ? `${key}|${JSON.stringify(values)}` : key),
    }),
}));

const onPlaceMark = vi.fn();

function symbolButton(id: string) {
    return screen.getByRole('button', { name: PROOF_MARKS[id as keyof typeof PROOF_MARKS].labelKey });
}

function hint() {
    const field = screen.getByLabelText('proofMarks.palette.codeField');
    return document.getElementById(field.getAttribute('aria-describedby') as string) as HTMLElement;
}

describe('ProofMarkPalette', () => {
    it('offers every registry symbol once, grouped by family, with one tab stop', () => {
        render(<ProofMarkPalette onPlaceMark={onPlaceMark} />);

        const buttons = screen.getAllByRole('button');
        expect(buttons).toHaveLength(PROOF_MARK_IDS.length);
        for (const id of PROOF_MARK_IDS) {
            expect(screen.getByRole('button', { name: PROOF_MARKS[id].labelKey })).toBeInTheDocument();
        }
        expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
        expect(buttons[0]).toHaveAttribute('tabindex', '0');
        expect(screen.getByRole('group', { name: 'proofMarks.palette.label' })).toBeInTheDocument();
        // Families are announced with their shortcut, so the tooltip documents it.
        expect(symbolButton('ital').getAttribute('title')).toContain('proofMarks.palette.shortcut');
    });

    it('moves between symbols with the arrow keys, one tab stop following focus', () => {
        render(<ProofMarkPalette onPlaceMark={onPlaceMark} />);
        const del = symbolButton('del');
        del.focus();

        fireEvent.keyDown(del, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(symbolButton('closeup'));
        expect(symbolButton('closeup')).toHaveAttribute('tabindex', '0');
        expect(del).toHaveAttribute('tabindex', '-1');

        fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' });
        expect(document.activeElement).toBe(del);
    });

    it('jumps between families with up and down and reaches the ends with Home and End', () => {
        render(<ProofMarkPalette onPlaceMark={onPlaceMark} />);
        const del = symbolButton('del');
        del.focus();

        fireEvent.keyDown(del, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(symbolButton('ins'));
        fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(symbolButton('tr'));

        fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' });
        expect(document.activeElement).toBe(symbolButton('ins'));

        fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'End' });
        expect(document.activeElement).toBe(symbolButton('query'));
        fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Home' });
        expect(document.activeElement).toBe(symbolButton('del'));
        // Up from the first family wraps to the last one rather than sticking.
        fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' });
        expect(document.activeElement).toBe(symbolButton('query'));
    });

    it('jumps to a family with Alt and its digit', () => {
        render(<ProofMarkPalette onPlaceMark={onPlaceMark} />);
        const del = symbolButton('del');
        del.focus();

        fireEvent.keyDown(del, { key: '4', altKey: true });
        expect(document.activeElement).toBe(symbolButton('caps'));

        fireEvent.keyDown(document.activeElement as HTMLElement, { key: '9', altKey: true });
        expect(document.activeElement).toBe(symbolButton('caps'));
    });

    it('places the symbol a button names', () => {
        render(<ProofMarkPalette onPlaceMark={onPlaceMark} />);
        fireEvent.click(symbolButton('ital'));
        expect(onPlaceMark).toHaveBeenCalledWith('ital');
    });

    it('applies a typed code on Enter and clears the field', () => {
        render(<ProofMarkPalette onPlaceMark={onPlaceMark} />);
        const field = screen.getByLabelText('proofMarks.palette.codeField');

        fireEvent.change(field, { target: { value: ' itla ' } });
        expect(hint()).toHaveTextContent('proofMarks.palette.codeResolved');

        fireEvent.keyDown(field, { key: 'Enter' });
        expect(onPlaceMark).toHaveBeenCalledWith('ital');
        expect(field).toHaveValue('');
    });

    it('offers the resolved symbol when the field is left with ArrowDown', () => {
        render(<ProofMarkPalette onPlaceMark={onPlaceMark} />);
        const field = screen.getByLabelText('proofMarks.palette.codeField');

        fireEvent.change(field, { target: { value: 'bff' } });
        fireEvent.keyDown(field, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(symbolButton('bf'));
    });

    it('applies nothing for an unknown or ambiguous code, and says why', () => {
        render(<ProofMarkPalette onPlaceMark={onPlaceMark} />);
        const field = screen.getByLabelText('proofMarks.palette.codeField');

        fireEvent.change(field, { target: { value: 'zzz' } });
        expect(hint()).toHaveTextContent('proofMarks.palette.codeNoMatch');
        fireEvent.keyDown(field, { key: 'Enter' });

        fireEvent.change(field, { target: { value: 'ali' } });
        expect(hint()).toHaveTextContent('proofMarks.palette.codeAmbiguous');
        fireEvent.keyDown(field, { key: 'Enter' });

        expect(onPlaceMark).not.toHaveBeenCalled();
        expect(field).toHaveValue('ali');
    });

    it('stays inert with a reason when the surface cannot take marks', () => {
        render(<ProofMarkPalette onPlaceMark={onPlaceMark} enabled={false} disabledReason="students cannot mark" />);

        for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
        const field = screen.getByLabelText('proofMarks.palette.codeField');
        expect(field).toBeDisabled();
        expect(screen.getByText('students cannot mark')).toBeInTheDocument();

        fireEvent.change(field, { target: { value: 'ital' } });
        fireEvent.keyDown(field, { key: 'Enter' });
        expect(onPlaceMark).not.toHaveBeenCalled();
    });

    it('asks for a selection when it is inert without a stated reason', () => {
        render(<ProofMarkPalette onPlaceMark={onPlaceMark} enabled={false} />);
        expect(screen.getByText('proofMarks.palette.needSelection')).toBeInTheDocument();
    });
});

describe('ProofMarkPalette a11y', () => {
    const axeOptions = {
        rules: {
            'color-contrast': { enabled: false },
            region: { enabled: false },
        },
    };

    async function expectNoViolations(container: HTMLElement) {
        const { axe } = await import('jest-axe');
        const results = (await axe(container, axeOptions)) as unknown as {
            violations: { id: string; nodes: { target: unknown[] }[] }[];
        };
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual(
            []
        );
    }

    it('passes axe with one tab stop and the code field described by its hint', async () => {
        const { container } = render(<ProofMarkPalette onPlaceMark={onPlaceMark} />);

        const buttons = screen.getAllByRole('button');
        expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
        const field = screen.getByLabelText('proofMarks.palette.codeField');
        expect(hint()).toHaveTextContent('proofMarks.palette.codeHint');
        expect(field).toHaveAccessibleDescription();

        await expectNoViolations(container);
    });

    it('passes axe once the hint answers a typed code', async () => {
        const { container } = render(<ProofMarkPalette onPlaceMark={onPlaceMark} />);

        fireEvent.change(screen.getByLabelText('proofMarks.palette.codeField'), { target: { value: 'ital' } });
        expect(hint()).toHaveTextContent('proofMarks.palette.codeResolved');

        await expectNoViolations(container);
    });

    it('passes axe while inert, with the reason announced through the hint', async () => {
        const { container } = render(
            <ProofMarkPalette onPlaceMark={onPlaceMark} enabled={false} disabledReason="students cannot mark" />
        );

        for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
        expect(screen.getByLabelText('proofMarks.palette.codeField')).toBeDisabled();
        expect(hint()).toHaveTextContent('students cannot mark');

        await expectNoViolations(container);
    });
});
