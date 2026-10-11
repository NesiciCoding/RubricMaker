import type { AppSettings } from '../types';
import { DEFAULT_FORMAT } from '../types';

export const DEFAULT_SETTINGS: AppSettings = {
    defaultGradeScaleId: 'letter-10',
    theme: 'light',
    language: 'en',
    accentColor: '',
    defaultFormat: DEFAULT_FORMAT,
};

// Settings from an older backup or a cloud row can predate fields added since (defaultFormat,
// or keys inside it); pages read those unguarded, so every way settings enter state fills them.
export function withSettingsDefaults(stored: Partial<AppSettings> | null | undefined): AppSettings {
    const settings = stored ?? {};
    return {
        ...DEFAULT_SETTINGS,
        ...settings,
        defaultFormat: { ...DEFAULT_SETTINGS.defaultFormat, ...settings.defaultFormat },
    };
}
