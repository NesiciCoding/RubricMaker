import { useTranslation } from 'react-i18next';
import type { BuilderShortcut } from '../../utils/builderShortcuts';

interface Props {
    shortcuts: BuilderShortcut[];
    testId?: string;
}

/** One rendered shortcut list for the `?` overlay and the docs page, so both read the same source. */
export default function ShortcutList({ shortcuts, testId = 'shortcut-list' }: Props) {
    const { t } = useTranslation();
    return (
        <dl
            data-testid={testId}
            style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                alignItems: 'baseline',
                gap: '8px 16px',
                margin: '0 0 16px',
            }}
        >
            {shortcuts.map((shortcut) => (
                <div key={shortcut.id} style={{ display: 'contents' }}>
                    <dt style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t(shortcut.labelKey)}</dt>
                    <dd style={{ margin: 0, textAlign: 'right' }}>
                        <kbd
                            style={{
                                font: 'inherit',
                                fontSize: '0.78rem',
                                padding: '1px 6px',
                                border: '1px solid var(--border)',
                                borderRadius: 4,
                                background: 'var(--bg-elevated)',
                                color: 'var(--text)',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {shortcut.keys}
                        </kbd>
                    </dd>
                </div>
            ))}
        </dl>
    );
}
