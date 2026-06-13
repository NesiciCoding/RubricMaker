import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EssayImportModal from '../Essay/EssayImportModal';
import type { EssaySubmission } from '../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
}));

vi.mock('../../utils/essaySubmissionCode', () => ({
    decodeEssaySubmission: vi.fn(),
}));

let mockDbConnected = false;
vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: mockDbConnected, status: 'idle', lastSyncAt: null }),
}));

import { decodeEssaySubmission } from '../../utils/essaySubmissionCode';
const mockDecode = vi.mocked(decodeEssaySubmission);

const dbSubmission = {
    id: 'db-1',
    studentEmail: 'alice@school.com',
    wordCount: 120,
    wordLimitStatus: 'ok' as const,
    submittedAt: '2024-03-01T10:00:00Z',
    storagePath: 'submissions/db-1.html',
};

function dbProps(overrides: Record<string, unknown> = {}) {
    return {
        ...baseProps,
        teacherKey: 'teacher-1',
        onFetchSubmissions: vi.fn(async () => [dbSubmission]),
        onGetSignedUrl: vi.fn(async () => 'https://example.com/signed-url'),
        onDeleteSubmission: vi.fn(async () => ({ success: true })),
        ...overrides,
    };
}

const baseProps = {
    rubricId: 'r1',
    studentId: 's1',
    studentName: 'Alice',
    onImport: vi.fn(),
    onClose: vi.fn(),
};

const validSubmission = {
    id: 'sub-1',
    assignmentRubricId: 'r1',
    assignmentStudentId: 's1',
    teacherKey: 'teacher-1',
    contentHtml: '<p>Hello world</p>',
    wordCount: 2,
    submittedAt: '2024-03-01T10:00:00Z',
};

