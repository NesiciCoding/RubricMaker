import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExamBookletExportPanel from '../ExamBookletExportPanel';
import type { Student, Test } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: { count?: number; total?: number }) =>
            opts?.total !== undefined ? `${opts.count}/${opts.total} selected` : key,
    }),
}));
vi.mock('../../../hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../services/database/AuditLogger', () => ({ logAuditEvent: vi.fn() }));
vi.mock('../../../context/useStore', () => ({
    useStoreSelector: (selector: (s: unknown) => unknown) =>
        selector({
            classes: [
                { id: 'c1', name: '3A' },
                { id: 'c2', name: '3B' },
            ],
        }),
}));

const students = [
    { id: 's1', name: 'Ann', classId: 'c1' },
    { id: 's2', name: 'Bob', classId: 'c1' },
    { id: 's3', name: 'Cy', classId: 'c2' },
] as Student[];
const test = { id: 't1', name: 'T', questions: [], requireSEB: false, shuffleQuestions: false } as unknown as Test;

const checkbox = (name: string) => screen.getByRole('checkbox', { name });

describe('ExamBookletExportPanel class selection', () => {
    it('selects and deselects a whole class from its chip', () => {
        render(<ExamBookletExportPanel test={test} students={students} />);
        fireEvent.click(screen.getByRole('button', { name: /3A/ }));
        expect(checkbox('Ann')).toBeChecked();
        expect(checkbox('Bob')).toBeChecked();
        expect(checkbox('Cy')).not.toBeChecked();
        expect(screen.getByRole('button', { name: /3A/ })).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(screen.getByRole('button', { name: /3A/ }));
        expect(checkbox('Ann')).not.toBeChecked();
        expect(screen.getByRole('button', { name: /3A/ })).toHaveAttribute('aria-pressed', 'false');
    });

    it('completes a partially selected class instead of clearing it', () => {
        render(<ExamBookletExportPanel test={test} students={students} />);
        fireEvent.click(checkbox('Ann'));
        expect(screen.getByRole('button', { name: /3A \(1\/2\)/ })).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(screen.getByRole('button', { name: /3A/ }));
        expect(checkbox('Ann')).toBeChecked();
        expect(checkbox('Bob')).toBeChecked();
    });

    it('combines classes and leaves other selections alone', () => {
        render(<ExamBookletExportPanel test={test} students={students} />);
        fireEvent.click(screen.getByRole('button', { name: /3A/ }));
        fireEvent.click(screen.getByRole('button', { name: /3B/ }));
        expect(screen.getByText('3/3 selected')).toBeInTheDocument();
    });
});

describe('ExamBookletExportPanel scan markers', () => {
    it('warns that scan markers only apply to the PDF answer sheet once enabled', () => {
        render(<ExamBookletExportPanel test={test} students={students} />);
        expect(screen.queryByRole('note')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('checkbox', { name: 'tests.export.exam.scan_markers_label' }));
        expect(screen.getByRole('note')).toHaveTextContent('tests.export.exam.scan_markers_pdf_only');
    });
});
