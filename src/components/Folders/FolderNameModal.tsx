import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import Modal from '../ui/Modal';

export interface FolderNameModalProps {
    title: string;
    submitLabel: string;
    initialName?: string;
    onSubmit: (name: string) => void;
    onClose: () => void;
}

export default function FolderNameModal({
    title,
    submitLabel,
    initialName = '',
    onSubmit,
    onClose,
}: FolderNameModalProps) {
    const { t } = useTranslation();
    const [name, setName] = React.useState(initialName);
    const trimmed = name.trim();

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (trimmed) onSubmit(trimmed);
    }

    return (
        <Modal titleId="folder-name-title" onClose={onClose} maxWidth={420}>
            <form onSubmit={handleSubmit} style={{ padding: 20 }}>
                <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}
                >
                    <h2 id="folder-name-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                        {title}
                    </h2>
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={onClose}
                        aria-label={t('common.close')}
                    >
                        <X size={16} />
                    </button>
                </div>
                <label
                    htmlFor="folder-name-input"
                    style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}
                >
                    {t('folders.folder_name')}
                </label>
                <input
                    id="folder-name-input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('folders.folder_name_placeholder')}
                    maxLength={80}
                    autoFocus
                    style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
                        {t('common.cancel')}
                    </button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={!trimmed}>
                        {submitLabel}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
