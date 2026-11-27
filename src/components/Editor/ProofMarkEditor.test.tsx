import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DocumentMark } from '../../types';
import ProofMarkEditor, { type ProofMarkEditorProps } from './ProofMarkEditor';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const mark = (overrides: Partial<DocumentMark> = {}): DocumentMark => ({
    id: 'm1',
    attachmentId: 'a1',
    authorId: 't1',
    symbolId: 'sp',
    anchor: { from: 2, to: 6 },
    snippetHash: 'abc',
    status: 'noted',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
});

function renderEditor(overrides: Partial<ProofMarkEditorProps> = {}) {
    const props: ProofMarkEditorProps = {
        marks: [mark()],
        selection: null,
        canUndo: false,
        onEdit: vi.fn(),
        onMove: vi.fn(),
        onDelete: vi.fn(),
        onAccept: vi.fn(),
        onReject: vi.fn(),
        onAcceptAllFormatting: vi.fn(),
        formattingMarkCount: 0,
        onUndo: vi.fn(),
        onDismiss: vi.fn(),
        ...overrides,
    };
    render(<ProofMarkEditor {...props} />);
    return props;
}

describe('ProofMarkEditor', () => {
    beforeEach(() => vi.clearAllMocks());

    it('lists each selected mark with its instruction label', () => {
        renderEditor({ marks: [mark(), mark({ id: 'm2', symbolId: 'ital' })] });

        expect(screen.getByRole('group', { name: 'proofMarks.edit.label' })).toBeInTheDocument();
        const spRow = document.querySelector('[data-mark-id="m1"]') as HTMLElement;
        const italRow = document.querySelector('[data-mark-id="m2"]') as HTMLElement;
        expect(spRow.querySelector('p')?.textContent).toContain('proofMarks.sp.label');
        expect(italRow.querySelector('p')?.textContent).toContain('proofMarks.ital.label');
    });

    it('hands the note to the caller on blur and on Enter', () => {
        const props = renderEditor();
        const note = screen.getByLabelText('proofMarks.edit.note');

        fireEvent.change(note, { target: { value: '  wrong tense  ' } });
        fireEvent.blur(note);
        expect(props.onEdit).toHaveBeenCalledWith(mark(), { note: '  wrong tense  ' });

        fireEvent.change(note, { target: { value: 'again' } });
        fireEvent.keyDown(note, { key: 'Enter' });
        expect(props.onEdit).toHaveBeenLastCalledWith(mark(), { note: 'again' });
    });

    it('starts the fields from the stored mark', () => {
        renderEditor({ marks: [mark({ note: 'check this', payload: { text: 'the' } })] });

        expect(screen.getByLabelText('proofMarks.edit.note')).toHaveValue('check this');
        expect(screen.getByLabelText('proofMarks.edit.replacement')).toHaveValue('the');
    });

    it('offers replacement text only for the symbols that write text', () => {
        const { rerender } = render(
            <ProofMarkEditor
                marks={[mark()]}
                selection={null}
                canUndo={false}
                onEdit={vi.fn()}
                onMove={vi.fn()}
                onDelete={vi.fn()}
                onAccept={vi.fn()}
                onReject={vi.fn()}
                onAcceptAllFormatting={vi.fn()}
                formattingMarkCount={0}
                onUndo={vi.fn()}
                onDismiss={vi.fn()}
            />
        );
        expect(screen.getByLabelText('proofMarks.edit.replacement')).toBeInTheDocument();

        rerender(
            <ProofMarkEditor
                marks={[mark({ symbolId: 'ital' })]}
                selection={null}
                canUndo={false}
                onEdit={vi.fn()}
                onMove={vi.fn()}
                onDelete={vi.fn()}
                onAccept={vi.fn()}
                onReject={vi.fn()}
                onAcceptAllFormatting={vi.fn()}
                formattingMarkCount={0}
                onUndo={vi.fn()}
                onDismiss={vi.fn()}
            />
        );
        expect(screen.queryByLabelText('proofMarks.edit.replacement')).not.toBeInTheDocument();
    });

    it('changes the symbol through the select', () => {
        const props = renderEditor();

        fireEvent.change(screen.getByLabelText('proofMarks.edit.symbol'), { target: { value: 'bf' } });
        expect(props.onEdit).toHaveBeenCalledWith(mark(), { symbolId: 'bf' });
    });

    it('disables moving until there is a selection to move to', () => {
        const props = renderEditor();
        const move = screen.getByRole('button', { name: 'proofMarks.edit.moveHere' });

        expect(move).toBeDisabled();
        expect(move).toHaveAttribute('title', 'proofMarks.edit.noSelection');
        expect(props.onMove).not.toHaveBeenCalled();
    });

    it('moves the mark once there is a selection', () => {
        const props = renderEditor({ selection: { from: 8, to: 12 } });
        const move = screen.getByRole('button', { name: 'proofMarks.edit.moveHere' });

        expect(move).toBeEnabled();
        fireEvent.click(move);
        expect(props.onMove).toHaveBeenCalledWith(mark());
    });

    it('deletes the mark from its own row', () => {
        const props = renderEditor();

        fireEvent.click(screen.getByRole('button', { name: /proofMarks.edit.delete/ }));
        expect(props.onDelete).toHaveBeenCalledWith(mark());
    });

    it('disables undo until there is mark history', () => {
        const props = renderEditor();
        expect(screen.getByRole('button', { name: 'proofMarks.edit.undo' })).toBeDisabled();
        expect(props.onUndo).not.toHaveBeenCalled();
    });

    it('undoes the last mark change', () => {
        const props = renderEditor({ canUndo: true });

        fireEvent.click(screen.getByRole('button', { name: 'proofMarks.edit.undo' }));
        expect(props.onUndo).toHaveBeenCalledTimes(1);
    });

    it('closes the editor', () => {
        const props = renderEditor();

        fireEvent.click(screen.getByRole('button', { name: 'proofMarks.edit.close' }));
        expect(props.onDismiss).toHaveBeenCalledTimes(1);
    });
});

