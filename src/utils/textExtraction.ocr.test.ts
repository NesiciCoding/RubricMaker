import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Attachment } from '../types';

const { recognize, setParameters, terminate, createWorkerSpy } = vi.hoisted(() => ({
    recognize: vi.fn(),
    setParameters: vi.fn(),
    terminate: vi.fn(),
    createWorkerSpy: vi.fn(),
}));

vi.mock('tesseract.js', () => ({
    createWorker: createWorkerSpy,
    // Tesseract's PSM enum uses string values; mirror the ones the code resolves.
    PSM: { AUTO: '3', SINGLE_COLUMN: '4', SINGLE_BLOCK: '6', SPARSE_TEXT: '11' },
}));

import { PSM } from 'tesseract.js';
import { recognizeImage, extractText } from './textExtraction';

beforeEach(() => {
    recognize.mockReset();
    setParameters.mockReset().mockResolvedValue(undefined);
    terminate.mockReset().mockResolvedValue(undefined);
    createWorkerSpy.mockReset().mockResolvedValue({ recognize, setParameters, terminate });
    recognize.mockResolvedValue({ data: { text: '', words: [] } });
});

const imageUrl = 'data:image/png;base64,aGVsbG8=';

describe('recognizeImage', () => {
    it('returns text, mean per-word confidence in [0,1], and mapped words', async () => {
        recognize.mockResolvedValue({
            data: {
                text: 'hi there',
                confidence: 90,
                words: [
                    { text: 'hi', confidence: 80, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } },
                    { text: 'there', confidence: 100 },
                ],
            },
        });
        const result = await recognizeImage(imageUrl);
        expect(result.text).toBe('hi there');
        expect(result.confidence).toBeCloseTo(0.9, 5); // (0.8 + 1.0) / 2
        expect(result.words).toHaveLength(2);
        expect(result.words[0]).toEqual({ text: 'hi', confidence: 0.8, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } });
        expect(terminate).toHaveBeenCalledTimes(1);
    });

    it('resolves languages and requests the LSTM engine', async () => {
        await recognizeImage(imageUrl, { langs: ['en', 'nl'] });
        expect(createWorkerSpy).toHaveBeenCalledWith('eng+nld', 1);
    });

    it('sets the page-segmentation mode from the capture hint (string PSM value)', async () => {
        await recognizeImage(imageUrl, { captureHint: 'sparse' });
        expect(setParameters).toHaveBeenCalledWith({ tessedit_pageseg_mode: '11' });
    });

    it('lets an explicit psm override the capture hint', async () => {
        await recognizeImage(imageUrl, { captureHint: 'sparse', psm: PSM.SINGLE_BLOCK });
        expect(setParameters).toHaveBeenCalledWith({ tessedit_pageseg_mode: '6' });
    });

    it('flattens the nested blocks tree when a flat words array is absent', async () => {
        recognize.mockResolvedValue({
            data: {
                text: 'x',
                blocks: [{ paragraphs: [{ lines: [{ words: [{ text: 'x', confidence: 70 }] }] }] }],
            },
        });
        const result = await recognizeImage(imageUrl);
        expect(result.words).toEqual([{ text: 'x', confidence: 0.7, bbox: undefined }]);
        expect(result.confidence).toBeCloseTo(0.7, 5);
    });

    it('falls back to the overall confidence when there are no words', async () => {
        recognize.mockResolvedValue({ data: { text: '', confidence: 55, words: [], blocks: null } });
        const result = await recognizeImage(imageUrl);
        expect(result.words).toEqual([]);
        expect(result.confidence).toBeCloseTo(0.55, 5);
    });

    it('terminates the worker even when recognition throws', async () => {
        recognize.mockRejectedValue(new Error('ocr boom'));
        await expect(recognizeImage(imageUrl)).rejects.toThrow('ocr boom');
        expect(terminate).toHaveBeenCalledTimes(1);
    });
});

describe('extractText image branch (back-compatible string contract)', () => {
    it('still returns just the recognised text for an image attachment', async () => {
        recognize.mockResolvedValue({ data: { text: 'ocr output', words: [{ text: 'ocr', confidence: 90 }] } });
        const attachment = { mimeType: 'image/png', dataUrl: imageUrl, name: 'scan.png' } as Attachment;
        const text = await extractText(attachment);
        expect(text).toBe('ocr output');
    });
});
