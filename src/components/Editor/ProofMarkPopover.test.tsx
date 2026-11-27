import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ProofMarkPopover from './ProofMarkPopover';
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
    symbolId: 'sp',
    anchor: { from: 1, to: 8 },
    status: 'noted',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

const ROW: ProofRailRow = {
    id: '9',
    line: 9,
    ids: ['m1', 'm2'],
    center: 210,
    top: 200,
    drift: 0,
    stacked: false,
    overflow: false,
    multiLine: false,
    marks: [makeMark({ payload: { text: 'receive' } }), makeMark({ id: 'm2', symbolId: 'del' })],
};

const ANCHOR = { top: 200, left: 0, width: 44, height: 20 };
const BOUNDS = { top: 0, left: 0, right: 794, bottom: 1123, width: 794 };

function renderPanel(overrides: Partial<React.ComponentProps<typeof ProofMarkPopover>> = {}) {
    return render(
        <ProofMarkPopover
            row={ROW}
            anchor={ANCHOR}
            bounds={BOUNDS}
            dir="ltr"
            titleId="panel-title"
            onClose={vi.fn()}
            {...overrides}
        />
    );
}

describe('ProofMarkPopover', () => {
    it('is a non-modal dialog named by its line header, with a labelled list', () => {
        renderPanel();

        // Non-modal: the rail's chips stay reachable, so Escape or Close is how the panel ends.
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-labelledby', 'panel-title');
        expect(dialog).not.toHaveAttribute('aria-modal');
        expect(screen.getByRole('heading', { level: 3 })).toHaveAttribute('id', 'panel-title');
        expect(screen.getByRole('heading').textContent).toContain('"count":2');
        expect(screen.getByRole('heading').textContent).toContain('"line":9');
        expect(screen.getByRole('list', { name: 'proofMarks.panel.listLabel' })).toBeInTheDocument();
    });

    it('reads each mark as the instruction plus the word written and its replacement', () => {
        renderPanel({ snippetFor: () => 'recieve' });

        const dialog = screen.getByRole('dialog');
        expect(dialog.textContent).toContain('sp');
        expect(dialog.textContent).toContain('proofMarks.sp.label');
        expect(dialog.textContent).toContain('recieve → receive');
        expect(dialog.textContent).toContain('proofMarks.del.label');
    });

    it('shows the replacement even when the anchor no longer resolves', () => {
        renderPanel({ snippetFor: () => null });
        expect(screen.getByText('receive')).toBeInTheDocument();
    });

    it('opens to the right of the chip when there is room', () => {
        renderPanel();
        expect(screen.getByRole('dialog')).toHaveAttribute('data-side', 'right');
    });

    it('flips to the left of the chip when the page edge is in the way', () => {
        renderPanel({ anchor: { top: 200, left: 700, width: 44, height: 20 } });
        expect(screen.getByRole('dialog')).toHaveAttribute('data-side', 'left');
    });

    it('opens with focus on the close button', () => {
        renderPanel();

        expect(screen.getByRole('button', { name: 'proofMarks.panel.close' })).toHaveFocus();
    });

    it('closes on Escape', () => {
        const onClose = vi.fn();
        renderPanel({ onClose });

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes from the close button', () => {
        const onClose = vi.fn();
        renderPanel({ onClose });

        fireEvent.click(screen.getByRole('button', { name: 'proofMarks.panel.close' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe('ProofMarkPopover as a bottom sheet', () => {
    function renderSheet() {
        return render(<ProofMarkPopover variant="sheet" row={ROW} dir="ltr" titleId="sheet-title" onClose={vi.fn()} />);
    }

    it('is fixed to the viewport bottom instead of being placed beside a chip', () => {
        renderSheet();

        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('data-side', 'sheet');
        expect(dialog).toHaveStyle({ position: 'fixed', bottom: '8px' });
        expect(dialog).not.toHaveStyle({ position: 'absolute' });
    });

    it('closes on Escape and opens on its close button without an anchor', () => {
        const onClose = vi.fn();
        render(<ProofMarkPopover variant="sheet" row={ROW} dir="ltr" titleId="sheet-title" onClose={onClose} />);

        expect(screen.getByRole('button', { name: 'proofMarks.panel.close' })).toHaveFocus();

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
