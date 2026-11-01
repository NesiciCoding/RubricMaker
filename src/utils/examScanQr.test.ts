import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RgbaImage } from '../types';

const { jsQR } = vi.hoisted(() => ({ jsQR: vi.fn() }));
vi.mock('jsqr', () => ({ default: jsQR }));

import { decodeAnswerSheetQr, decodeQr, parseAnswerSheetQr } from './examScanQr';

function page(): RgbaImage {
    const width = 210;
    const height = 297;
    return { data: new Uint8ClampedArray(width * height * 4).fill(255), width, height };
}

beforeEach(() => {
    jsQR.mockReset();
});

describe('parseAnswerSheetQr', () => {
    it('accepts an answer-sheet payload with an optional page count', () => {
        expect(
            parseAnswerSheetQr(JSON.stringify({ testId: 't1', studentId: 's1', sheetType: 'answer', pages: 2 }))
        ).toEqual({ testId: 't1', studentId: 's1', pages: 2 });
    });

    it('ignores the retired marker flag on sheets exported before the layout was unified', () => {
        expect(
            parseAnswerSheetQr(
                JSON.stringify({ testId: 't1', studentId: 's1', sheetType: 'answer', pages: 2, markers: true })
            )
        ).toEqual({ testId: 't1', studentId: 's1', pages: 2 });
    });

    it('ignores non-answer payloads and malformed JSON', () => {
        expect(parseAnswerSheetQr('not json')).toBeNull();
        expect(parseAnswerSheetQr(JSON.stringify({ testId: 't1', sheetType: 'slip' }))).toBeNull();
        expect(parseAnswerSheetQr(JSON.stringify({ sheetType: 'answer' }))).toBeNull();
        expect(parseAnswerSheetQr(null)).toBeNull();
    });
});

describe('decodeAnswerSheetQr', () => {
    it('reads the QR from the printed bottom-right position', async () => {
        jsQR.mockReturnValueOnce({ data: JSON.stringify({ testId: 't1', studentId: 's1', sheetType: 'answer' }) });
        await expect(decodeAnswerSheetQr(page())).resolves.toEqual({ testId: 't1', studentId: 's1' });
    });

    it('falls back to the whole page when the fixed position does not decode', async () => {
        jsQR.mockReturnValueOnce(null).mockReturnValueOnce({
            data: JSON.stringify({ testId: 't1', sheetType: 'answer' }),
        });
        await expect(decodeAnswerSheetQr(page())).resolves.toEqual({ testId: 't1' });
    });

    it('returns null when no QR is found', async () => {
        jsQR.mockReturnValue(null);
        await expect(decodeAnswerSheetQr(page())).resolves.toBeNull();
        await expect(decodeQr({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).resolves.toBeNull();
    });
});
