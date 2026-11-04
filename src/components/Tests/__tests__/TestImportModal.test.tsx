import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TestImportModal from '../TestImportModal';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    }),
}));

function jsonFile(data: unknown, name = 'test.json') {
    return new File([JSON.stringify(data)], name, { type: 'application/json' });
}

async function selectFile(file: File) {
    // Modal renders via a Radix UI portal to document.body, not into the RTL container.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
    });
}

const sampleTest = {
    name: 'Vocabulary and grammar test',
    durationMinutes: 50,
    sections: [{ id: 's1', title: 'Assignment 1' }],
    questions: [
        { prompt: 'She {{is}} tall.', type: 'cloze', points: 1, sectionId: 's1' },
        { prompt: 'Q2', type: 'open', points: 2 },
    ],
};

describe('TestImportModal', () => {
    it('previews a parsed test and imports it on confirm', async () => {
        const onImport = vi.fn();
        const onClose = vi.fn();
        render(<TestImportModal onImport={onImport} onClose={onClose} />);

        await selectFile(jsonFile(sampleTest));

        await waitFor(() => expect(screen.getByText('Vocabulary and grammar test')).toBeInTheDocument());
        expect(screen.getByText(/importTest\.import_meta_questions/)).toBeInTheDocument();
        expect(screen.getByText(/importTest\.import_meta_sections/)).toBeInTheDocument();

        fireEvent.click(screen.getByText(/importTest\.import_confirm/));

        expect(onImport).toHaveBeenCalledTimes(1);
        expect(onImport.mock.calls[0][0]).toHaveLength(1);
        expect(onImport.mock.calls[0][0][0].questions).toHaveLength(2);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('imports every test in a batch file', async () => {
        const onImport = vi.fn();
        render(<TestImportModal onImport={onImport} onClose={vi.fn()} />);

        await selectFile(jsonFile([sampleTest, { ...sampleTest, name: 'Second test' }]));

        await waitFor(() => expect(screen.getByText('Second test')).toBeInTheDocument());
        fireEvent.click(screen.getByText(/importTest\.import_confirm/));

        expect(onImport.mock.calls[0][0]).toHaveLength(2);
    });

    it('summarises the tests that fall outside the preview', async () => {
        render(<TestImportModal onImport={vi.fn()} onClose={vi.fn()} />);

        const many = Array.from({ length: 10 }, (_, i) => ({
            name: `Test ${i + 1}`,
            questions: [{ prompt: 'Q', type: 'open', points: 1 }],
        }));
        await selectFile(jsonFile(many));

        await waitFor(() => expect(screen.getByText(/questionBank\.import_more_rows/)).toBeInTheDocument());
    });

    it('shows warnings and no preview when the file holds no test', async () => {
        const onImport = vi.fn();
        render(<TestImportModal onImport={onImport} onClose={vi.fn()} />);

        await selectFile(jsonFile({ items: [{ question: { prompt: 'Q', type: 'open', points: 1 } }] }));

        await waitFor(() => expect(screen.getByText('importTest.warn_looks_like_question_bank')).toBeInTheDocument());
        expect(screen.getByText('importTest.import_no_tests')).toBeInTheDocument();
        expect(screen.queryByText(/importTest\.import_confirm/)).toBeNull();
        expect(onImport).not.toHaveBeenCalled();
    });

    it('lists the parser warnings alongside a successful preview', async () => {
        render(<TestImportModal onImport={vi.fn()} onClose={vi.fn()} />);

        await selectFile(jsonFile({ name: 'Partial', questions: [{ prompt: 'Q', type: 'nope', points: 1 }] }));

        await waitFor(() => expect(screen.getByText(/importTest\.warn_unknown_type/)).toBeInTheDocument());
        expect(screen.getByText('Partial')).toBeInTheDocument();
    });

    it('closes without importing when the teacher cancels', async () => {
        const onImport = vi.fn();
        const onClose = vi.fn();
        render(<TestImportModal onImport={onImport} onClose={onClose} />);

        fireEvent.click(screen.getByText('common.cancel'));

        expect(onImport).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('re-enables the picker and explains the failure when reading the file rejects', async () => {
        const onImport = vi.fn();
        render(<TestImportModal onImport={onImport} onClose={vi.fn()} />);

        const unreadable = {
            name: 'unreadable.json',
            size: 12,
            text: () => Promise.reject(new Error('disk gone')),
        } as unknown as File;

        await selectFile(unreadable);

        await waitFor(() => expect(screen.getByText(/importTest\.warn_parse_failed/)).toBeInTheDocument());
        expect(screen.getByText(/disk gone/)).toBeInTheDocument();
        expect(screen.getByText(/importTest\.import_choose_file/)).toBeInTheDocument();
        expect(screen.queryByText(/importTest\.import_confirm/)).not.toBeInTheDocument();
    });
});
