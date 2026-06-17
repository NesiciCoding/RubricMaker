import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CsvImportModal from '../CsvImportModal';

const CSV_TRANSLATIONS: Record<string, string> = {
    'csv.summary_created': 'created',
    'csv.summary_updated': 'updated',
    'csv.summary_transferred': 'moved between classes',
    'csv.summary_removed': 'removed',
    'csv.sync_label': 'Sync class rosters (remove students not in this CSV)',
    'csv.done': 'Done',
    'csv.cancel': 'Cancel',
};

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: { count?: number }) => {
            if (key === 'csv.import_btn') {
                return `Import ${opts?.count ?? 0} Student${(opts?.count ?? 0) !== 1 ? 's' : ''}`;
            }
            return CSV_TRANSLATIONS[key] ?? key;
        },
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
}));

let parseImpl: (file: File, opts: any) => void = (_file, opts) => {
    opts.complete({ data: [{ Name: 'Alice Anderson', Email: 'alice@school.com', Class: 'Class A' }] });
};

vi.mock('papaparse', () => ({
    default: {
        parse: vi.fn((file: File, opts: any) => parseImpl(file, opts)),
    },
}));

const mockAddStudent = vi.fn();
const mockUpdateStudent = vi.fn();
const mockDeleteStudent = vi.fn();
const mockAddClass = vi.fn((c: { name: string }) => ({ id: `class-${c.name.toLowerCase()}`, name: c.name }));
let mockClasses: { id: string; name: string }[] = [{ id: 'class-1', name: 'Class A' }];
let mockStudents: { id: string; name: string; email?: string; classId: string }[] = [];

vi.mock('../../../context/AppContext', () => ({
    useApp: () => ({
        addStudent: mockAddStudent,
        updateStudent: mockUpdateStudent,
        deleteStudent: mockDeleteStudent,
        addClass: mockAddClass,
        classes: mockClasses,
        students: mockStudents,
    }),
}));

const baseProps = {
    file: new File(['Name,Email,Class\nAlice Anderson,alice@school.com,Class A'], 'students.csv', { type: 'text/csv' }),
    onClose: vi.fn(),
    onSuccess: vi.fn(),
};

