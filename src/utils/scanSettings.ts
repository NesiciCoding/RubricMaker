import type { ScanOcrSettings } from '../types';

/** Safe defaults for the scan-and-OCR settings slice: discard the image, English OCR. */
export const DEFAULT_SCAN_OCR_SETTINGS: ScanOcrSettings = {
    keepImage: false,
    defaultLang: 'eng',
};

/** Fully-defaulted scan settings, merging a (possibly absent) stored slice over the defaults. */
export function resolveScanOcrSettings(stored?: Partial<ScanOcrSettings>): ScanOcrSettings {
    return { ...DEFAULT_SCAN_OCR_SETTINGS, ...stored };
}
