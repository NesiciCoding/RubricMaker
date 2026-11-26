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

const BOX = { top: 96, left: 804, height: 1123 };

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

    it('toggles the pressed state through the line callback', () => {
        const onSelectLine = vi.fn();
        const { rerender } = render(
            <ProofRail rows={[makeRow({ line: 3 })]} box={BOX} activeLine={null} onSelectLine={onSelectLine} />
        );

        fireEvent.click(screen.getByRole('button'));
        expect(onSelectLine).toHaveBeenCalledWith(3);

        rerender(<ProofRail rows={[makeRow({ line: 3 })]} box={BOX} activeLine={3} onSelectLine={onSelectLine} />);
        expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(screen.getByRole('button'));
        expect(onSelectLine).toHaveBeenLastCalledWith(null);
    });

    it('renders nothing but the empty group when there are no rows', () => {
        render(<ProofRail rows={[]} box={BOX} activeLine={null} onSelectLine={vi.fn()} />);
        expect(screen.queryAllByRole('button')).toHaveLength(0);
    });
});
