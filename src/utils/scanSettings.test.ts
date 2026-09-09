import { describe, it, expect } from 'vitest';
import { DEFAULT_SCAN_OCR_SETTINGS, resolveScanOcrSettings } from './scanSettings';

describe('resolveScanOcrSettings', () => {
    it('returns the defaults when nothing is stored', () => {
        expect(resolveScanOcrSettings()).toEqual(DEFAULT_SCAN_OCR_SETTINGS);
        expect(resolveScanOcrSettings(undefined)).toEqual(DEFAULT_SCAN_OCR_SETTINGS);
    });

    it('defaults to the privacy-preserving discard-after-OCR choice', () => {
        expect(resolveScanOcrSettings().keepImage).toBe(false);
    });

    it('overlays stored values over the defaults', () => {
        expect(resolveScanOcrSettings({ keepImage: true })).toEqual({
            keepImage: true,
            defaultLang: 'eng',
        });
    });

    it('does not mutate the shared defaults object', () => {
        resolveScanOcrSettings({ defaultLang: 'nld' });
        expect(DEFAULT_SCAN_OCR_SETTINGS.defaultLang).toBe('eng');
    });
});
