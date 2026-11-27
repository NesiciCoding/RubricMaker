import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AttachmentViewer from './AttachmentViewer';
import type { Attachment } from '../../types';

const mocks = vi.hoisted(() => ({
    updateAttachmentCorrection: vi.fn(),
    addDocumentMark: vi.fn(),
    commentable: null as { content: string; onApplyContent?: (html: string) => void } | null,
}));

vi.mock('../../context/AppContext', () => ({
    useAssessment: () => ({ addDocumentMark: mocks.addDocumentMark }),
    useRoster: () => ({ updateAttachmentCorrection: mocks.updateAttachmentCorrection }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../Editor/CommentableDocumentView', () => ({
    default: (props: { content: string; onApplyContent?: (html: string) => void }) => {
        mocks.commentable = props;
        return React.createElement('div', { 'data-testid': 'commentable' }, props.content);
    },
}));

vi.mock('../Editor/EssayEditor', () => ({
    default: () => React.createElement('div', { 'data-testid': 'essay-editor' }),
}));

vi.mock('../../utils/textExtraction', () => ({
    convertDocxToHtml: vi.fn(() => Promise.resolve('<p>Word document</p>')),
}));

const dataUrl = (html: string) => `data:text/html;base64,${btoa(unescape(encodeURIComponent(html)))}`;

function attachment(overrides: Partial<Attachment> = {}): Attachment {
    return {
        id: 'a1',
        name: 'Essay.html',
        mimeType: 'text/html',
        dataUrl: dataUrl('<p>Original essay</p>'),
        size: 20,
        studentId: 's1',
        addedAt: '2024-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('AttachmentViewer corrected copy', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.commentable = null;
    });

    it('renders the corrected copy and hands the writer to the document view', () => {
        render(<AttachmentViewer attachment={attachment({ correctedHtml: '<p>Corrected copy</p>' })} commentable />);

        expect(screen.getByText('attachments.corrected_badge')).toBeInTheDocument();
        expect(mocks.commentable?.content).toContain('Corrected copy');

        mocks.commentable?.onApplyContent?.('<p>Next correction</p>');
        expect(mocks.updateAttachmentCorrection).toHaveBeenCalledWith('a1', '<p>Next correction</p>');
    });

    it('shows the original without losing the corrected copy', () => {
        render(<AttachmentViewer attachment={attachment({ correctedHtml: '<p>Corrected copy</p>' })} commentable />);

        fireEvent.click(screen.getByRole('button', { name: 'attachments.view_original' }));
        expect(mocks.commentable?.content).toContain('Original essay');

        fireEvent.click(screen.getByRole('button', { name: 'attachments.corrected_view' }));
        expect(mocks.commentable?.content).toContain('Corrected copy');
    });

    it('reverts to the original only after confirmation', () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<AttachmentViewer attachment={attachment({ correctedHtml: '<p>Corrected copy</p>' })} commentable />);

        const revert = screen.getByRole('button', { name: 'attachments.corrected_revert' });
        fireEvent.click(revert);
        expect(mocks.updateAttachmentCorrection).not.toHaveBeenCalled();

        confirm.mockReturnValue(true);
        fireEvent.click(revert);
        expect(mocks.updateAttachmentCorrection).toHaveBeenCalledWith('a1', null);
        confirm.mockRestore();
    });

    it('offers no writer for rubric material or a non-commentable viewer', () => {
        const { unmount } = render(<AttachmentViewer attachment={attachment({ studentId: undefined })} commentable />);
        expect(mocks.commentable?.onApplyContent).toBeUndefined();
        unmount();

        mocks.commentable = null;
        render(<AttachmentViewer attachment={attachment()} />);
        expect(mocks.commentable).toBeNull();
        expect(screen.getByTestId('essay-editor')).toBeInTheDocument();
    });

    it('offers no writer for a Word document', async () => {
        render(
            <AttachmentViewer
                attachment={attachment({
                    name: 'Essay.docx',
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    correctedHtml: '<p>Corrected copy</p>',
                })}
                commentable
            />
        );

        await waitFor(() => expect(mocks.commentable).not.toBeNull());
        expect(mocks.commentable?.content).toContain('Word document');
        expect(mocks.commentable?.onApplyContent).toBeUndefined();
    });
});
