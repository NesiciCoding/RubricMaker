import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, withSettingsDefaults } from './settingsDefaults';
import type { AppSettings } from '../types';

describe('withSettingsDefaults (#706)', () => {
    it('fills a missing defaultFormat and keeps the stored values', () => {
        const merged = withSettingsDefaults({ language: 'nl', theme: 'dark', defaultGradeScaleId: 'letter-10' });
        expect(merged.defaultFormat).toEqual(DEFAULT_SETTINGS.defaultFormat);
        expect(merged.language).toBe('nl');
        expect(merged.theme).toBe('dark');
    });

    it('fills keys missing inside a partial defaultFormat without dropping the stored ones', () => {
        const partial = { defaultFormat: { fontSize: 18 } } as unknown as Partial<AppSettings>;
        const merged = withSettingsDefaults(partial);
        expect(merged.defaultFormat.fontSize).toBe(18);
        expect(merged.defaultFormat.fontFamily).toBe(DEFAULT_SETTINGS.defaultFormat.fontFamily);
    });

    it('returns the defaults for missing settings', () => {
        expect(withSettingsDefaults(undefined)).toEqual(DEFAULT_SETTINGS);
        expect(withSettingsDefaults(null)).toEqual(DEFAULT_SETTINGS);
    });
});
