import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SettingChange } from '../../utils/backupSettings';

function formatValue(value: unknown): string | null {
    if (value === undefined || value === null || value === '') return '—';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    return null;
}

interface Props {
    changes: SettingChange[];
    ignoredProtected: boolean;
}

/** The settings part of the backup-import preview: what a restore changes, and what it never touches. */
export default function BackupSettingsChanges({ changes, ignoredProtected }: Props) {
    const { t } = useTranslation();
    return (
        <section aria-labelledby="backup-settings-changes-title" style={{ marginBottom: 20, fontSize: '0.875rem' }}>
            <h4 id="backup-settings-changes-title" style={{ margin: '0 0 8px', fontSize: '0.875rem' }}>
                {t('settings.backup_preview_settings_title')}
            </h4>
            {changes.length === 0 ? (
                <p className="text-muted" style={{ margin: '0 0 8px' }}>
                    {t('settings.backup_preview_settings_none')}
                </p>
            ) : (
                <ul style={{ margin: '0 0 8px', paddingLeft: 18, maxHeight: 160, overflowY: 'auto' }}>
                    {changes.map(({ key, from, to }) => {
                        const before = formatValue(from);
                        const after = formatValue(to);
                        return (
                            <li key={key} style={{ color: 'var(--text)', overflowWrap: 'anywhere' }}>
                                <code>{key}</code>
                                {': '}
                                {before !== null && after !== null
                                    ? `${before} → ${after}`
                                    : t('settings.backup_preview_settings_changed')}
                            </li>
                        );
                    })}
                </ul>
            )}
            <p className="text-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                {t(
                    ignoredProtected
                        ? 'settings.backup_preview_protected_ignored'
                        : 'settings.backup_preview_protected_note'
                )}
            </p>
        </section>
    );
}
