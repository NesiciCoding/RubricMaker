import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CsvImportModal from '../CsvImportModal';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}${JSON.stringify(opts)}` : key),
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
}));

const mockAddStudent = vi.fn();
const roster = {
    addStudent: mockAddStudent,
    updateStudent: vi.fn(),
    deleteStudent: vi.fn(),
    addClass: vi.fn((c: { name: string }) => ({ id: `class-${c.name}`, name: c.name })),
    classes: [{ id: 'class-1', name: 'Class A' }],
    students: [],
    settings: {},
};
vi.mock('../../../context/AppContext', () => ({
    useStudents: () => roster,
    useClasses: () => roster,
    useSettings: () => roster,
}));

function cp1252File(text: string): File {
    const bytes = Uint8Array.from(text, (ch) => {
        const code = ch.charCodeAt(0);
        if (code > 0xff) throw new Error(`not representable in this test: ${ch}`);
        return code;
    });
    return new File([bytes], 'students.csv', { type: 'text/csv' });
}

const importButton = () => screen.getByRole('button', { name: /csv\.import_btn/ });

describe('CsvImportModal parsing real files (#657)', () => {
    beforeEach(() => vi.clearAllMocks());

    it('trims padded headers so the rows behind them still import (#657)', async () => {
        const file = new File(['Name , Email \nAnna Z,a@x.nl\n'], 'students.csv', { type: 'text/csv' });
        render(<CsvImportModal file={file} onClose={vi.fn()} onSuccess={vi.fn()} />);

        expect(await screen.findByText('Anna Z')).toBeInTheDocument();
        fireEvent.click(importButton());
        expect(mockAddStudent).toHaveBeenCalledWith({ name: 'Anna Z', email: 'a@x.nl', classId: 'class-1' });
    });

    it('keeps a valid UTF-8 file as UTF-8 when it contains a literal replacement character (#657)', async () => {
        const file = new File(['Name,Note\n王小明,ok\nJosé Müller,broken \uFFFD char\n'], 'students.csv', {
            type: 'text/csv',
        });
        render(<CsvImportModal file={file} onClose={vi.fn()} onSuccess={vi.fn()} />);

        expect(await screen.findByText('王小明')).toBeInTheDocument();
        expect(screen.getByText('José Müller')).toBeInTheDocument();
    });

    it('re-reads a Windows-1252 file so accented names survive (#657)', async () => {
        const file = cp1252File('Naam;Klas\nJosé Müller;Class A\nFrançois Ærø;Class A\n');
        render(<CsvImportModal file={file} onClose={vi.fn()} onSuccess={vi.fn()} />);

        expect(await screen.findByText('José Müller')).toBeInTheDocument();
        expect(screen.getByText('François Ærø')).toBeInTheDocument();
        expect(screen.queryByText(/�/)).not.toBeInTheDocument();
    });

    it('keeps reading UTF-8 files as UTF-8 (#657)', async () => {
        const file = new File(['Name\nZoë Øster\n王小明\n'], 'students.csv', { type: 'text/csv' });
        render(<CsvImportModal file={file} onClose={vi.fn()} onSuccess={vi.fn()} />);

        expect(await screen.findByText('Zoë Øster')).toBeInTheDocument();
        expect(screen.getByText('王小明')).toBeInTheDocument();
    });

    it('explains and blocks an import where no row has a name (#657)', async () => {
        const file = new File(['Name,Email\n,a@x.nl\n  ,b@x.nl\n'], 'students.csv', { type: 'text/csv' });
        render(<CsvImportModal file={file} onClose={vi.fn()} onSuccess={vi.fn()} />);

        expect(await screen.findByRole('alert')).toHaveTextContent('csv.err_no_importable_rows');
        expect(importButton()).toBeDisabled();
    });
});
