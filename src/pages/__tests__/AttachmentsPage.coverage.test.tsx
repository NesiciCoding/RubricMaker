import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Attachment, Class, Rubric, Student } from '../../types';

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
};

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };

const mockAttachment: Attachment = {
    id: 'a1',
    name: 'report.pdf',
    mimeType: 'application/pdf',
    dataUrl: 'data:application/pdf;base64,abc',
    rubricId: 'r1',
    studentId: 's1',
    size: 1024,
    addedAt: '2024-01-01T00:00:00Z',
};

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockAddAttachment = vi.fn();
const mockDeleteAttachment = vi.fn();
const mockFileToDataUrl = vi.fn();

const mockAppValue: Record<string, unknown> = {
    attachments: [],
    rubrics: [mockRubric],
    students: [mockStudent],
    classes: [mockClass],
    studentRubrics: [],
    settings: mockSettings,
    addAttachment: mockAddAttachment,
    deleteAttachment: mockDeleteAttachment,
};

vi.mock('../../context/AppContext', () => ({
    useRoster: () => mockAppValue,
    useStudents: () => mockAppValue,
    useClasses: () => mockAppValue,
    useGrading: () => mockAppValue,
    useAuthoring: () => mockAppValue,
    useAssessment: () => mockAppValue,
    useEssays: () => mockAppValue,
    useFlashcards: () => mockAppValue,
    useSettings: () => mockAppValue,
    usePlatform: () => mockAppValue,
}));

vi.mock('../../utils/fileToDataUrl', () => ({
    fileToDataUrl: mockFileToDataUrl,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

let AttachmentsPageComp: React.ComponentType;

function renderPage() {
    return renderWithRouter(<AttachmentsPageComp />);
}

function selectRubric(value = 'r1') {
    fireEvent.change(screen.getByDisplayValue('attachments.no_rubric'), { target: { value } });
}

describe('AttachmentsPage coverage', () => {
    beforeEach(async () => {
        mockAddAttachment.mockClear();
        mockDeleteAttachment.mockClear();
        mockFileToDataUrl.mockReset();
        mockFileToDataUrl.mockResolvedValue('data:application/pdf;base64,xyz');
        (mockAppValue as Record<string, unknown>).attachments = [];
        const mod = await import('../AttachmentsPage');
        AttachmentsPageComp = mod.default;
    });

    it('uploads via drag-drop with rubric and student linked', async () => {
        renderPage();
        // Clicks inside the drop zone must not reopen the file picker (stopPropagation).
        fireEvent.click(screen.getByDisplayValue('attachments.no_rubric'));
        selectRubric();
        const classSelect = screen.getByDisplayValue('attachments.any_class');
        fireEvent.click(classSelect);
        fireEvent.change(classSelect, { target: { value: 'c1' } });
        const studentSelect = screen.getByRole('combobox', { name: 'attachments.link_to_student' });
        fireEvent.click(studentSelect);
        fireEvent.change(studentSelect, { target: { value: 's1' } });

        const zone = screen.getByText('attachments.drop_zone_title').closest('.drop-zone')!;
        fireEvent.dragOver(zone);
        expect(zone.className).toContain('drag-over');
        fireEvent.dragLeave(zone);
        expect(zone.className).not.toContain('drag-over');

        const file = new File(['content'], 'report.pdf', { type: 'application/pdf' });
        fireEvent.drop(zone, { dataTransfer: { files: [file] } });
        await waitFor(() =>
            expect(mockAddAttachment).toHaveBeenCalledWith({
                name: 'report.pdf',
                mimeType: 'application/pdf',
                dataUrl: 'data:application/pdf;base64,xyz',
                rubricId: 'r1',
                studentId: 's1',
                size: 7,
            })
        );
    });

    it('uploads through the hidden input with no rubric or student linked', async () => {
        const { container } = renderPage();
        const fileInput = container.querySelector('input[type="file"]')!;
        const file = new File(['a'], 'note.txt', { type: 'text/plain' });
        fireEvent.change(fileInput, { target: { files: [file] } });
        await waitFor(() =>
            expect(mockAddAttachment).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'note.txt', rubricId: undefined, studentId: undefined })
            )
        );
    });

    it('handles a null file list and a failed data-url read', async () => {
        const { container } = renderPage();
        const fileInput = container.querySelector('input[type="file"]')!;
        // Null files → the guard returns early.
        fireEvent.change(fileInput, { target: { files: null } });
        expect(mockAddAttachment).not.toHaveBeenCalled();

        // Rejection → logged, attachment skipped.
        mockFileToDataUrl.mockRejectedValue(new Error('read failed'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        fireEvent.change(fileInput, {
            target: { files: [new File(['x'], 'broken.txt', { type: 'text/plain' })] },
        });
        await waitFor(() =>
            expect(errorSpy).toHaveBeenCalledWith('Failed to read attachment file', 'broken.txt', expect.any(Error))
        );
        expect(mockAddAttachment).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('opens the file picker from the drop zone and the empty-state CTA', () => {
        const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
        const { container } = renderPage();
        fireEvent.click(container.querySelector('.drop-zone')!);
        expect(clickSpy).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByText('attachments.empty_state_cta'));
        expect(clickSpy).toHaveBeenCalledTimes(2);
        clickSpy.mockRestore();
    });

    it('renders mime fallbacks, sizes, image previews, and unlinked dashes', () => {
        (mockAppValue as Record<string, unknown>).attachments = [
            mockAttachment,
            { ...mockAttachment, id: 'a2', name: 'scan', mimeType: 'unknown', size: 512 },
            {
                ...mockAttachment,
                id: 'a3',
                name: 'big.bin',
                mimeType: 'application/octet-stream',
                size: 2 * 1024 * 1024,
            },
            {
                ...mockAttachment,
                id: 'a4',
                name: 'photo.png',
                mimeType: 'image/png',
                rubricId: undefined,
                studentId: undefined,
                size: 300,
            },
        ];
        renderPage();
        expect(screen.getByText('pdf')).toBeInTheDocument();
        expect(screen.getByText('unknown')).toBeInTheDocument();
        expect(screen.getByText('octet-stream')).toBeInTheDocument();
        expect(screen.getByText('png')).toBeInTheDocument();
        expect(screen.getByText('1.0 KB')).toBeInTheDocument();
        expect(screen.getByText('512 B')).toBeInTheDocument();
        expect(screen.getByText('2.0 MB')).toBeInTheDocument();
        expect(screen.getByText('300 B')).toBeInTheDocument();
        // The unlinked attachment renders the em-dash fallbacks in both columns.
        expect(screen.getAllByText('—').length).toBe(2);
        // Image attachments get a preview anchor.
        expect(screen.getByTitle('Preview')).toHaveAttribute('href', 'data:application/pdf;base64,abc');
    });

    it('deletes after confirmation and keeps the attachment on cancel', async () => {
        (mockAppValue as Record<string, unknown>).attachments = [mockAttachment];
        renderPage();
        fireEvent.click(screen.getByLabelText('Delete attachment'));
        expect(screen.getByText('This attachment will be permanently removed.')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.cancel'));
        expect(mockDeleteAttachment).not.toHaveBeenCalled();

        fireEvent.click(screen.getByLabelText('Delete attachment'));
        fireEvent.click(screen.getByText('common.confirm'));
        await waitFor(() => expect(mockDeleteAttachment).toHaveBeenCalledWith('a1'));
    });
});
