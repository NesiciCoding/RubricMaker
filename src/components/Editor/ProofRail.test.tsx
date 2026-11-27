import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ProofRail from './ProofRail';
import type { ProofRailRow } from './useProofRail';
import type { DocumentMark } from '../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => (values ? `${key}|${JSON.stringify(values)}` : key),
    }),
}));

const makeMark = (overrides: Partial<DocumentMark> = {}): DocumentMark => ({
    id: 'm1',
    attachmentId: 'a1',
    authorId: 'u1',
    symbolId: 'del',
    anchor: { from: 1, to: 6 },
    status: 'noted',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

const makeRow = (overrides: Partial<ProofRailRow> = {}): ProofRailRow => ({
    id: '1',
    line: 1,
    ids: ['m1'],
    center: 210,
    top: 200,
    drift: 0,
    stacked: false,
    overflow: false,
    multiLine: false,
    marks: [makeMark()],
    ...overrides,
});

const BOX = { top: 96, left: 804, height: 1123, width: 794 };

describe('ProofRail', () => {
    it('renders one chip per row, positioned on the rail', () => {
        render(
            <ProofRail
                rows={[
                    makeRow(),
                    makeRow({ id: '2', line: 2, top: 228, center: 238, ids: ['m2'], marks: [makeMark({ id: 'm2' })] }),
                ]}
                box={BOX}
                activeLine={null}
                onSelectLine={vi.fn()}
            />
        );

        const buttons = screen.getAllByRole('button');
        expect(buttons).toHaveLength(2);
        expect(buttons[0]).toHaveAttribute('data-mark-line', '1');
        expect(buttons[1]).toHaveStyle({ top: '228px' });
        expect(screen.getByRole('group', { name: 'proofMarks.rail.label' })).toHaveStyle({ left: '804px' });
    });

    it('draws the registry glyph and names the mark with its instruction and line', () => {
        render(<ProofRail rows={[makeRow()]} box={BOX} activeLine={null} onSelectLine={vi.fn()} />);

        expect(document.querySelector('[data-mark-glyph="del"]')).toBeInTheDocument();
        const button = screen.getByRole('button');
        expect(button.getAttribute('aria-label')).toContain('proofMarks.rail.chipLabel');
        expect(button.getAttribute('aria-label')).toContain('"line":1');
        expect(button.getAttribute('aria-label')).toContain('proofMarks.del.label');
    });

    it('gives a letter chip the wider box and a grouped chip a count badge', () => {
        render(
            <ProofRail
                rows={[
                    makeRow({ marks: [makeMark({ symbolId: 'sp' })] }),
                    makeRow({
                        id: '2',
                        line: 2,
                        ids: ['m2', 'm3'],
                        marks: [makeMark({ id: 'm2' }), makeMark({ id: 'm3', symbolId: 'caps' })],
                    }),
                ]}
                box={BOX}
                activeLine={null}
                onSelectLine={vi.fn()}
            />
        );

        const [single, grouped] = screen.getAllByRole('button');
        expect(single).toHaveStyle({ width: '36px' });
        expect(grouped).toHaveStyle({ width: '44px' });
        expect(grouped.textContent).toContain('2');
        expect(grouped.getAttribute('aria-label')).toContain('"count":2');
        expect(grouped.getAttribute('aria-label')).toContain('proofMarks.caps.label');
    });

    it('marks a rejected chip with the muted ink and a strike instead of opacity', () => {
        render(
            <ProofRail
                rows={[makeRow({ marks: [makeMark({ status: 'rejected' })] })]}
                box={BOX}
                activeLine={null}
                onSelectLine={vi.fn()}
            />
        );

        expect(screen.getByRole('button')).toHaveStyle({ color: '#534d45' });
    });

    it('marks an accepted chip with the accepted ink', () => {
        render(
            <ProofRail
                rows={[makeRow({ marks: [makeMark({ status: 'accepted' })] })]}
                box={BOX}
                activeLine={null}
                onSelectLine={vi.fn()}
            />
        );

        expect(screen.getByRole('button')).toHaveStyle({ color: '#08473e' });
    });

    it('flags a mark that spans more than one line', () => {
        render(<ProofRail rows={[makeRow({ multiLine: true })]} box={BOX} activeLine={null} onSelectLine={vi.fn()} />);

        const button = screen.getByRole('button');
        expect(button.textContent).toContain('↳');
        expect(button.getAttribute('aria-label')).toContain('proofMarks.rail.spansLines');
    });

    it('draws a leader line and tick for a stacked chip', () => {
        render(
            <ProofRail
                rows={[makeRow({ stacked: true, top: 214, drift: 14, overflow: false })]}
                box={BOX}
                activeLine={null}
                onSelectLine={vi.fn()}
            />
        );

        expect(document.querySelector('.proof-rail-leader')).toBeInTheDocument();
        expect(document.querySelector('.proof-rail-tick')).toBeInTheDocument();
    });

    it('opens the line panel on click, highlights the line, and closes on a second click', () => {
        const onSelectLine = vi.fn();
        const { rerender } = render(
            <ProofRail rows={[makeRow({ line: 3 })]} box={BOX} activeLine={null} onSelectLine={onSelectLine} />
        );
        const chip = screen.getByRole('button', { name: /proofMarks\.rail\.chipLabel/ });

        fireEvent.click(chip);
        expect(onSelectLine).toHaveBeenCalledWith(3);
        expect(chip).toHaveAttribute('aria-expanded', 'true');
        expect(chip).toHaveAttribute('aria-haspopup', 'dialog');
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        rerender(<ProofRail rows={[makeRow({ line: 3 })]} box={BOX} activeLine={3} onSelectLine={onSelectLine} />);
        expect(chip).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(screen.getByRole('button', { name: /proofMarks\.rail\.chipLabel/ }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('moves one tab stop through the chips with the arrow keys', () => {
        render(
            <ProofRail
                rows={[
                    makeRow({ id: '1', line: 1, ids: ['m1'], marks: [makeMark()] }),
                    makeRow({ id: '2', line: 2, top: 228, ids: ['m2'], marks: [makeMark({ id: 'm2' })] }),
                    makeRow({ id: '3', line: 3, top: 256, ids: ['m3'], marks: [makeMark({ id: 'm3' })] }),
                ]}
                box={BOX}
                activeLine={null}
                onSelectLine={vi.fn()}
            />
        );

        const chips = screen.getAllByRole('button');
        expect(chips.map((chip) => chip.tabIndex)).toEqual([0, -1, -1]);

        chips[0]!.focus();
        fireEvent.keyDown(chips[0]!, { key: 'ArrowDown' });
        expect(chips[1]).toHaveFocus();
        expect(chips.map((chip) => chip.tabIndex)).toEqual([-1, 0, -1]);

        fireEvent.keyDown(chips[1]!, { key: 'End' });
        expect(chips[2]).toHaveFocus();

        fireEvent.keyDown(chips[2]!, { key: 'ArrowUp' });
        expect(chips[1]).toHaveFocus();
    });

    it('closes the panel on Escape and returns focus to the chip', () => {
        render(
            <ProofRail
                rows={[
                    makeRow({ id: '1', line: 1, ids: ['m1'], marks: [makeMark()] }),
                    makeRow({ id: '2', line: 2, top: 228, ids: ['m2'], marks: [makeMark({ id: 'm2' })] }),
                ]}
                box={BOX}
                activeLine={null}
                onSelectLine={vi.fn()}
            />
        );

        const chips = screen.getAllByRole('button');
        fireEvent.click(chips[1]!);
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(chips[1]).toHaveFocus();
    });

    it('announces a summary of the rail for screen readers', () => {
        render(
            <ProofRail
                rows={[
                    makeRow({ id: '1', line: 1, ids: ['m1', 'm2'], marks: [makeMark(), makeMark({ id: 'm2' })] }),
                    makeRow({ id: '2', line: 2, top: 228, ids: ['m3'], marks: [makeMark({ id: 'm3' })] }),
                ]}
                box={BOX}
                activeLine={null}
                onSelectLine={vi.fn()}
            />
        );

        const status = screen.getByRole('status');
        expect(status.textContent).toContain('proofMarks.rail.summary');
        expect(status.textContent).toContain('"count":3');
        expect(status.textContent).toContain('"lines":2');
    });

    it('renders nothing but the empty group when there are no rows', () => {
        render(<ProofRail rows={[]} box={BOX} activeLine={null} onSelectLine={vi.fn()} />);
        expect(screen.queryAllByRole('button')).toHaveLength(0);
    });
});

describe('ProofRail a11y', () => {
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

    it('passes axe with the reveal panel open', async () => {
        const { container } = render(
            <ProofRail
                rows={[
                    makeRow({
                        id: '1',
                        line: 1,
                        ids: ['m1', 'm2'],
                        marks: [makeMark({ payload: { text: 'receive' } }), makeMark({ id: 'm2', symbolId: 'sp' })],
                    }),
                ]}
                box={BOX}
                activeLine={null}
                onSelectLine={vi.fn()}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /chipLabel/ }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        await expectNoViolations(container);
    });

    it('passes axe when the rail is closed', async () => {
        const { container } = render(
            <ProofRail rows={[makeRow()]} box={BOX} activeLine={null} onSelectLine={vi.fn()} />
        );
        await expectNoViolations(container);
    });
});
