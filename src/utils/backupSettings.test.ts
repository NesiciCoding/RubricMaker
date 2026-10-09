import { describe, expect, it } from 'vitest';
import type { AppSettings } from '../types';
import { DEFAULT_FORMAT } from '../types';
import {
    diffRestoredSettings,
    hasIgnoredProtectedSettings,
    mergeRestoredSettings,
    withoutProtectedSettings,
} from './backupSettings';

const base: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

describe('backupSettings', () => {
    it('strips identity and credential settings', () => {
        const out = withoutProtectedSettings({ ...base, userRole: 'admin', adminPin: '1', standardsApiKey: 'k' });
        expect(out).toEqual(base);
    });

    it('keeps the current protected values and drops ones this device does not have', () => {
        const merged = mergeRestoredSettings(
            { ...base, userRole: 'teacher' },
            { ...base, theme: 'light', userRole: 'student', adminPin: '9999' }
        );
        expect(merged.theme).toBe('light');
        expect(merged.userRole).toBe('teacher');
        expect(merged).not.toHaveProperty('adminPin');
    });

    it('keeps settings the backup does not mention', () => {
        const merged = mergeRestoredSettings({ ...base, dyslexiaFriendlyMode: true }, { theme: 'light' });
        expect(merged.dyslexiaFriendlyMode).toBe(true);
    });

    it('lists only the settings a restore would actually change', () => {
        const changes = diffRestoredSettings(
            { ...base, userRole: 'admin' },
            { ...base, theme: 'light', language: 'nl', userRole: 'student' }
        );
        expect(changes).toEqual([
            { key: 'language', from: 'en', to: 'nl' },
            { key: 'theme', from: 'dark', to: 'light' },
        ]);
    });

    it('reports when a backup carries protected values that will be ignored', () => {
        expect(hasIgnoredProtectedSettings({ ...base, userRole: 'admin' }, { userRole: 'student' })).toBe(true);
        expect(hasIgnoredProtectedSettings({ ...base, userRole: 'admin' }, { userRole: 'admin' })).toBe(false);
        expect(hasIgnoredProtectedSettings(base, { theme: 'light' })).toBe(false);
    });
});
