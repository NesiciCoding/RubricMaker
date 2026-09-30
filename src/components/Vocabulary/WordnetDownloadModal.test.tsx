import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const download = vi.fn();
vi.mock('../../services/wordnetPack', () => ({
    WORDNET_PACK_APPROX_MB: 3.3,
    downloadWordnetPack: (...a: unknown[]) => download(...a),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import WordnetDownloadModal from './WordnetDownloadModal';

describe('WordnetDownloadModal', () => {
    it('asks first, downloads only on confirm, then reports installed', async () => {
        download.mockResolvedValue(undefined);
        const onInstalled = vi.fn();
        render(<WordnetDownloadModal onClose={vi.fn()} onInstalled={onInstalled} />);
        expect(download).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: /vocabProfile.wordnet_download/ }));
        await waitFor(() => expect(onInstalled).toHaveBeenCalled());
    });

    it('shows an error and offers retry when the download fails', async () => {
        download.mockRejectedValue(new Error('x'));
        render(<WordnetDownloadModal onClose={vi.fn()} onInstalled={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /vocabProfile.wordnet_download/ }));
        expect(await screen.findByRole('alert')).toHaveTextContent('vocabProfile.wordnet_failed');
        expect(screen.getByRole('button', { name: /vocabProfile.wordnet_retry/ })).toBeEnabled();
    });
});
