import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
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

const mockRubricsArr = [mockRubric];
const mockStudentsArr = [mockStudent];
const mockClassesArr = [mockClass];
const emptyArr: never[] = [];

const mockAppValue: Record<string, unknown> = {
    attachments: emptyArr,
    rubrics: mockRubricsArr,
    students: mockStudentsArr,
    classes: mockClassesArr,
    studentRubrics: emptyArr,
    settings: mockSettings,
    addAttachment: mockAddAttachment,
    deleteAttachment: mockDeleteAttachment,
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
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

describe('AttachmentsPage', () => {
    beforeEach(async () => {
        mockAddAttachment.mockClear();
        mockDeleteAttachment.mockClear();
        (mockAppValue as Record<string, unknown>).attachments = emptyArr;
        const mod = await import('../AttachmentsPage');
        AttachmentsPageComp = mod.default;
    });

    it('renders the page title and empty state', () => {
        renderPage();
        expect(screen.getByText('attachments.title')).toBeInTheDocument();
        expect(screen.getByText('attachments.empty_state')).toBeInTheDocument();
    });

    it('shows class and student selectors when a rubric is selected', () => {
        renderPage();
        const rubricSelect = screen.getByDisplayValue('attachments.no_rubric');
        fireEvent.change(rubricSelect, { target: { value: 'r1' } });
        expect(screen.getByText('attachments.link_to_student')).toBeInTheDocument();
        expect(screen.getByDisplayValue('attachments.any_class')).toBeInTheDocument();
        expect(screen.getByDisplayValue('attachments.no_student')).toBeInTheDocument();
        expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('filters students by selected class', () => {
        renderPage();
        fireEvent.change(screen.getByDisplayValue('attachments.no_rubric'), { target: { value: 'r1' } });
        const classSelect = screen.getByDisplayValue('attachments.any_class');
        fireEvent.change(classSelect, { target: { value: 'c1' } });
        // Student in that class still shows
        expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('renders attachment table when attachments exist', () => {
        (mockAppValue as Record<string, unknown>).attachments = [mockAttachment];
        renderPage();
        expect(screen.getByText('report.pdf')).toBeInTheDocument();
        expect(screen.getAllByText(/Essay Rubric/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
    });

    it('calls downloadAttachment when download button clicked', () => {
        (mockAppValue as Record<string, unknown>).attachments = [mockAttachment];
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        renderPage();
        fireEvent.click(screen.getByTitle('Download'));
        expect(clickSpy).toHaveBeenCalled();
        clickSpy.mockRestore();
    });
});
