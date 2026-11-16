import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import ShortcutList from '../ui/ShortcutList';
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
                <ShortcutList shortcuts={BUILDER_SHORTCUTS} testId="shortcuts-list" />
            </div>
        </Modal>
    );
}
