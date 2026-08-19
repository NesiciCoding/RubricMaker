import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import QuestionBankImportModal from '../QuestionBankImportModal';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    }),
}));

function jsonFile(data: unknown, name = 'questions.json') {
    return new File([JSON.stringify(data)], name, { type: 'application/json' });
}

async function selectFile(file: File) {
    // Modal renders via a Radix UI portal to document.body, not into the RTL container.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
    });
}

describe('QuestionBankImportModal', () => {
    it('parses a valid file and imports the resulting items on confirm', async () => {
        const onImport = vi.fn();
        const onClose = vi.fn();
        render(<QuestionBankImportModal onImport={onImport} onClose={onClose} />);

        await selectFile(
            jsonFile({
                items: [
                    {
                        tags: ['a1'],
                        question: { prompt: 'Q1', type: 'short-answer', points: 1, expectedAnswers: ['x'] },
                    },
                    { tags: ['a1'], question: { prompt: 'Q2', type: 'true-false', points: 1, correctBoolean: true } },
                ],
            })
        );

        await waitFor(() => expect(screen.getByText(/Q1/)).toBeInTheDocument());
        expect(screen.getByText(/Q2/)).toBeInTheDocument();

        fireEvent.click(screen.getByText(/questionBank\.import_confirm/));

        expect(onImport).toHaveBeenCalledTimes(1);
        const imported = onImport.mock.calls[0][0];
        expect(imported).toHaveLength(2);
        expect(imported[0].question.prompt).toBe('Q1');
        expect(imported[1].question.correctBoolean).toBe(true);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('shows warnings and does not render a preview when nothing parses', async () => {
        const onImport = vi.fn();
        render(<QuestionBankImportModal onImport={onImport} onClose={vi.fn()} />);

        await selectFile(jsonFile({ items: [{ question: { type: 'open' } }] }));

        await waitFor(() => expect(screen.getByText(/questionBank\.import_warnings_title/)).toBeInTheDocument());
        expect(screen.getByText(/questionBank\.import_warn_missing_prompt/)).toBeInTheDocument();
        expect(screen.getByText(/questionBank\.import_no_items/)).toBeInTheDocument();
        expect(screen.queryByText(/questionBank\.import_confirm/)).not.toBeInTheDocument();
        expect(onImport).not.toHaveBeenCalled();
    });

    it('rejects a non-JSON file', async () => {
        render(<QuestionBankImportModal onImport={vi.fn()} onClose={vi.fn()} />);

        await selectFile(new File(['front,back'], 'cards.csv', { type: 'text/csv' }));

        await waitFor(() =>
            expect(screen.getByText(/questionBank\.import_warn_unsupported_file_type/)).toBeInTheDocument()
        );
    });

    it('shows the preview limit and the more-rows notice for large imports', async () => {
        render(<QuestionBankImportModal onImport={vi.fn()} onClose={vi.fn()} />);

        const items = [
            ...Array.from({ length: 11 }, (_, i) => ({
                tags: [],
                question: { prompt: `Q${i}`, type: 'short-answer', points: 1, expectedAnswers: ['x'] },
            })),
            {
                tags: ['reading'],
                cefrLevel: 'B1',
                kind: 'section',
                section: {
                    title: 'Passage',
                    questions: [
                        { prompt: 'Who?', type: 'short-answer', points: 1, expectedAnswers: ['x'] },
                        { prompt: 'What?', type: 'short-answer', points: 1, expectedAnswers: ['x'] },
                    ],
                },
            },
            'not-an-object',
        ];
        await selectFile(jsonFile({ items }));

        await waitFor(() => expect(screen.getByText(/questionBank\.import_more_rows/)).toBeInTheDocument());
        expect(screen.getAllByText(/Q/)).toHaveLength(8);
        expect(screen.getByText('questionBank.import_preview:{"count":12}')).toBeInTheDocument();
        expect(screen.getByText(/questionBank\.import_warn_malformed_item/)).toBeInTheDocument();
    });

    it('renders a section-bundle preview with its CEFR level', async () => {
        render(<QuestionBankImportModal onImport={vi.fn()} onClose={vi.fn()} />);

        await selectFile(
            jsonFile({
                items: [
                    {
                        kind: 'section',
                        cefrLevel: 'B1',
                        section: {
                            title: 'Reading passage',
                            questions: [
                                { prompt: 'Who?', type: 'short-answer', points: 1, expectedAnswers: ['x'] },
                                { prompt: 'What?', type: 'short-answer', points: 1, expectedAnswers: ['x'] },
                            ],
                        },
                    },
                ],
            })
        );

        await waitFor(() =>
            expect(
                screen.getByText('questionBank.section_bundle_title:{"title":"Reading passage"}')
            ).toBeInTheDocument()
        );
        expect(screen.getByText('questionBank.section_bundle_meta:{"count":2} · B1')).toBeInTheDocument();
    });

    it('opens the file picker via the choose button', () => {
        render(<QuestionBankImportModal onImport={vi.fn()} onClose={vi.fn()} />);
        fireEvent.click(screen.getByText('questionBank.import_choose_file'));
    });

    it('rejects an oversized file without reading it', async () => {
        render(<QuestionBankImportModal onImport={vi.fn()} onClose={vi.fn()} />);

        const big = new File([new Uint8Array(6 * 1024 * 1024)], 'huge.json', { type: 'application/json' });
        await selectFile(big);

        await waitFor(() => expect(screen.getByText(/questionBank\.import_warn_file_too_large/)).toBeInTheDocument());
    });
});
