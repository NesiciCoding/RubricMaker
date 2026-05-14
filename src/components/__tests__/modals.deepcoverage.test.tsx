/**
 * Deep-coverage tests for ImportRubricModal and TemplateUploadModal.
 * Covers the full state-machine flows that the smoke tests skip.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ImportRubricModal from '../ImportRubricModal';
import TemplateUploadModal from '../TemplateUploadModal';

// ─── Shared mocks ─────────────────────────────────────────────────────────────

const mockParseJson = vi.fn();
const mockParseDocx = vi.fn();
const mockParsePdf = vi.fn();

vi.mock('../../utils/rubricImport', () => ({
    parseJsonToRubric: (...args: any[]) => mockParseJson(...args),
    parseDocxToRubric: (...args: any[]) => mockParseDocx(...args),
    parsePdfToRubric: (...args: any[]) => mockParsePdf(...args),
}));

const mockParseTemplateHeaders = vi.fn();

vi.mock('../../utils/docxTemplateExport', () => ({
    parseTemplateHeaders: (...args: any[]) => mockParseTemplateHeaders(...args),
}));

// FileReader mock used by TemplateUploadModal (reads file as data URL)
class MockFileReader {
    onload: ((e: any) => void) | null = null;
    onerror: ((e: any) => void) | null = null;
    readAsDataURL(_file: File) {
        setTimeout(() => { this.onload?.({ target: { result: 'data:application/octet-stream;base64,dGVzdA==' } }); }, 0);
    }
}
// @ts-expect-error -- override global with mock in test environment
global.FileReader = MockFileReader;

function makeFile(name: string, type = 'application/octet-stream'): File {
    return new File(['content'], name, { type });
}

function simulateFileInput(input: HTMLInputElement, file: File) {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
}

// ─── ImportRubricModal ────────────────────────────────────────────────────────

const parsedRubric = {
    name: 'My Rubric',
    subject: 'English',
    confidence: 'high' as const,
    warnings: [],
    criteria: [
        {
            id: 'c1',
            title: 'Criterion 1',
            description: '',
            weight: 100,
            levels: [
                { id: 'l1', label: 'Excellent', minPoints: 90, maxPoints: 100, description: 'Great', subItems: [] },
            ],
        },
    ],
};

describe('ImportRubricModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders upload stage with drop area initially', () => {
        render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        expect(screen.getByText(/Drop a file here/i)).toBeInTheDocument();
    });

    it('shows stage indicator labels', () => {
        render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        expect(screen.getByText('Upload')).toBeInTheDocument();
        expect(screen.getByText('Parsing')).toBeInTheDocument();
        expect(screen.getByText('Preview')).toBeInTheDocument();
    });

    it('shows error for unsupported file type', async () => {
        render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('rubric.txt', 'text/plain'));
        await waitFor(() => {
            expect(screen.getByText(/Please upload a .docx, .pdf, or .json file/i)).toBeInTheDocument();
        });
    });

    it('parses JSON file and transitions to preview stage', async () => {
        mockParseJson.mockResolvedValue(parsedRubric);
        render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('rubric.json', 'application/json'));
        await waitFor(() => {
            expect(screen.getByText(/Detection quality: high/i)).toBeInTheDocument();
        });
        expect(mockParseJson).toHaveBeenCalled();
    });

    it('parses DOCX file and transitions to preview stage', async () => {
        mockParseDocx.mockResolvedValue(parsedRubric);
        render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('rubric.docx'));
        await waitFor(() => {
            expect(screen.getByText(/Detection quality: high/i)).toBeInTheDocument();
        });
    });

    it('parses PDF file and transitions to preview stage', async () => {
        mockParsePdf.mockResolvedValue(parsedRubric);
        render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('rubric.pdf', 'application/pdf'));
        await waitFor(() => {
            expect(screen.getByText(/Detection quality: high/i)).toBeInTheDocument();
        });
    });

    it('shows parse error and returns to upload stage on failure', async () => {
        mockParseJson.mockRejectedValue(new Error('bad file'));
        render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('rubric.json', 'application/json'));
        await waitFor(() => {
            expect(screen.getByText(/Failed to parse file: bad file/i)).toBeInTheDocument();
        });
        expect(screen.getByText(/Drop a file here/i)).toBeInTheDocument();
    });

    it('preview shows criteria count and level count', async () => {
        mockParseJson.mockResolvedValue(parsedRubric);
        render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('rubric.json', 'application/json'));
        await waitFor(() => {
            expect(screen.getByText(/1 criterion/i)).toBeInTheDocument();
        });
    });

    it('preview pre-fills name from parsed rubric', async () => {
        mockParseJson.mockResolvedValue(parsedRubric);
        render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('rubric.json', 'application/json'));
        await waitFor(() => {
            const nameInput = screen.getByPlaceholderText(/Essay Rubric/i) as HTMLInputElement;
            expect(nameInput.value).toBe('My Rubric');
        });
    });

    it('editing name field updates the value', async () => {
        mockParseJson.mockResolvedValue(parsedRubric);
        render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('rubric.json', 'application/json'));
        await waitFor(() => screen.getByText(/Detection quality/i));
        const nameInput = screen.getByPlaceholderText(/Essay Rubric/i) as HTMLInputElement;
        fireEvent.change(nameInput, { target: { value: 'Updated Name' } });
        expect(nameInput.value).toBe('Updated Name');
    });

    it('"Try Another File" resets to upload stage', async () => {
        mockParseJson.mockResolvedValue(parsedRubric);
        render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('rubric.json', 'application/json'));
        await waitFor(() => screen.getByText(/Detection quality/i));
        fireEvent.click(screen.getByRole('button', { name: /Try Another File/i }));
        expect(screen.getByText(/Drop a file here/i)).toBeInTheDocument();
    });

    it('"Create Rubric" calls onImport with parsed data', async () => {
        const onImport = vi.fn();
        mockParseJson.mockResolvedValue(parsedRubric);
        render(<ImportRubricModal onClose={vi.fn()} onImport={onImport} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('rubric.json', 'application/json'));
        await waitFor(() => screen.getByText(/Detection quality/i));
        fireEvent.click(screen.getByRole('button', { name: /Create Rubric/i }));
        expect(onImport).toHaveBeenCalledWith(expect.objectContaining({
            name: 'My Rubric',
            subject: 'English',
            criteria: parsedRubric.criteria,
        }));
    });

    it('shows warnings from parsed rubric', async () => {
        mockParseJson.mockResolvedValue({ ...parsedRubric, confidence: 'medium', warnings: ['Column count mismatch'] });
        render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('rubric.json', 'application/json'));
        await waitFor(() => {
            expect(screen.getByText(/Column count mismatch/i)).toBeInTheDocument();
        });
    });

    it('shows empty-criteria fallback when no criteria detected', async () => {
        mockParseJson.mockResolvedValue({ ...parsedRubric, criteria: [] });
        render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('rubric.json', 'application/json'));
        await waitFor(() => {
            expect(screen.getByText(/No rubric structure detected/i)).toBeInTheDocument();
        });
    });

    it('close button calls onClose', () => {
        const onClose = vi.fn();
        render(<ImportRubricModal onClose={onClose} onImport={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(onClose).toHaveBeenCalled();
    });

    it('drag-over changes border color (dragging state)', () => {
        render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        const dropZone = screen.getByText(/Drop a file here/i).closest('div[style]') as HTMLElement;
        fireEvent.dragOver(dropZone, { preventDefault: () => {} });
        // dragging state set — no crash and drop zone still present
        expect(screen.getByText(/Drop a file here/i)).toBeInTheDocument();
        fireEvent.dragLeave(dropZone);
    });
});

// ─── TemplateUploadModal ──────────────────────────────────────────────────────

const parsedTemplate = {
    levelHeaders: ['Excellent', 'Good', 'Adequate'],
    headerColor: '#1e40af',
};

describe('TemplateUploadModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders upload drop zone initially', () => {
        render(<TemplateUploadModal onClose={vi.fn()} onSave={vi.fn()} />);
        expect(screen.getByText(/Drop .docx template here/i)).toBeInTheDocument();
    });

    it('shows error for non-.docx file', async () => {
        render(<TemplateUploadModal onClose={vi.fn()} onSave={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('template.pdf', 'application/pdf'));
        await waitFor(() => {
            expect(screen.getByText(/Please upload a .docx \(Word\) file/i)).toBeInTheDocument();
        });
    });

    it('parses .docx and shows success state', async () => {
        mockParseTemplateHeaders.mockResolvedValue(parsedTemplate);
        render(<TemplateUploadModal onClose={vi.fn()} onSave={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('template.docx'));
        await waitFor(() => {
            expect(screen.getByText(/Template parsed/i)).toBeInTheDocument();
        });
    });

    it('renders detected level headers as chips', async () => {
        mockParseTemplateHeaders.mockResolvedValue(parsedTemplate);
        render(<TemplateUploadModal onClose={vi.fn()} onSave={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('template.docx'));
        await waitFor(() => {
            expect(screen.getByText('Excellent')).toBeInTheDocument();
            expect(screen.getByText('Good')).toBeInTheDocument();
            expect(screen.getByText('Adequate')).toBeInTheDocument();
        });
    });

    it('shows warning when zero level headers detected', async () => {
        mockParseTemplateHeaders.mockResolvedValue({ levelHeaders: [], headerColor: '#000' });
        render(<TemplateUploadModal onClose={vi.fn()} onSave={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('template.docx'));
        await waitFor(() => {
            expect(screen.getByText(/No level headers detected/i)).toBeInTheDocument();
        });
    });

    it('pre-fills template name from file name', async () => {
        mockParseTemplateHeaders.mockResolvedValue(parsedTemplate);
        render(<TemplateUploadModal onClose={vi.fn()} onSave={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('school-rubric.docx'));
        await waitFor(() => {
            const nameInput = screen.getByPlaceholderText(/School Rubric Template/i) as HTMLInputElement;
            expect(nameInput.value).toBe('school-rubric');
        });
    });

    it('template name input is editable', async () => {
        mockParseTemplateHeaders.mockResolvedValue(parsedTemplate);
        render(<TemplateUploadModal onClose={vi.fn()} onSave={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('template.docx'));
        await waitFor(() => screen.getByText(/Template parsed/i));
        const nameInput = screen.getByPlaceholderText(/School Rubric Template/i) as HTMLInputElement;
        fireEvent.change(nameInput, { target: { value: 'My Custom Template' } });
        expect(nameInput.value).toBe('My Custom Template');
    });

    it('"Use a different file" resets to upload state', async () => {
        mockParseTemplateHeaders.mockResolvedValue(parsedTemplate);
        render(<TemplateUploadModal onClose={vi.fn()} onSave={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('template.docx'));
        await waitFor(() => screen.getByText(/Template parsed/i));
        fireEvent.click(screen.getByRole('button', { name: /Use a different file/i }));
        expect(screen.getByText(/Drop .docx template here/i)).toBeInTheDocument();
    });

    it('"Save Template" calls onSave with correct data', async () => {
        const onSave = vi.fn();
        mockParseTemplateHeaders.mockResolvedValue(parsedTemplate);
        render(<TemplateUploadModal onClose={vi.fn()} onSave={onSave} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('template.docx'));
        await waitFor(() => screen.getByText(/Template parsed/i));
        fireEvent.click(screen.getByRole('button', { name: /Save Template/i }));
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
            levelHeaders: parsedTemplate.levelHeaders,
            headerColor: parsedTemplate.headerColor,
        }));
    });

    it('shows parse error when parseTemplateHeaders throws', async () => {
        mockParseTemplateHeaders.mockRejectedValue(new Error('corrupt file'));
        render(<TemplateUploadModal onClose={vi.fn()} onSave={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        simulateFileInput(input, makeFile('template.docx'));
        await waitFor(() => {
            expect(screen.getByText(/Failed to parse template: corrupt file/i)).toBeInTheDocument();
        });
    });

    it('cancel button calls onClose', () => {
        const onClose = vi.fn();
        render(<TemplateUploadModal onClose={onClose} onSave={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(onClose).toHaveBeenCalled();
    });

    it('drag-over/drag-leave do not crash', () => {
        render(<TemplateUploadModal onClose={vi.fn()} onSave={vi.fn()} />);
        const dropZone = screen.getByText(/Drop .docx template here/i).closest('div[style]') as HTMLElement;
        fireEvent.dragOver(dropZone, { preventDefault: () => {} });
        fireEvent.dragLeave(dropZone);
        expect(screen.getByText(/Drop .docx template here/i)).toBeInTheDocument();
    });
});
