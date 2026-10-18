import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Attachment } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));
// A never-resolving conversion keeps the docx preview in its loading state.
vi.mock('../../../utils/textExtraction', () => ({
    convertDocxToHtml: vi.fn(() => new Promise(() => {})),
}));
vi.mock('../../Editor/EssayEditor', () => ({ default: () => <div data-testid="editor" /> }));
vi.mock('../../Editor/CommentableDocumentView', () => ({ default: () => <div data-testid="commentable" /> }));

import AttachmentViewer from '../AttachmentViewer';

const imageAttachment: Attachment = {
    id: 'a1',
    name: 'scan.png',
    mimeType: 'image/png',
    dataUrl: 'data:image/png;base64,AAAA',
    size: 3,
    addedAt: '2024-01-01T00:00:00Z',
};

const docxAttachment: Attachment = {
    ...imageAttachment,
    id: 'a2',
    name: 'essay.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    dataUrl: 'data:application/octet-stream;base64,AAAA',
};

describe('AttachmentViewer loading placeholders', () => {
    it('holds a 4:3 media box for an image until it decodes', () => {
        render(<AttachmentViewer attachment={imageAttachment} />);
        const img = screen.getByAltText('scan.png');
        expect(img.style.display).toBe('none');

        const status = screen.getByRole('status', { name: 'attachments.loading_preview' });
        expect(status.style.aspectRatio).toBe('4 / 3');
        expect(status.querySelectorAll('.skeleton').length).toBeGreaterThan(0);

        fireEvent.load(img);
        expect(img.style.display).toBe('block');
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('shows a page-shaped placeholder while the docx converts', () => {
        render(<AttachmentViewer attachment={docxAttachment} />);
        const status = screen.getByRole('status', { name: 'attachments.loading_preview' });
        // A4/letter page proportions, matching the rendered document preview.
        expect(status.style.aspectRatio).toBe('8.5 / 11');
        expect(screen.queryByTestId('editor')).toBeNull();
    });
});
