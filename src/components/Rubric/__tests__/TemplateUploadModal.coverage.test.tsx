import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TemplateUploadModal from '../TemplateUploadModal';

const { mockFileToDataUrl, mockParseTemplateHeaders, mockParseStyleTemplate } = vi.hoisted(() => ({
    mockFileToDataUrl: vi.fn(),
    mockParseTemplateHeaders: vi.fn(),
    mockParseStyleTemplate: vi.fn(),
}));

vi.mock('../../../utils/fileToDataUrl', () => ({ fileToDataUrl: mockFileToDataUrl }));
vi.mock('../../../utils/docxTemplateExport', () => ({ parseTemplateHeaders: mockParseTemplateHeaders }));
vi.mock('../../../utils/docxStyleTemplate', () => ({ parseStyleTemplate: mockParseStyleTemplate }));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
    Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const tableFile = new File(['docx-bytes'], 'template.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});

// The real Radix Modal renders through a portal, so query the whole document.
function fileInput() {
    return document.querySelector('input[type="file"]') as HTMLInputElement;
}

function dropZone() {
    return screen.getByText('Drop .docx template here or click to browse');
}

describe('TemplateUploadModal coverage', () => {
    const mockOnClose = vi.fn();
    const mockOnSave = vi.fn();

    beforeEach(() => {
        mockOnClose.mockClear();
        mockOnSave.mockClear();
        mockFileToDataUrl.mockReset();
        mockParseTemplateHeaders.mockReset();
        mockParseStyleTemplate.mockReset();
        mockFileToDataUrl.mockResolvedValue('data:application/octet-stream;base64,AA==');
    });

    it('switches between table and style kinds', () => {
        render(<TemplateUploadModal onClose={mockOnClose} onSave={mockOnSave} />);
        // Table kind is default → the Trans intro shows its children.
        expect(screen.getByText(/Upload a blank/)).toBeInTheDocument();
        fireEvent.click(screen.getByText('settings.template_kind_style'));
        expect(screen.getByText('settings.template_intro_style')).toBeInTheDocument();
        fireEvent.click(screen.getByText('settings.template_kind_table'));
        expect(screen.getByText(/Upload a blank/)).toBeInTheDocument();
    });

    it('rejects non-docx files', () => {
        render(<TemplateUploadModal onClose={mockOnClose} onSave={mockOnSave} />);
        fireEvent.change(fileInput(), {
            target: { files: [new File(['x'], 'notes.pdf', { type: 'application/pdf' })] },
        });
        expect(screen.getByText('Please upload a .docx (Word) file.')).toBeInTheDocument();
        expect(mockFileToDataUrl).not.toHaveBeenCalled();
    });

    it('parses a table template, autofills the name, and saves it', async () => {
        mockParseTemplateHeaders.mockResolvedValue({ levelHeaders: ['Excellent', 'Good'], headerColor: '#3b82f6' });
        render(<TemplateUploadModal onClose={mockOnClose} onSave={mockOnSave} />);
        fireEvent.change(fileInput(), { target: { files: [tableFile] } });

        expect(await screen.findByText(/2 levels detected/)).toBeInTheDocument();
        expect(screen.getByText('Excellent')).toBeInTheDocument();
        expect(screen.getByText('Good')).toBeInTheDocument();
        // Name auto-filled from the file name without the extension.
        expect(screen.getByDisplayValue('template')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Save Template'));
        expect(mockOnSave).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: 'table',
                name: 'template',
                levelHeaders: ['Excellent', 'Good'],
                headerColor: '#3b82f6',
            })
        );
    });

    it('saves with a user-provided name', async () => {
        mockParseTemplateHeaders.mockResolvedValue({ levelHeaders: ['A'], headerColor: '#000000' });
        render(<TemplateUploadModal onClose={mockOnClose} onSave={mockOnSave} />);
        fireEvent.change(fileInput(), { target: { files: [tableFile] } });
        fireEvent.change(await screen.findByDisplayValue('template'), { target: { value: 'School Rubric' } });
        fireEvent.click(screen.getByText('Save Template'));
        expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'School Rubric' }));
    });

    it('warns when no level headers are detected', async () => {
        mockParseTemplateHeaders.mockResolvedValue({ levelHeaders: [], headerColor: '#3b82f6' });
        render(<TemplateUploadModal onClose={mockOnClose} onSave={mockOnSave} />);
        fireEvent.change(fileInput(), { target: { files: [tableFile] } });
        expect(await screen.findByText(/0 levels detected/)).toBeInTheDocument();
        expect(screen.getByText(/No level headers detected/)).toBeInTheDocument();
    });

    it('switches files back to the drop zone after parsing', async () => {
        mockParseTemplateHeaders.mockResolvedValue({ levelHeaders: ['A'], headerColor: '#000000' });
        render(<TemplateUploadModal onClose={mockOnClose} onSave={mockOnSave} />);
        fireEvent.change(fileInput(), { target: { files: [tableFile] } });
        fireEvent.click(await screen.findByText('← Use a different file'));
        // Drop zone + kind toggle are back, and the drop zone click opens the file input.
        expect(dropZone()).toBeInTheDocument();
        fireEvent.click(dropZone());
        expect(screen.getByText('settings.template_kind_table')).toBeInTheDocument();
    });

    it('parses a style template with fonts and saves it', async () => {
        mockParseStyleTemplate.mockResolvedValue({ headingFont: 'Arial', bodyFont: 'Georgia' });
        render(<TemplateUploadModal onClose={mockOnClose} onSave={mockOnSave} />);
        fireEvent.click(screen.getByText('settings.template_kind_style'));
        fireEvent.change(fileInput(), { target: { files: [tableFile] } });

        expect(await screen.findByText('settings.template_style_parsed')).toBeInTheDocument();
        expect(screen.getByText(/heading.*Arial.*body.*Georgia/)).toBeInTheDocument();
        expect(screen.getByDisplayValue('template')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Save Template'));
        expect(mockOnSave).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: 'style',
                name: 'template',
                levelHeaders: [],
                headingFont: 'Arial',
                bodyFont: 'Georgia',
            })
        );
    });

    it('reports when a style template has no detected fonts', async () => {
        mockParseStyleTemplate.mockResolvedValue({});
        render(<TemplateUploadModal onClose={mockOnClose} onSave={mockOnSave} />);
        fireEvent.click(screen.getByText('settings.template_kind_style'));
        fireEvent.change(fileInput(), { target: { files: [tableFile] } });
        const parsed = await screen.findByText('settings.template_style_parsed');
        expect(parsed.parentElement!.textContent).toContain('settings.template_style_none_detected');
    });

    it('falls back to the file name and default fonts in style summaries', async () => {
        // bodyFont set, headingFont unset → the summary shows the default heading font.
        mockParseStyleTemplate.mockResolvedValue({ bodyFont: 'Georgia' });
        render(<TemplateUploadModal onClose={mockOnClose} onSave={mockOnSave} />);
        fireEvent.click(screen.getByText('settings.template_kind_style'));
        fireEvent.change(fileInput(), { target: { files: [tableFile] } });
        await screen.findByText('settings.template_style_parsed');

        // The style name input is editable; clearing it makes the save fall back to the file name.
        const styleName = document.getElementById('style-template-name') as HTMLInputElement;
        fireEvent.change(styleName, { target: { value: '' } });
        fireEvent.click(screen.getByText('Save Template'));
        expect(mockOnSave).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'style', name: 'template', headingFont: undefined, bodyFont: 'Georgia' })
        );
    });

    it('switches files back after a style parse', async () => {
        mockParseStyleTemplate.mockResolvedValue({ headingFont: 'Arial' });
        render(<TemplateUploadModal onClose={mockOnClose} onSave={mockOnSave} />);
        fireEvent.click(screen.getByText('settings.template_kind_style'));
        fireEvent.change(fileInput(), { target: { files: [tableFile] } });
        fireEvent.click(await screen.findByText('settings.template_use_different_file'));
        expect(dropZone()).toBeInTheDocument();
    });

    it('shows the loading state while parsing', async () => {
        let resolveData: (v: string) => void = () => undefined;
        mockFileToDataUrl.mockReturnValue(new Promise<string>((res) => (resolveData = res)));
        mockParseTemplateHeaders.mockResolvedValue({ levelHeaders: [], headerColor: '#3b82f6' });
        render(<TemplateUploadModal onClose={mockOnClose} onSave={mockOnSave} />);
        fireEvent.change(fileInput(), { target: { files: [tableFile] } });
        expect(screen.getByText('Extracting template headers…')).toBeInTheDocument();
        await act(async () => resolveData('data:application/octet-stream;base64,AA=='));
        expect(await screen.findByText(/0 levels detected/)).toBeInTheDocument();
    });

    it('shows the style loading state', async () => {
        let resolveData: (v: string) => void = () => undefined;
        mockFileToDataUrl.mockReturnValue(new Promise<string>((res) => (resolveData = res)));
        mockParseStyleTemplate.mockResolvedValue({ headingFont: 'Arial' });
        render(<TemplateUploadModal onClose={mockOnClose} onSave={mockOnSave} />);
        fireEvent.click(screen.getByText('settings.template_kind_style'));
        fireEvent.change(fileInput(), { target: { files: [tableFile] } });
        expect(screen.getByText('settings.template_extracting_style')).toBeInTheDocument();
        await act(async () => resolveData('data:application/octet-stream;base64,AA=='));
        expect(await screen.findByText('settings.template_style_parsed')).toBeInTheDocument();
    });

    it('surfaces parse errors, including non-Error rejections', async () => {
        mockParseTemplateHeaders.mockRejectedValue(new Error('boom'));
        const { unmount } = render(<TemplateUploadModal onClose={mockOnClose} onSave={mockOnSave} />);
        fireEvent.change(fileInput(), { target: { files: [tableFile] } });
        expect(await screen.findByText('Failed to parse template: boom')).toBeInTheDocument();
        unmount();

        mockParseStyleTemplate.mockRejectedValue('raw failure');
        render(<TemplateUploadModal onClose={mockOnClose} onSave={mockOnSave} />);
        fireEvent.click(screen.getByText('settings.template_kind_style'));
        fireEvent.change(fileInput(), { target: { files: [tableFile] } });
        expect(await screen.findByText('Failed to parse template: Unknown error')).toBeInTheDocument();
    });

    it('drops a file onto the zone and ignores empty drops', async () => {
        mockParseTemplateHeaders.mockResolvedValue({ levelHeaders: ['A'], headerColor: '#000000' });
        render(<TemplateUploadModal onClose={mockOnClose} onSave={mockOnSave} />);

        fireEvent.dragOver(dropZone());
        fireEvent.dragLeave(dropZone());
        // Empty drop → nothing happens.
        fireEvent.drop(dropZone(), { dataTransfer: { files: [] } });
        expect(mockParseTemplateHeaders).not.toHaveBeenCalled();

        fireEvent.drop(dropZone(), { dataTransfer: { files: [tableFile] } });
        expect(await screen.findByText(/1 level detected/)).toBeInTheDocument();
    });

    it('ignores empty file selections on the input', () => {
        render(<TemplateUploadModal onClose={mockOnClose} onSave={mockOnSave} />);
        fireEvent.change(fileInput(), { target: { files: [] } });
        expect(mockFileToDataUrl).not.toHaveBeenCalled();
    });

    it('closes via the modal header button and the cancel button', () => {
        render(<TemplateUploadModal onClose={mockOnClose} onSave={mockOnSave} />);
        fireEvent.click(screen.getByLabelText('Close'));
        expect(mockOnClose).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByText('Cancel'));
        expect(mockOnClose).toHaveBeenCalledTimes(2);
    });
});