describe('ProofMarkEditor apply', () => {
    beforeEach(() => vi.clearAllMocks());

    it('offers a decision only for the formatting symbols', () => {
        renderEditor({ marks: [mark({ symbolId: 'ital' }), mark({ id: 'm2', symbolId: 'sp' })] });

        expect(screen.getAllByRole('button', { name: /proofMarks\.apply\.accept:/ })).toHaveLength(1);
        expect(screen.getAllByRole('button', { name: /proofMarks\.apply\.reject:/ })).toHaveLength(1);
        expect(screen.getByRole('button', { name: 'proofMarks.apply.accept: proofMarks.ital.label' })).toBeEnabled();
    });

    it('hands the decision to the caller with the mark', () => {
        const props = renderEditor({ marks: [mark({ symbolId: 'bf' })] });

        fireEvent.click(screen.getByRole('button', { name: /proofMarks\.apply\.accept:/ }));
        expect(props.onAccept).toHaveBeenCalledWith(mark({ symbolId: 'bf' }));

        fireEvent.click(screen.getByRole('button', { name: /proofMarks\.apply\.reject:/ }));
        expect(props.onReject).toHaveBeenCalledWith(mark({ symbolId: 'bf' }));
    });

    it('shows the recorded decision and disables the side already taken', () => {
        renderEditor({ marks: [mark({ symbolId: 'ital', status: 'accepted' })] });

        expect(screen.getByText('proofMarks.apply.status.accepted')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /proofMarks\.apply\.accept:/ })).toBeDisabled();
        expect(screen.getByRole('button', { name: /proofMarks\.apply\.reject:/ })).toBeEnabled();
    });

    it('shows the derived suggestion and offers propose for a text mark', () => {
        const props = renderEditor({
            marks: [mark({ symbolId: 'del' })],
            suggestions: {
                m1: { key: 'proofMarks.apply.suggestion.deleteWithSpace', values: { text: 'recieve' } },
            },
            onPropose: vi.fn(),
        });

        expect(screen.getByText('proofMarks.apply.suggestion.deleteWithSpace')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /proofMarks\.apply\.propose:/ }));
        expect(props.onPropose).toHaveBeenCalledWith(mark({ symbolId: 'del' }));
    });

    it('offers accept for a text mark with a plan', () => {
        const props = renderEditor({
            marks: [mark({ symbolId: 'comma' })],
            suggestions: { m1: { key: 'proofMarks.apply.suggestion.insert', values: { text: ',' } } },
        });

        const accept = screen.getByRole('button', { name: /proofMarks\.apply\.accept:/ });
        expect(accept).toBeEnabled();

        fireEvent.click(accept);
        expect(props.onAccept).toHaveBeenCalledWith(mark({ symbolId: 'comma' }));
    });

    it('shows an advisory reason and hides accept for an ambiguous mark', () => {
        renderEditor({
            marks: [mark({ symbolId: 'tr' })],
            suggestions: {
                m1: { key: 'proofMarks.apply.advisory', reasonKey: 'proofMarks.apply.reason.needsTwoWords' },
            },
        });

        expect(screen.getByText('proofMarks.apply.advisory')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /proofMarks\.apply\.accept:/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /proofMarks\.apply\.reject:/ })).toBeInTheDocument();
    });

    it('hides the accept controls when the surface cannot save the document', () => {
        renderEditor({
            marks: [mark({ symbolId: 'ital' })],
            onAccept: undefined,
            onAcceptAllFormatting: undefined,
        });

        expect(screen.queryByRole('button', { name: /proofMarks\.apply\.accept:/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'proofMarks.apply.acceptAll' })).not.toBeInTheDocument();
        expect(screen.getByText('proofMarks.apply.status.noted')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /proofMarks\.apply\.reject:/ })).toBeInTheDocument();
    });

    it('disables the one batch action when the page has no formatting marks', () => {
        const props = renderEditor({ formattingMarkCount: 0 });
        const all = screen.getByRole('button', { name: 'proofMarks.apply.acceptAll' });

        expect(all).toBeDisabled();
        expect(all).toHaveAttribute('title', 'proofMarks.apply.noFormatting');
        fireEvent.click(all);
        expect(props.onAcceptAllFormatting).not.toHaveBeenCalled();
    });

    it('accepts every formatting mark on the page in one action', () => {
        const props = renderEditor({ formattingMarkCount: 2 });
        const all = screen.getByRole('button', { name: 'proofMarks.apply.acceptAll' });

        expect(all).toBeEnabled();
        fireEvent.click(all);
        expect(props.onAcceptAllFormatting).toHaveBeenCalledTimes(1);
    });
});

