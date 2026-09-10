import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ScanCaptureModal from '../ScanCaptureModal';
import type { OcrResult } from '../../../utils/textExtraction';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (_k: string, fb?: string) => fb ?? _k }),
}));

const { start, capture, stop, videoRef } = vi.hoisted(() => ({
    start: vi.fn(async () => true),
    capture: vi.fn(async () => ({
        blob: new Blob(['cam'], { type: 'image/png' }),
        mimeType: 'image/png',
        width: 4,
        height: 4,
    })),
    stop: vi.fn(),
    videoRef: { current: null },
}));
vi.mock('../../../hooks/useCameraCapture', () => ({
    useCameraCapture: () => ({ status: 'idle', error: null, videoRef, start, capture, stop }),
}));

const { importScanFiles } = vi.hoisted(() => ({ importScanFiles: vi.fn() }));
vi.mock('../../../utils/scanImport', () => ({ importScanFiles }));

vi.mock('../../../utils/fileToDataUrl', () => ({
    fileToDataUrl: vi.fn(async () => 'data:image/png;base64,aGk='),
}));

const { recognizeImage } = vi.hoisted(() => ({ recognizeImage: vi.fn() }));
vi.mock('../../../utils/textExtraction', () => ({ recognizeImage }));

const { putScanBlob, newScanId } = vi.hoisted(() => ({
    putScanBlob: vi.fn(async () => ({ blob: new Blob(), mimeType: 'image/png' })),
    newScanId: vi.fn(() => 'scan_test'),
}));
vi.mock('../../../services/scanStore', () => ({ putScanBlob, newScanId }));

const ocr: OcrResult = {
    text: 'teh cat sat',
    confidence: 0.7,
    words: [
        { text: 'teh', confidence: 0.4 },
        { text: 'cat', confidence: 0.95 },
        { text: 'sat', confidence: 0.9 },
    ],
};

function pickFile() {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'work.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
    vi.clearAllMocks();
    importScanFiles.mockResolvedValue({
        images: [{ blob: new Blob(['x'], { type: 'image/png' }), mimeType: 'image/png', sourceName: 'work.png' }],
        skipped: [],
    });
    recognizeImage.mockResolvedValue(ocr);
});

describe('ScanCaptureModal', () => {
    it('imports a file, OCRs it, and inserts the reviewed text', async () => {
        const onInsert = vi.fn();
        const onClose = vi.fn();
        render(<ScanCaptureModal defaultLang="eng" keepImage={false} onInsert={onInsert} onClose={onClose} />);

        pickFile();

        const textarea = (await screen.findByLabelText('Review & correct the text')) as HTMLTextAreaElement;
        expect(textarea.value).toBe('teh cat sat');
        expect(recognizeImage).toHaveBeenCalledWith('data:image/png;base64,aGk=', {
            langs: 'eng',
            captureHint: 'auto',
        });

        fireEvent.change(textarea, { target: { value: 'the cat sat' } });
        fireEvent.click(screen.getByText('Insert into feedback'));

        expect(onInsert).toHaveBeenCalledWith('the cat sat');
        expect(onClose).toHaveBeenCalled();
        expect(putScanBlob).not.toHaveBeenCalled();
    });

    it('highlights low-confidence words for the teacher to check', async () => {
        render(<ScanCaptureModal defaultLang="eng" keepImage={false} onInsert={vi.fn()} onClose={vi.fn()} />);
        pickFile();
        await screen.findByLabelText('Review & correct the text');
        // 'teh' (0.4) is below the default 0.6 threshold; 'cat'/'sat' are not.
        expect(screen.getByText('teh')).toBeInTheDocument();
        expect(screen.queryByText('cat')).not.toBeInTheDocument();
    });

    it('keeps the source image in scanStore when keepImage is on', async () => {
        render(<ScanCaptureModal defaultLang="eng+nld" keepImage onInsert={vi.fn()} onClose={vi.fn()} />);
        pickFile();
        await screen.findByLabelText('Review & correct the text');
        fireEvent.click(screen.getByText('Insert into feedback'));
        await waitFor(() => expect(putScanBlob).toHaveBeenCalledWith('scan_test', expect.anything(), 'image/png'));
    });

    it('captures from the camera when chosen', async () => {
        render(<ScanCaptureModal defaultLang="eng" keepImage={false} onInsert={vi.fn()} onClose={vi.fn()} />);
        fireEvent.click(screen.getByText('Use camera'));
        await waitFor(() => expect(start).toHaveBeenCalled());
        fireEvent.click(await screen.findByText('Take photo'));
        await screen.findByLabelText('Review & correct the text');
        expect(capture).toHaveBeenCalled();
        expect(stop).toHaveBeenCalled();
    });

    it('surfaces an OCR failure and lets the teacher scan again', async () => {
        recognizeImage.mockRejectedValueOnce(new Error('ocr boom'));
        render(<ScanCaptureModal defaultLang="eng" keepImage={false} onInsert={vi.fn()} onClose={vi.fn()} />);
        pickFile();
        expect(await screen.findByText('ocr boom')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Scan again'));
        expect(screen.getByText('What are you scanning?')).toBeInTheDocument();
    });

    it('reports when an imported file has no scannable image', async () => {
        importScanFiles.mockResolvedValueOnce({ images: [], skipped: [{ name: 'x.txt', reason: 'unsupported-type' }] });
        render(<ScanCaptureModal defaultLang="eng" keepImage={false} onInsert={vi.fn()} onClose={vi.fn()} />);
        pickFile();
        expect(await screen.findByText('That file had no scannable image.')).toBeInTheDocument();
    });
});