describe('EssayImportModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders student name in header', () => {
        render(<EssayImportModal {...baseProps} />);
        expect(screen.getByText(/Import essay — Alice/)).toBeInTheDocument();
    });

    it('renders textarea for submission code', () => {
        render(<EssayImportModal {...baseProps} />);
        expect(screen.getByPlaceholderText(/Paste the student's submission code/i)).toBeInTheDocument();
    });

    it('import button is disabled when code is empty', () => {
        render(<EssayImportModal {...baseProps} />);
        const btn = screen.getByRole('button', { name: /import essay/i });
        expect(btn).toBeDisabled();
    });

    it('import button becomes enabled after typing code', () => {
        render(<EssayImportModal {...baseProps} />);
        const textarea = screen.getByPlaceholderText(/Paste the student's submission code/i);
        fireEvent.change(textarea, { target: { value: 'some-code' } });
        const btn = screen.getByRole('button', { name: /import essay/i });
        expect(btn).not.toBeDisabled();
    });

    it('shows error when decode returns null', () => {
        mockDecode.mockReturnValue(null);
        render(<EssayImportModal {...baseProps} />);
        const textarea = screen.getByPlaceholderText(/Paste the student's submission code/i);
        fireEvent.change(textarea, { target: { value: 'bad-code' } });
        fireEvent.click(screen.getByRole('button', { name: /import essay/i }));
        expect(screen.getByText(/Invalid submission code/i)).toBeInTheDocument();
    });

    it('shows error when rubricId does not match', () => {
        mockDecode.mockReturnValue({ ...validSubmission, assignmentRubricId: 'r-other' });
        render(<EssayImportModal {...baseProps} />);
        const textarea = screen.getByPlaceholderText(/Paste the student's submission code/i);
        fireEvent.change(textarea, { target: { value: 'code' } });
        fireEvent.click(screen.getByRole('button', { name: /import essay/i }));
        expect(screen.getByText(/different student or rubric/i)).toBeInTheDocument();
        expect(baseProps.onImport).not.toHaveBeenCalled();
    });

    it('shows error when studentId does not match', () => {
        mockDecode.mockReturnValue({ ...validSubmission, assignmentStudentId: 's-other' });
        render(<EssayImportModal {...baseProps} />);
        const textarea = screen.getByPlaceholderText(/Paste the student's submission code/i);
        fireEvent.change(textarea, { target: { value: 'code' } });
        fireEvent.click(screen.getByRole('button', { name: /import essay/i }));
        expect(screen.getByText(/different student or rubric/i)).toBeInTheDocument();
    });

    it('calls onImport with correct attachment on valid submission', () => {
        mockDecode.mockReturnValue(validSubmission);
        render(<EssayImportModal {...baseProps} />);
        fireEvent.change(screen.getByPlaceholderText(/Paste the student's submission code/i), {
            target: { value: 'valid-code' },
        });
        fireEvent.click(screen.getByRole('button', { name: /import essay/i }));
        expect(baseProps.onImport).toHaveBeenCalledWith(
            expect.objectContaining({
                mimeType: 'text/html',
                rubricId: 'r1',
                studentId: 's1',
            })
        );
    });

    it('shows success state after valid import', () => {
        mockDecode.mockReturnValue(validSubmission);
        render(<EssayImportModal {...baseProps} />);
        fireEvent.change(screen.getByPlaceholderText(/Paste the student's submission code/i), {
            target: { value: 'valid-code' },
        });
        fireEvent.click(screen.getByRole('button', { name: /import essay/i }));
        expect(screen.getByText(/Essay imported successfully/i)).toBeInTheDocument();
        expect(screen.getByText(/2 words/i)).toBeInTheDocument();
    });

    it('close button calls onClose', () => {
        render(<EssayImportModal {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /close/i }));
    });

    it('cancel button calls onClose', () => {
        render(<EssayImportModal {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(baseProps.onClose).toHaveBeenCalled();
    });

    it('typing clears existing error', () => {
        mockDecode.mockReturnValue(null);
        render(<EssayImportModal {...baseProps} />);
        const textarea = screen.getByPlaceholderText(/Paste the student's submission code/i);
        fireEvent.change(textarea, { target: { value: 'bad' } });
        fireEvent.click(screen.getByRole('button', { name: /import essay/i }));
        expect(screen.getByText(/Invalid submission code/i)).toBeInTheDocument();
        fireEvent.change(textarea, { target: { value: 'updated' } });
        expect(screen.queryByText(/Invalid submission code/i)).not.toBeInTheDocument();
    });

    describe('word limit status badges', () => {
        function importWith(wordLimitStatus: EssaySubmission['wordLimitStatus']) {
            mockDecode.mockReturnValue({ ...validSubmission, wordLimitStatus });
            render(<EssayImportModal {...baseProps} />);
            fireEvent.change(screen.getByPlaceholderText(/Paste the student's submission code/i), {
                target: { value: 'code' },
            });
            fireEvent.click(screen.getByRole('button', { name: /import essay/i }));
        }

        it('shows over-limit badge after importing an over-limit submission', () => {
            importWith('over');
            // t('essay.word_limit_over') returns the key verbatim; EssayImportModal uses useTranslation
            expect(screen.getByText(/essay\.word_limit_over/i)).toBeInTheDocument();
        });

        it('shows under-limit badge after importing an under-limit submission', () => {
            importWith('under');
            expect(screen.getByText(/essay\.word_limit_under/i)).toBeInTheDocument();
        });

        it('shows no limit badge when status is "ok"', () => {
            importWith('ok');
            expect(screen.queryByText(/essay\.word_limit_over/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/essay\.word_limit_under/i)).not.toBeInTheDocument();
        });

        it('shows no limit badge for legacy submissions without a status', () => {
            importWith(undefined);
            expect(screen.queryByText(/essay\.word_limit_over/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/essay\.word_limit_under/i)).not.toBeInTheDocument();
        });

        it('shows no limit badge when status is null (no limits configured on assignment)', () => {
            importWith(null);
            expect(screen.queryByText(/essay\.word_limit_over/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/essay\.word_limit_under/i)).not.toBeInTheDocument();
        });
    });

    describe('database tab', () => {
        beforeEach(() => {
            mockDbConnected = true;
        });

        afterEach(() => {
            vi.restoreAllMocks();
            vi.unstubAllGlobals();
        });

        it('does not show the database tab when db is not connected', () => {
            mockDbConnected = false;
            render(<EssayImportModal {...dbProps()} />);
            expect(screen.getByPlaceholderText(/Paste the student's submission code/i)).toBeInTheDocument();
            expect(screen.queryByText('From database')).not.toBeInTheDocument();
        });

        it('still shows the database tab when teacherKey is missing', async () => {
            const props = dbProps({ teacherKey: undefined });
            render(<EssayImportModal {...props} />);
            expect(screen.getByText('From database')).toBeInTheDocument();
            expect(props.onFetchSubmissions).toHaveBeenCalledWith('');
            expect(await screen.findByText('alice@school.com')).toBeInTheDocument();
        });

        it('defaults to the database tab and loads submissions', async () => {
            const props = dbProps();
            render(<EssayImportModal {...props} />);
            expect(props.onFetchSubmissions).toHaveBeenCalledWith('teacher-1');
            expect(await screen.findByText('alice@school.com')).toBeInTheDocument();
            expect(screen.getByText(/120 words/)).toBeInTheDocument();
        });

        it('shows a loading indicator while submissions are being fetched', async () => {
            let resolveFetch: (rows: (typeof dbSubmission)[]) => void = () => {};
            const onFetchSubmissions = vi.fn(
                () =>
                    new Promise<(typeof dbSubmission)[]>((resolve) => {
                        resolveFetch = resolve;
                    })
            );
            render(<EssayImportModal {...dbProps({ onFetchSubmissions })} />);
            expect(screen.getByText('Loading…')).toBeInTheDocument();
            resolveFetch([dbSubmission]);
            expect(await screen.findByText('alice@school.com')).toBeInTheDocument();
        });

        it('shows an empty state when there are no submissions', async () => {
            render(<EssayImportModal {...dbProps({ onFetchSubmissions: vi.fn(async () => []) })} />);
            expect(await screen.findByText('No submissions yet for this assignment.')).toBeInTheDocument();
        });

        it('shows an error when loading submissions fails', async () => {
            render(
                <EssayImportModal
                    {...dbProps({
                        onFetchSubmissions: vi.fn(async () => {
                            throw new Error('boom');
                        }),
                    })}
                />
            );
            expect(
                await screen.findByText(/Failed to load submissions\. Make sure you are connected/i)
            ).toBeInTheDocument();
        });

        it('refreshes submissions when the refresh button is clicked', async () => {
            const props = dbProps();
            render(<EssayImportModal {...props} />);
            await screen.findByText('alice@school.com');
            fireEvent.click(screen.getByTitle('Refresh'));
            expect(props.onFetchSubmissions).toHaveBeenCalledTimes(2);
        });

        it('switches between the database and code-paste tabs', async () => {
            render(<EssayImportModal {...dbProps()} />);
            await screen.findByText('alice@school.com');
            fireEvent.click(screen.getByText('Paste code'));
            expect(screen.getByPlaceholderText(/Paste the student's submission code/i)).toBeInTheDocument();
            fireEvent.click(screen.getByText('From database'));
            expect(await screen.findByText('alice@school.com')).toBeInTheDocument();
        });

        it('shows over and under word-limit badges in the submission list', async () => {
            const overSub = {
                ...dbSubmission,
                id: 'db-2',
                studentEmail: 'bob@school.com',
                wordLimitStatus: 'over' as const,
            };
            const underSub = {
                ...dbSubmission,
                id: 'db-3',
                studentEmail: 'cara@school.com',
                wordLimitStatus: 'under' as const,
            };
            render(<EssayImportModal {...dbProps({ onFetchSubmissions: vi.fn(async () => [overSub, underSub]) })} />);
            expect(await screen.findByText('essay.word_limit_over')).toBeInTheDocument();
            expect(screen.getByText('essay.word_limit_under')).toBeInTheDocument();
        });

        it('shows "Anonymous" for submissions without a student email', async () => {
            const anon = { ...dbSubmission, studentEmail: null };
            render(<EssayImportModal {...dbProps({ onFetchSubmissions: vi.fn(async () => [anon]) })} />);
            expect(await screen.findByText('Anonymous')).toBeInTheDocument();
        });

        it('imports a submission from the database and shows the success screen', async () => {
            const fetchMock = vi.fn(async () => ({ ok: true, text: async () => '<p>Essay body</p>' }));
            vi.stubGlobal('fetch', fetchMock);
            const props = dbProps();
            render(<EssayImportModal {...props} />);
            fireEvent.click(await screen.findByRole('button', { name: /^import$/i }));

            expect(await screen.findByText(/Essay imported successfully/i)).toBeInTheDocument();
            expect(props.onGetSignedUrl).toHaveBeenCalledWith('submissions/db-1.html');
            expect(fetchMock).toHaveBeenCalledWith('https://example.com/signed-url');
            expect(props.onImport).toHaveBeenCalledWith(
                expect.objectContaining({ mimeType: 'text/html', rubricId: 'r1', studentId: 's1' })
            );
        });

        it('does nothing when clicking import without an onGetSignedUrl handler', async () => {
            const props = dbProps({ onGetSignedUrl: undefined });
            render(<EssayImportModal {...props} />);
            fireEvent.click(await screen.findByRole('button', { name: /^import$/i }));
            expect(props.onImport).not.toHaveBeenCalled();
            expect(screen.queryByText(/Essay imported successfully/i)).not.toBeInTheDocument();
        });

        it('falls back to the student name when importing an anonymous submission', async () => {
            const fetchMock = vi.fn(async () => ({ ok: true, text: async () => '<p>Essay body</p>' }));
            vi.stubGlobal('fetch', fetchMock);
            const anon = { ...dbSubmission, studentEmail: null };
            const props = dbProps({ onFetchSubmissions: vi.fn(async () => [anon]) });
            render(<EssayImportModal {...props} />);
            fireEvent.click(await screen.findByRole('button', { name: /^import$/i }));
            expect(await screen.findByText(/Essay imported successfully/i)).toBeInTheDocument();
            expect(props.onImport).toHaveBeenCalledWith(
                expect.objectContaining({ name: expect.stringContaining(`Essay – ${baseProps.studentName} –`) })
            );
        });

        it('falls back to a generic label when confirming deletion of an anonymous submission', async () => {
            const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
            const anon = { ...dbSubmission, studentEmail: null };
            const props = dbProps({ onFetchSubmissions: vi.fn(async () => [anon]) });
            render(<EssayImportModal {...props} />);
            await screen.findByText('Anonymous');
            fireEvent.click(screen.getByTitle('Delete submission'));
            expect(confirmSpy).toHaveBeenCalledWith('Delete this submission from student? This cannot be undone.');
            confirmSpy.mockRestore();
        });

        it('shows an error when no signed URL can be obtained', async () => {
            const props = dbProps({ onGetSignedUrl: vi.fn(async () => null) });
            render(<EssayImportModal {...props} />);
            fireEvent.click(await screen.findByRole('button', { name: /^import$/i }));
            expect(await screen.findByText(/Could not get download URL\. Try again\./i)).toBeInTheDocument();
            expect(props.onImport).not.toHaveBeenCalled();
        });

        it('shows an error when downloading the essay fails', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn(async () => {
                    throw new Error('network down');
                })
            );
            const props = dbProps();
            render(<EssayImportModal {...props} />);
            fireEvent.click(await screen.findByRole('button', { name: /^import$/i }));
            expect(
                await screen.findByText(/Failed to download essay\. Check your connection and try again\./i)
            ).toBeInTheDocument();
        });

        it('shows an error when the download response is not ok', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }))
            );
            const props = dbProps();
            render(<EssayImportModal {...props} />);
            fireEvent.click(await screen.findByRole('button', { name: /^import$/i }));
            expect(
                await screen.findByText(/Failed to download essay\. Check your connection and try again\./i)
            ).toBeInTheDocument();
            expect(props.onImport).not.toHaveBeenCalled();
        });

        it('deletes a submission after confirmation', async () => {
            const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
            const props = dbProps();
            render(<EssayImportModal {...props} />);
            await screen.findByText('alice@school.com');
            fireEvent.click(screen.getByTitle('Delete submission'));
            expect(confirmSpy).toHaveBeenCalledWith(
                'Delete this submission from alice@school.com? This cannot be undone.'
            );
            await vi.waitFor(() =>
                expect(props.onDeleteSubmission).toHaveBeenCalledWith('db-1', 'submissions/db-1.html')
            );
            await vi.waitFor(() => expect(screen.queryByText('alice@school.com')).not.toBeInTheDocument());
            confirmSpy.mockRestore();
        });

        it('does not delete a submission when the confirmation is cancelled', async () => {
            const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
            const props = dbProps();
            render(<EssayImportModal {...props} />);
            await screen.findByText('alice@school.com');
            fireEvent.click(screen.getByTitle('Delete submission'));
            expect(props.onDeleteSubmission).not.toHaveBeenCalled();
            expect(screen.getByText('alice@school.com')).toBeInTheDocument();
            confirmSpy.mockRestore();
        });

        it('shows an error message when deleting a submission fails', async () => {
            const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
            const props = dbProps({
                onDeleteSubmission: vi.fn(async () => ({ success: false, error: 'permission denied' })),
            });
            render(<EssayImportModal {...props} />);
            await screen.findByText('alice@school.com');
            fireEvent.click(screen.getByTitle('Delete submission'));
            expect(await screen.findByText('Delete failed: permission denied')).toBeInTheDocument();
            expect(screen.getByText('alice@school.com')).toBeInTheDocument();
            confirmSpy.mockRestore();
        });

        it('hides the delete button when onDeleteSubmission is not provided', async () => {
            render(<EssayImportModal {...dbProps({ onDeleteSubmission: undefined })} />);
            await screen.findByText('alice@school.com');
            expect(screen.queryByTitle('Delete submission')).not.toBeInTheDocument();
        });

        it('closes the modal from the database tab cancel button', async () => {
            const props = dbProps();
            render(<EssayImportModal {...props} />);
            await screen.findByText('alice@school.com');
            fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
            expect(props.onClose).toHaveBeenCalled();
        });
    });
});
