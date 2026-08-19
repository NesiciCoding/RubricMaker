import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ImportRubricModal from '../ImportRubricModal';
import type { ParsedRubric } from '../../../utils/rubricImport';

const mocks = vi.hoisted(() => ({
    parseDocxToRubric: vi.fn(),
    parsePdfToRubric: vi.fn(),
    parseJsonToRubric: vi.fn(),
}));

vi.mock('../../../utils/rubricImport', () => ({
    parseDocxToRubric: mocks.parseDocxToRubric,
    parsePdfToRubric: mocks.parsePdfToRubric,
    parseJsonToRubric: mocks.parseJsonToRubric,
}));

const level = (id: string, label: string, description: string) => ({
    id,
    label,
    minPoints: 0,
    maxPoints: 4,
    description,
    subItems: [],
});

const parsed: ParsedRubric = {
    name: 'My Rubric',
    subject: 'English',
    description: '',
    confidence: 'high',
    warnings: ['Some cells were empty and skipped'],
    criteria: [
        {
            id: 'c1',
            title: 'Task completion',
            description: '',
            weight: 50,
            levels: [level('l1', 'Excellent', 'Fully completes the task'), level('l2', 'Poor', '')],
        },
        {
            id: 'c2',
            title: 'Grammar',
            description: '',
            weight: 50,
            levels: [level('l1', 'Excellent', 'Accurate grammar'), level('l2', 'Poor', 'Many errors')],
        },
    ],
};

const empty: ParsedRubric = {
    name: '',
    subject: '',
    description: '',
    confidence: 'low',
    warnings: [],
    criteria: [],
};

