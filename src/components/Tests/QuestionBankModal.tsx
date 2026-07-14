import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import QuestionBankManager from './QuestionBankManager';
import type { QuestionBankItem } from '../../types';

interface QuestionBankModalProps {
    onClose: () => void;
    onSelect: (item: QuestionBankItem) => void;
}

export default function QuestionBankModal({ onClose, onSelect }: QuestionBankModalProps) {
    const { t } = useTranslation();

    return (
        <Modal
            titleId="question-bank-title"
            onClose={onClose}
            maxWidth={600}
            style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}
        >
            <div className="modal-header">
                <h3 id="question-bank-title">{t('questionBank.insert_title')}</h3>
                <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    onClick={onClose}
                    aria-label={t('common.close')}
                >
                    <X size={18} />
                </button>
            </div>

            <div
                className="modal-body"
                style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
            >
                <QuestionBankManager onSelect={onSelect} />
            </div>
        </Modal>
    );
}
