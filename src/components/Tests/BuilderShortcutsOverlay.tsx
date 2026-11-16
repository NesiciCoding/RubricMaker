import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import { BUILDER_SHORTCUTS } from '../../utils/builderShortcuts';

interface Props {
    open: boolean;
    onClose: () => void;
}

/** The `?` overlay: every builder shortcut, from the same list the docs describe. */
export default function BuilderShortcutsOverlay({ open, onClose }: Props) {
    const { t } = useTranslation();
    if (!open) return null;
    return (
        <Modal titleId="builder-shortcuts-title" onClose={onClose} maxWidth={520}>
            <div className="modal-header">
                <h3 id="builder-shortcuts-title">{t('tests.shortcuts_title')}</h3>
                <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                    {t('common.close')}
                </button>
            </div>
            <div className="modal-body">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 12px' }}>
                    {t('tests.shortcuts_intro')}
                </p>
                <dl
                    data-testid="shortcuts-list"
                    style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px 16px', margin: 0 }}
                >
                    {BUILDER_SHORTCUTS.map((shortcut) => (
                        <div key={shortcut.id} style={{ display: 'contents' }}>
                            <dt style={{ fontSize: '0.85rem' }}>{t(shortcut.labelKey)}</dt>
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
            </div>
        </Modal>
    );
}
