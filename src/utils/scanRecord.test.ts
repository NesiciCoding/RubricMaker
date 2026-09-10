import { describe, it, expect } from 'vitest';
import type { ScanOcrSettings } from '../types';
import type { OcrResult } from './textExtraction';
import { buildScanRecord, finalizeScanReview } from './scanRecord';

const ocr: OcrResult = {
    text: 'teh cat',
    confidence: 0.72,
    words: [
        { text: 'teh', confidence: 0.5 },
        { text: 'cat', confidence: 0.94 },
    ],
};

describe('buildScanRecord', () => {
    it('assembles a local-only scan record (no storagePath, synced false)', () => {
        const scan = buildScanRecord({
            id: 'scan_1',
            studentId: 'stu_1',
            rubricId: 'rub_1',
            ocrText: 'the cat',
            ocrConfidence: 0.72,
            lang: 'eng',
            schoolYear: '2025-2026',
            createdAt: '2026-09-10T06:00:00.000Z',
        });
        expect(scan).toEqual({
            id: 'scan_1',
            studentId: 'stu_1',
            rubricId: 'rub_1',
            ocrText: 'the cat',
            ocrConfidence: 0.72,
            lang: 'eng',
            schoolYear: '2025-2026',
            createdAt: '2026-09-10T06:00:00.000Z',
            synced: false,
        });
        expect(scan.storagePath).toBeUndefined();
    });

    it('defaults createdAt to an ISO timestamp when omitted', () => {
        const scan = buildScanRecord({ id: 'scan_2', ocrText: 'x', schoolYear: '2025-2026' });
        expect(Number.isNaN(Date.parse(scan.createdAt))).toBe(false);
    });
});

describe('finalizeScanReview', () => {
    const base = {
        id: 'scan_3',
        studentId: 'stu_9',
        editedText: 'the cat',
        result: ocr,
        lang: 'eng',
        schoolYear: '2025-2026' as const,
        createdAt: '2026-09-10T06:00:00.000Z',
    };

    it('uses the edited text and carries confidence, discarding the image by default', () => {
        const settings: ScanOcrSettings = { keepImage: false, defaultLang: 'eng' };
        const { scan, discardImage } = finalizeScanReview({ ...base, settings });
        expect(scan.ocrText).toBe('the cat');
        expect(scan.ocrConfidence).toBe(0.72);
        expect(scan.studentId).toBe('stu_9');
        expect(scan.synced).toBe(false);
        expect(discardImage).toBe(true);
    });

    it('keeps the image when keepImage is enabled', () => {
        const settings: ScanOcrSettings = { keepImage: true, defaultLang: 'eng' };
        const { discardImage } = finalizeScanReview({ ...base, settings });
        expect(discardImage).toBe(false);
    });
});