describe('ProofMarkEditor a11y', () => {
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

    it('passes axe with the panel named and every field labelled', async () => {
        const { container } = render(
            <ProofMarkEditor
                marks={[mark({ note: 'check the tense', payload: { text: 'the' } })]}
                selection={null}
                canUndo={false}
                onEdit={vi.fn()}
                onMove={vi.fn()}
                onDelete={vi.fn()}
                onAccept={vi.fn()}
                onReject={vi.fn()}
                onAcceptAllFormatting={vi.fn()}
                formattingMarkCount={0}
                onUndo={vi.fn()}
                onDismiss={vi.fn()}
            />
        );

        expect(screen.getByRole('group', { name: 'proofMarks.edit.label' })).toBeInTheDocument();
        expect(screen.getByLabelText('proofMarks.edit.symbol')).toHaveAccessibleName(/proofMarks\.edit\.symbol/);
        expect(screen.getByLabelText('proofMarks.edit.note')).toHaveAccessibleName(/proofMarks\.edit\.note/);
        expect(screen.getByLabelText('proofMarks.edit.replacement')).toHaveAccessibleName(
            /proofMarks\.edit\.replacement/
        );
        expect(screen.getByRole('button', { name: /proofMarks\.edit\.delete/ })).toHaveAccessibleName(
            'proofMarks.edit.delete: proofMarks.sp.label'
        );

        await expectNoViolations(container);
    });

    it('passes axe while move and undo are disabled', async () => {
        const { container } = render(
            <ProofMarkEditor
                marks={[mark()]}
                selection={null}
                canUndo={false}
                onEdit={vi.fn()}
                onMove={vi.fn()}
                onDelete={vi.fn()}
                onAccept={vi.fn()}
                onReject={vi.fn()}
                onAcceptAllFormatting={vi.fn()}
                formattingMarkCount={0}
                onUndo={vi.fn()}
                onDismiss={vi.fn()}
            />
        );

        const move = screen.getByRole('button', { name: 'proofMarks.edit.moveHere' });
        expect(move).toBeDisabled();
        expect(move).toHaveAttribute('title', 'proofMarks.edit.noSelection');
        expect(screen.getByRole('button', { name: 'proofMarks.edit.undo' })).toBeDisabled();

        await expectNoViolations(container);
    });

    it('passes axe with move and undo available for several marks', async () => {
        const { container } = render(
            <ProofMarkEditor
                marks={[mark(), mark({ id: 'm2', symbolId: 'ital', note: 'italicise the title' })]}
                selection={{ from: 8, to: 14 }}
                canUndo
                onEdit={vi.fn()}
                onMove={vi.fn()}
                onDelete={vi.fn()}
                onAccept={vi.fn()}
                onReject={vi.fn()}
                onAcceptAllFormatting={vi.fn()}
                formattingMarkCount={0}
                onUndo={vi.fn()}
                onDismiss={vi.fn()}
            />
        );

        for (const move of screen.getAllByRole('button', { name: 'proofMarks.edit.moveHere' })) {
            expect(move).toBeEnabled();
        }
        expect(screen.getByRole('button', { name: 'proofMarks.edit.undo' })).toBeEnabled();

        await expectNoViolations(container);
    });

    it('passes axe with a derived suggestion and the propose action', async () => {
        const { container } = render(
            <ProofMarkEditor
                marks={[mark({ symbolId: 'del' })]}
                selection={null}
                canUndo={false}
                onEdit={vi.fn()}
                onMove={vi.fn()}
                onDelete={vi.fn()}
                onAccept={vi.fn()}
                onPropose={vi.fn()}
                onReject={vi.fn()}
                suggestions={{
                    m1: { key: 'proofMarks.apply.suggestion.deleteWithSpace', values: { text: 'recieve' } },
                }}
                onAcceptAllFormatting={vi.fn()}
                formattingMarkCount={0}
                onUndo={vi.fn()}
                onDismiss={vi.fn()}
            />
        );

        expect(screen.getByText('proofMarks.apply.suggestion.deleteWithSpace')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /proofMarks\.apply\.propose:/ })).toHaveAccessibleName(
            'proofMarks.apply.propose: proofMarks.del.label'
        );
        expect(screen.getByRole('button', { name: /proofMarks\.apply\.accept:/ })).toBeEnabled();

        await expectNoViolations(container);
    });

    it('passes axe with an advisory mark and no accept action', async () => {
        const { container } = render(
            <ProofMarkEditor
                marks={[mark({ symbolId: 'tr' })]}
                selection={null}
                canUndo={false}
                onEdit={vi.fn()}
                onMove={vi.fn()}
                onDelete={vi.fn()}
                onAccept={vi.fn()}
                onReject={vi.fn()}
                suggestions={{
                    m1: {
                        key: 'proofMarks.apply.advisory',
                        reasonKey: 'proofMarks.apply.reason.needsTwoWords',
                    },
                }}
                onAcceptAllFormatting={vi.fn()}
                formattingMarkCount={0}
                onUndo={vi.fn()}
                onDismiss={vi.fn()}
            />
        );

        expect(screen.getByText('proofMarks.apply.advisory')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /proofMarks\.apply\.accept:/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /proofMarks\.apply\.reject:/ })).toBeEnabled();

        await expectNoViolations(container);
    });
});
