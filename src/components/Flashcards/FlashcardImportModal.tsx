import React, { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import {
    parseFlashcardFile,
    UnsupportedFlashcardFileError,
    type ParsedFlashcard,
} from '../../utils/flashcardImport';

interface Props {
    onImport: (cards: ParsedFlashcard[]) => void;
    onClose: () => void;
}

const PREVIEW_LIMIT = 8;

export default function FlashcardImportModal({ onImport, onClose }: Props) {
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [cards, setCards] = useState<ParsedFlashcard[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [parsing, setParsing] = useState(false);

    async function handleFile(file: File) {
        setParsing(true);
        setError(null);
        try {
            const parsed = await parseFlashcardFile(file);
            if (parsed.length === 0) {
                setError(t('flashcards.import_no_cards'));
                setCards(null);
            } else {
                setCards(parsed);
            }
        } catch (e) {
            if (e instanceof UnsupportedFlashcardFileError && e.extension === 'xls') {
                setError(t('flashcards.import_xls_unsupported'));
            } else {
                setError(t('flashcards.import_failed'));
            }
            setCards(null);
        } finally {
            setParsing(false);
        }
    }

    return (
        <Modal titleId="flashcard-import-title" onClose={onClose} maxWidth={560}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 id="flashcard-import-title" style={{ margin: 0 }}>
                    {t('flashcards.import_title')}
                </h3>
                <button className="btn btn-ghost btn-icon btn-sm" aria-label={t('common.close')} onClick={onClose}>
                    <X size={16} />
                </button>
            </div>
            <p className="text-muted text-sm" style={{ marginTop: 0 }}>
                {t('flashcards.import_instructions')}
            </p>
            <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.docx,.txt"
                style={{ display: 'none' }}
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = '';
                }}
            />
            <button className="btn btn-secondary" disabled={parsing} onClick={() => fileInputRef.current?.click()}>
                <Upload size={15} /> {parsing ? t('flashcards.import_parsing') : t('flashcards.import_choose_file')}
            </button>
            {error && (
                <div className="text-sm" style={{ color: 'var(--red)', marginTop: 12 }}>
                    {error}
                </div>
            )}
            {cards && (
                <div style={{ marginTop: 16 }}>
                    <div className="text-sm" style={{ fontWeight: 600, marginBottom: 8 }}>
                        {t('flashcards.import_preview', { count: cards.length })}
                    </div>
                    <table className="data-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                        <thead>
                            <tr>
                                <th>{t('flashcards.card_front')}</th>
                                <th>{t('flashcards.card_back')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cards.slice(0, PREVIEW_LIMIT).map((c, i) => (
                                <tr key={i}>
                                    <td>{c.front}</td>
                                    <td>{c.back}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {cards.length > PREVIEW_LIMIT && (
                        <div className="text-muted text-xs" style={{ marginTop: 4 }}>
                            {t('flashcards.import_more_rows', { count: cards.length - PREVIEW_LIMIT })}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                        <button className="btn btn-secondary" onClick={onClose}>
                            {t('common.cancel')}
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                onImport(cards);
                                onClose();
                            }}
                        >
                            {t('flashcards.import_confirm', { count: cards.length })}
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
