import type { AppSettings } from '../types';

/**
 * Settings that describe who the user is on this device or hold credentials. A backup never
 * carries them and a restore never changes them — restoring someone else's backup (or an old
 * one) must not change the role, admin PIN, account email, school or API keys.
 */
export const PROTECTED_SETTINGS_KEYS = [
    'userRole',
    'userEmail',
    'adminPin',
    'standardsApiKey',
    'schoolId',
    'schoolName',
    'needsOnboarding',
] as const satisfies readonly (keyof AppSettings)[];

const PROTECTED = new Set<string>(PROTECTED_SETTINGS_KEYS);

export function withoutProtectedSettings(settings: AppSettings): Partial<AppSettings> {
    return Object.fromEntries(Object.entries(settings).filter(([key]) => !PROTECTED.has(key))) as Partial<AppSettings>;
}

export function mergeRestoredSettings(current: AppSettings, incoming: Record<string, unknown>): AppSettings {
    const restored = { ...current, ...withoutProtectedSettings(incoming as unknown as AppSettings) } as AppSettings;
    for (const key of PROTECTED_SETTINGS_KEYS) {
        if (current[key] === undefined) delete restored[key];
        else (restored as unknown as Record<string, unknown>)[key] = current[key];
    }
    return restored;
}

export interface SettingChange {
    key: string;
    from: unknown;
    to: unknown;
}

export function diffRestoredSettings(current: AppSettings, incoming: Record<string, unknown>): SettingChange[] {
    const restored = mergeRestoredSettings(current, incoming) as unknown as Record<string, unknown>;
    const before = current as unknown as Record<string, unknown>;
    return Object.keys(restored)
        .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(restored[key]))
        .sort()
        .map((key) => ({ key, from: before[key], to: restored[key] }));
}

/** True when the backup carries a protected value that differs from this device's (it will be ignored). */
export function hasIgnoredProtectedSettings(current: AppSettings, incoming: Record<string, unknown>): boolean {
    return PROTECTED_SETTINGS_KEYS.some(
        (key) => key in incoming && JSON.stringify(incoming[key]) !== JSON.stringify(current[key])
    );
}
