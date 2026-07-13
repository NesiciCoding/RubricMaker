import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import CommentBankManager from './CommentBankManager';

interface CommentBankModalProps {
    onClose: () => void;
    onSelect?: (text: string) => void;
    /** CEFR skill/level (or other tag) strings to surface a "Suggested" group for, when set */
    suggestedTags?: string[];
}

export default function CommentBankModal({ onClose, onSelect, suggestedTags }: CommentBankModalProps) {
    const { t } = useTranslation();

    return (
        <Modal
            titleId="comment-bank-title"
            onClose={onClose}
            maxWidth={600}
            style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}
        >
            <div className="modal-header">
                <h3 id="comment-bank-title">{t('commentBank.title')}</h3>
                <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t('common.close')}>
                    <X size={18} />
                </button>
            </div>

            <div
                className="modal-body"
                style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
            >
                <CommentBankManager onSelect={onSelect} suggestedTags={suggestedTags} />
            </div>
        </Modal>
    );
}
