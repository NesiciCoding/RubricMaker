import { useTranslation } from 'react-i18next';
import { Share2, X } from 'lucide-react';
import Modal from '../ui/Modal';
import SharingControl from './SharingControl';
import type { MaterialSharing } from '../../types';
import type { ResolvedSharing } from '../../utils/materialSharing';

interface Props {
    /** Name of the rubric, test or folder being shared. */
    name: string;
    value: MaterialSharing | undefined;
    inherited: ResolvedSharing;
    onChange: (next: MaterialSharing | undefined) => void;
    onClose: () => void;
    /** Without a cloud connection the setting is still saved, but nobody else can see it yet. */
    connected: boolean;
    isFolder?: boolean;
}

export default function SharingModal({ name, value, inherited, onChange, onClose, connected, isFolder }: Props) {
    const { t } = useTranslation();
    return (
        <Modal titleId="sharing-modal-title" onClose={onClose} maxWidth={460}>
            <div className="modal-header">
                <h2 id="sharing-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Share2 size={18} aria-hidden="true" /> {t('sharing.modal_title')}
                </h2>
                <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t('common.close')}>
                    <X size={18} />
                </button>
            </div>
            <div className="modal-body">
                <p className="text-muted text-sm" style={{ marginTop: 0 }}>
                    {isFolder ? t('sharing.modal_desc_folder', { name }) : t('sharing.modal_desc', { name })}
                </p>
                {!connected && (
                    <p role="status" className="text-sm" style={{ color: 'var(--yellow-text)' }}>
                        {t('sharing.offline_note')}
                    </p>
                )}
                <SharingControl value={value} inherited={inherited} onChange={onChange} />
            </div>
            <div className="modal-footer">
                <button className="btn btn-primary" onClick={onClose}>
                    {t('common.done')}
                </button>
            </div>
        </Modal>
    );
}