describe('CsvImportModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockClasses = [{ id: 'class-1', name: 'Class A' }];
        mockStudents = [];
        mockDeleteStudent.mockReset();
        parseImpl = (_file, opts) => {
            opts.complete({ data: [{ Name: 'Alice Anderson', Email: 'alice@school.com', Class: 'Class A' }] });
        };
    });

    it('renders the column mapping header', () => {
        render(<CsvImportModal {...baseProps} />);
        expect(screen.getByText('Map CSV Columns')).toBeInTheDocument();
    });

    it('auto-maps Name, Email and Class columns and shows a preview', () => {
        render(<CsvImportModal {...baseProps} />);
        expect(screen.getByText('Data Preview (First 3 rows)')).toBeInTheDocument();
        expect(screen.getByText('Alice Anderson')).toBeInTheDocument();
        expect(screen.getByText('alice@school.com')).toBeInTheDocument();
        expect(screen.getByText('Class A')).toBeInTheDocument();
    });

    it('shows an error state when the CSV is empty', () => {
        parseImpl = (_file, opts) => opts.complete({ data: [] });
        render(<CsvImportModal {...baseProps} />);
        expect(screen.getByText('The CSV file is empty.')).toBeInTheDocument();
    });

    it('shows an error state when no columns can be detected', () => {
        parseImpl = (_file, opts) => opts.complete({ data: [{}] });
        render(<CsvImportModal {...baseProps} />);
        expect(screen.getByText('Could not detect any columns in the CSV file.')).toBeInTheDocument();
    });

    it('shows a parse error message', () => {
        parseImpl = (_file, opts) => opts.error({ message: 'malformed file' });
        render(<CsvImportModal {...baseProps} />);
        expect(screen.getByText('Failed to parse CSV: malformed file')).toBeInTheDocument();
    });

    it('shows "Empty" placeholder and dash for missing name/email in preview rows', () => {
        parseImpl = (_file, opts) => opts.complete({ data: [{ Name: '', Email: '', Class: '' }] });
        render(<CsvImportModal {...baseProps} />);
        expect(screen.getByText('Empty')).toBeInTheDocument();
        expect(screen.getByText('—')).toBeInTheDocument();
        expect(screen.getByText('Active Class (Default)')).toBeInTheDocument();
    });

    it('disables the import button until a name mapping is selected', () => {
        parseImpl = (_file, opts) => opts.complete({ data: [{ Foo: 'bar', Bar: 'baz' }] });
        render(<CsvImportModal {...baseProps} />);
        const importBtn = screen.getByRole('button', { name: /import 1 student/i });
        expect(importBtn).toBeDisabled();
        expect(screen.queryByText('Data Preview (First 3 rows)')).not.toBeInTheDocument();

        const [fullNameSelect] = screen.getAllByRole('combobox');
        fireEvent.change(fullNameSelect, { target: { value: 'Foo' } });
        expect(importBtn).not.toBeDisabled();
        expect(screen.getByText('Data Preview (First 3 rows)')).toBeInTheDocument();
    });

    it('lets the teacher change the email column mapping', () => {
        parseImpl = (_file, opts) =>
            opts.complete({
                data: [{ Name: 'Alice Anderson', PrimaryEmail: 'alice@new.com', BackupEmail: 'alice@old.com' }],
            });
        render(<CsvImportModal {...baseProps} />);
        const [, emailSelect] = screen.getAllByRole('combobox');
        fireEvent.change(emailSelect, { target: { value: 'BackupEmail' } });
        expect((emailSelect as HTMLSelectElement).value).toBe('BackupEmail');
        expect(screen.getByText('alice@old.com')).toBeInTheDocument();
    });

    it('shows the correct singular/plural label on the import button', () => {
        parseImpl = (_file, opts) => opts.complete({ data: [{ Name: 'A' }, { Name: 'B' }] });
        render(<CsvImportModal {...baseProps} />);
        expect(screen.getByRole('button', { name: /import 2 students/i })).toBeInTheDocument();
    });

    it('maps first/last name columns and disables full-name when used together', () => {
        parseImpl = (_file, opts) => opts.complete({ data: [{ First: 'Alice', Last: 'Anderson', Other: 'x' }] });
        render(<CsvImportModal {...baseProps} />);

        const [fullNameSelect, , firstSelect, lastSelect] = screen.getAllByRole('combobox');
        fireEvent.change(firstSelect, { target: { value: 'First' } });
        fireEvent.change(lastSelect, { target: { value: 'Last' } });

        expect(screen.getByText('Data Preview (First 3 rows)')).toBeInTheDocument();
        expect(screen.getByText('Alice Anderson')).toBeInTheDocument();

        fireEvent.change(fullNameSelect, { target: { value: 'Other' } });
        expect(firstSelect).toBeDisabled();
        expect(lastSelect).toBeDisabled();
        expect(screen.getByText('First Name (inactive)')).toBeInTheDocument();
        expect(screen.getByText('Last Name (inactive)')).toBeInTheDocument();
    });

    it('imports students into existing classes and reports success', () => {
        parseImpl = (_file, opts) =>
            opts.complete({ data: [{ Name: 'Alice Anderson', Email: 'alice@school.com', Class: 'Class A' }] });
        render(<CsvImportModal {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /import 1 student/i }));

        expect(mockAddStudent).toHaveBeenCalledWith({
            name: 'Alice Anderson',
            email: 'alice@school.com',
            classId: 'class-1',
        });
        expect(mockAddClass).not.toHaveBeenCalled();
        // Summary is shown; click Done to trigger onSuccess
        fireEvent.click(screen.getByRole('button', { name: /done/i }));
        expect(baseProps.onSuccess).toHaveBeenCalled();
    });

    it('creates new classes for unmatched class names', () => {
        parseImpl = (_file, opts) => opts.complete({ data: [{ Name: 'Bob Brown', Email: '', Class: 'New Class' }] });
        render(<CsvImportModal {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /import 1 student/i }));

        expect(mockAddClass).toHaveBeenCalledWith({ name: 'New Class' });
        expect(mockAddStudent).toHaveBeenCalledWith({ name: 'Bob Brown', email: '', classId: 'class-new class' });
    });

    it('skips rows without a resolvable name', () => {
        parseImpl = (_file, opts) =>
            opts.complete({
                data: [
                    { Name: '', Email: 'noname@school.com', Class: 'Class A' },
                    { Name: 'Carl Carlson', Email: '', Class: 'Class A' },
                ],
            });
        render(<CsvImportModal {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /import 2 students/i }));

        expect(mockAddStudent).toHaveBeenCalledTimes(1);
        expect(mockAddStudent).toHaveBeenCalledWith({ name: 'Carl Carlson', email: '', classId: 'class-1' });
    });

    it('uses the first existing class as the default when no class column is mapped', () => {
        render(<CsvImportModal {...baseProps} />);
        const selects = screen.getAllByRole('combobox');
        const classSelect = selects[selects.length - 1];
        fireEvent.change(classSelect, { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: /import 1 student/i }));
        expect(mockAddStudent).toHaveBeenCalledWith({
            name: 'Alice Anderson',
            email: 'alice@school.com',
            classId: 'class-1',
        });
    });

    it('does not import students when no class can be resolved and there are no existing classes', () => {
        mockClasses = [];
        parseImpl = (_file, opts) => opts.complete({ data: [{ Name: 'Dana Doe', Email: '', Class: '' }] });
        render(<CsvImportModal {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /import 1 student/i }));
        expect(mockAddStudent).not.toHaveBeenCalled();
        // Summary is shown; click Done to trigger onSuccess
        fireEvent.click(screen.getByRole('button', { name: /done/i }));
        expect(baseProps.onSuccess).toHaveBeenCalled();
    });

    it('matches an existing class case-insensitively and does not create a duplicate', () => {
        mockClasses = [{ id: 'class-1', name: 'class a' }];
        parseImpl = (_file, opts) => opts.complete({ data: [{ Name: 'Eve Evans', Email: '', Class: 'CLASS A' }] });
        render(<CsvImportModal {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /import 1 student/i }));
        expect(mockAddClass).not.toHaveBeenCalled();
        expect(mockAddStudent).toHaveBeenCalledWith({ name: 'Eve Evans', email: '', classId: 'class-1' });
    });

    it('builds the name from first/last name fields when full name is not mapped', () => {
        parseImpl = (_file, opts) => opts.complete({ data: [{ First: 'Frank', Last: 'Foster', Class: 'Class A' }] });
        render(<CsvImportModal {...baseProps} />);
        const [, , firstSelect, lastSelect] = screen.getAllByRole('combobox');
        fireEvent.change(firstSelect, { target: { value: 'First' } });
        fireEvent.change(lastSelect, { target: { value: 'Last' } });
        fireEvent.click(screen.getByRole('button', { name: /import 1 student/i }));
        expect(mockAddStudent).toHaveBeenCalledWith({ name: 'Frank Foster', email: '', classId: 'class-1' });
    });

    it('closes the modal via the close and cancel buttons', () => {
        render(<CsvImportModal {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /close/i }));
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(baseProps.onClose).toHaveBeenCalledTimes(2);
    });

    it('transfers a student to a new class when matched by email', () => {
        mockClasses = [
            { id: 'class-1', name: 'Class A' },
            { id: 'class-2', name: 'Class B' },
        ];
        mockStudents = [{ id: 'student-1', name: 'Alice Anderson', email: 'alice@school.com', classId: 'class-1' }];
        parseImpl = (_file, opts) =>
            opts.complete({ data: [{ Name: 'Alice Anderson', Email: 'alice@school.com', Class: 'Class B' }] });
        render(<CsvImportModal {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /import 1 student/i }));
        expect(mockUpdateStudent).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'student-1', classId: 'class-2' })
        );
        expect(mockAddStudent).not.toHaveBeenCalled();
        expect(screen.getByText(/moved between classes/i)).toBeInTheDocument();
    });

    it('does not double-update a student when the same email appears twice in the CSV', () => {
        mockStudents = [{ id: 'student-1', name: 'Alice Anderson', email: 'alice@school.com', classId: 'class-1' }];
        parseImpl = (_file, opts) =>
            opts.complete({
                data: [
                    { Name: 'Alice Anderson', Email: 'alice@school.com', Class: 'Class A' },
                    { Name: 'Alice A', Email: 'alice@school.com', Class: 'Class A' },
                ],
            });
        render(<CsvImportModal {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /import 2 students/i }));
        expect(mockUpdateStudent).toHaveBeenCalledTimes(1);
        expect(mockAddStudent).not.toHaveBeenCalled(); // second row is skipped (same email)
    });

    it('removes unmatched students from imported classes when sync mode is enabled', () => {
        mockClasses = [{ id: 'class-1', name: 'Class A' }];
        mockStudents = [
            { id: 'student-1', name: 'Alice Anderson', email: 'alice@school.com', classId: 'class-1' },
            { id: 'student-2', name: 'Bob Brown', email: '', classId: 'class-1' },
        ];
        parseImpl = (_file, opts) =>
            opts.complete({ data: [{ Name: 'Alice Anderson', Email: 'alice@school.com', Class: 'Class A' }] });
        render(<CsvImportModal {...baseProps} />);
        const syncCheckbox = screen.getByRole('checkbox');
        fireEvent.click(syncCheckbox);
        fireEvent.click(screen.getByRole('button', { name: /import 1 student/i }));
        expect(mockDeleteStudent).toHaveBeenCalledWith('student-2');
        expect(mockDeleteStudent).not.toHaveBeenCalledWith('student-1');
        expect(screen.getByText(/1 removed/i)).toBeInTheDocument();
    });
});