const docxFile = new File(['x'], 'essay-rubric.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});
const pdfFile = new File(['x'], 'rubric.pdf', { type: 'application/pdf' });
const jsonFile = new File(['{}'], 'rubric.json', { type: 'application/json' });

function dropZone() {
    return screen.getByText('Drop a file here or click to browse').closest('div') as HTMLElement;
}

function fileInput() {
    return document.querySelector('input[type="file"]') as HTMLInputElement;
}

beforeEach(() => {
    mocks.parseDocxToRubric.mockResolvedValue(parsed);
    mocks.parsePdfToRubric.mockResolvedValue(parsed);
    mocks.parseJsonToRubric.mockResolvedValue(parsed);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('ImportRubricModal coverage', () => {
    it('parses a docx via drag-and-drop and imports it with edited metadata', async () => {
        const onImport = vi.fn();
        const { unmount } = render(<ImportRubricModal onClose={vi.fn()} onImport={onImport} />);

        fireEvent.dragOver(dropZone());
        expect(screen.getByText('Accepts .docx (Word), .pdf, and .json files')).toBeInTheDocument();
        // empty drop → no-op, drag leave clears the highlight
        fireEvent.drop(dropZone(), { dataTransfer: { files: [] } });
        fireEvent.dragLeave(dropZone());
        fireEvent.drop(dropZone(), { dataTransfer: { files: [docxFile] } });

        // preview stage
        expect(await screen.findByText('Detection quality: high')).toBeInTheDocument();
        expect(screen.getByText(/2 criteria,/)).toBeInTheDocument();
        expect(screen.getByText(/2 levels detected/)).toBeInTheDocument();
        // high confidence → no edit hint
        expect(screen.queryByText(' You can edit all fields after importing.')).not.toBeInTheDocument();
        expect(screen.getByText('Some cells were empty and skipped')).toBeInTheDocument();
        expect((screen.getByPlaceholderText('e.g. Essay Rubric') as HTMLInputElement).value).toBe('My Rubric');
        expect((screen.getByPlaceholderText('e.g. English') as HTMLInputElement).value).toBe('English');
        // table preview with description fallback
        expect(screen.getByText('Task completion')).toBeInTheDocument();
        expect(screen.getByText('Fully completes the task')).toBeInTheDocument();
        expect(screen.getByText('—')).toBeInTheDocument();
        expect(screen.getByText('Excellent')).toBeInTheDocument();
        expect(screen.getByText('Poor')).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText('e.g. Essay Rubric'), { target: { value: 'Renamed' } });
        fireEvent.click(screen.getByRole('button', { name: /Create Rubric/ }));
        expect(onImport).toHaveBeenCalledWith({ ...parsed, name: 'Renamed', subject: 'English' });
        unmount();
    });

    it('ignores empty drops and empty input changes', () => {
        const { unmount } = render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        // drop and change with no files exercise both `if (file)` false arms
        fireEvent.drop(dropZone(), { dataTransfer: { files: [] } });
        fireEvent.change(fileInput(), { target: { files: undefined } });
        expect(screen.getByText('Drop a file here or click to browse')).toBeInTheDocument();
        unmount();
    });

    it('parses pdf and json through the file input with name fallbacks', async () => {
        const onImport = vi.fn();
        const r1 = render(<ImportRubricModal onClose={vi.fn()} onImport={onImport} />);
        const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
        fireEvent.click(dropZone());
        expect(clickSpy).toHaveBeenCalled();

        mocks.parsePdfToRubric.mockResolvedValue(parsed);
        fireEvent.change(fileInput(), { target: { files: [pdfFile] } });
        expect(await screen.findByText('Detection quality: high')).toBeInTheDocument();
        // footer "try another file" returns to upload
        fireEvent.click(screen.getByText('← Try Another File'));
        expect(screen.getByText('Drop a file here or click to browse')).toBeInTheDocument();
        r1.unmount();

        // json with empty name/subject → file-name fallback + imported fallback name
        const r2 = render(<ImportRubricModal onClose={vi.fn()} onImport={onImport} />);
        mocks.parseJsonToRubric.mockResolvedValue({ ...empty, criteria: parsed.criteria });
        fireEvent.change(fileInput(), { target: { files: [jsonFile] } });
        expect(await screen.findByText('Detection quality: low')).toBeInTheDocument();
        // low confidence → edit hint + singular/plural arms
        expect(screen.getByText(/ You can edit all fields after importing./)).toBeInTheDocument();
        expect(screen.getByText(/2 criteria,/)).toBeInTheDocument();
        expect((screen.getByPlaceholderText('e.g. Essay Rubric') as HTMLInputElement).value).toBe('rubric');
        expect((screen.getByPlaceholderText('e.g. English') as HTMLInputElement).value).toBe('');

        fireEvent.change(screen.getByPlaceholderText('e.g. Essay Rubric'), { target: { value: '' } });
        fireEvent.change(screen.getByPlaceholderText('e.g. English'), { target: { value: 'Dutch' } });
        fireEvent.click(screen.getByRole('button', { name: /Create Rubric/ }));
        expect(onImport).toHaveBeenCalledWith({
            ...empty,
            criteria: parsed.criteria,
            name: 'Imported Rubric',
            subject: 'Dutch',
        });
        r2.unmount();
    });

    it('rejects invalid extensions and surfaces parse failures', async () => {
        const r1 = render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        fireEvent.change(fileInput(), {
            target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
        });
        expect(screen.getByText('Please upload a .docx, .pdf, or .json file.')).toBeInTheDocument();
        r1.unmount();

        const r2 = render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        mocks.parseDocxToRubric.mockRejectedValueOnce(new Error('corrupt file'));
        fireEvent.change(fileInput(), { target: { files: [docxFile] } });
        expect(await screen.findByText('Failed to parse file: corrupt file')).toBeInTheDocument();
        r2.unmount();

        const r3 = render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        mocks.parseJsonToRubric.mockRejectedValueOnce('boom');
        fireEvent.change(fileInput(), { target: { files: [jsonFile] } });
        expect(await screen.findByText('Failed to parse file: Unknown error')).toBeInTheDocument();
        r3.unmount();
    });

    it('shows the parsing stage and the empty-structure state', async () => {
        let resolveDocx: (v: ParsedRubric) => void = () => undefined;
        mocks.parseDocxToRubric.mockReturnValueOnce(
            new Promise<ParsedRubric>((res) => {
                resolveDocx = res;
            })
        );
        const { unmount } = render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);

        fireEvent.drop(dropZone(), { dataTransfer: { files: [docxFile] } });
        expect(screen.getByText('Parsing file…')).toBeInTheDocument();
        expect(screen.queryByText('Drop a file here or click to browse')).not.toBeInTheDocument();

        await act(async () => resolveDocx(empty));
        // empty criteria → banner with 0 levels + empty state
        expect(screen.getByText(/0 levels detected/)).toBeInTheDocument();
        expect(screen.getByText('No rubric structure detected. Try a different file.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Create Rubric/ })).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('Try Another File'));
        expect(screen.getByText('Drop a file here or click to browse')).toBeInTheDocument();
        unmount();
    });

    it('closes via cancel and X, and handles singular criteria', async () => {
        const onClose = vi.fn();
        const r1 = render(<ImportRubricModal onClose={onClose} onImport={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        r1.unmount();

        const r2 = render(<ImportRubricModal onClose={onClose} onImport={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(2);
        r2.unmount();

        // medium confidence with a single criterion → singular label
        const r3 = render(<ImportRubricModal onClose={vi.fn()} onImport={vi.fn()} />);
        mocks.parsePdfToRubric.mockResolvedValue({
            ...parsed,
            name: '',
            confidence: 'medium',
            criteria: [parsed.criteria[0]],
        });
        fireEvent.change(fileInput(), { target: { files: [pdfFile] } });
        expect(await screen.findByText(/1 criterion,/)).toBeInTheDocument();
        expect(screen.getByText(/ You can edit all fields after importing./)).toBeInTheDocument();
        expect(screen.getByText('Detection quality: medium')).toBeInTheDocument();
        r3.unmount();
    });
});
