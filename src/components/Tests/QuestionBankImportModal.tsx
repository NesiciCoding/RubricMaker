import React, { useRef, useState } from 'react';
import { AlertTriangle, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import { parseQuestionBankFile, type ImportWarning, type ParsedQuestionBankItem } from '../../utils/questionBankImport';

interface Props {
    onImport: (items: ParsedQuestionBankItem[]) => void;
    onClose: () => void;
}

const PREVIEW_LIMIT = 8;

export default function QuestionBankImportModal({ onImport, onClose }: Props) {
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [items, setItems] = useState<ParsedQuestionBankItem[] | null>(null);
    const [warnings, setWarnings] = useState<ImportWarning[]>([]);
    const [parsing, setParsing] = useState(false);

    async function handleFile(file: File) {
        setParsing(true);
        setItems(null);
        setWarnings([]);
        const result = await parseQuestionBankFile(file);
        setWarnings(result.warnings);
        setItems(result.items.length > 0 ? result.items : null);
        setParsing(false);
    }

    return (
        <Modal titleId="question-bank-import-title" onClose={onClose} maxWidth={620}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 id="question-bank-import-title" style={{ margin: 0 }}>
                    {t('questionBank.import_title')}
                </h3>
                <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    aria-label={t('common.close')}
                    onClick={onClose}
                >
                    <X size={16} />
                </button>
            </div>
            <p className="text-muted text-sm" style={{ marginTop: 0 }}>
                {t('questionBank.import_instructions')}{' '}
                <a href="sample-question-bank.json" download="sample-question-bank.json">
                    {t('questionBank.import_download_sample')}
                </a>
            </p>
            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = '';
                }}
            />
            <button
                type="button"
                className="btn btn-secondary"
                disabled={parsing}
                onClick={() => fileInputRef.current?.click()}
            >
                <Upload size={15} /> {parsing ? t('questionBank.import_parsing') : t('questionBank.import_choose_file')}
            </button>

            {warnings.length > 0 && (
                <div
                    className="text-sm"
                    style={{
                        marginTop: 12,
                        padding: 10,
                        borderRadius: 6,
                        background: 'var(--yellow-subtle, rgba(234,179,8,0.1))',
                        border: '1px solid var(--yellow)',
                    }}
                >
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 600, marginBottom: 4 }}>
                        <AlertTriangle size={14} style={{ color: 'var(--yellow)' }} />
                        {t('questionBank.import_warnings_title')}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {warnings.map((w) => (
                            <li key={`${w.key}:${JSON.stringify(w.params ?? {})}`}>{t(w.key, w.params)}</li>
                        ))}
                    </ul>
                </div>
            )}

            {!parsing && items === null && warnings.length > 0 && (
                <div className="text-muted text-sm" style={{ marginTop: 8 }}>
                    {t('questionBank.import_no_items')}
                </div>
            )}

            {items && (
                <div style={{ marginTop: 16 }}>
                    <div className="text-sm" style={{ fontWeight: 600, marginBottom: 8 }}>
                        {t('questionBank.import_preview', { count: items.length })}
                    </div>
                    <div
                        style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}
                    >
                        {items.slice(0, PREVIEW_LIMIT).map((item, i) => (
                            <div
                                key={i}
                                className="card"
                                style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}
                            >
                                <div className="text-muted text-xs">
                                    {item.kind === 'section' && item.section
                                        ? t('questionBank.section_bundle_meta', {
                                              count: item.section.questions.length,
                                          })
                                        : `${t(`tests.question_type_${(item.question?.type ?? 'multiple-choice').replace(/-/g, '_')}`)} · ${t('tests.total_points', { points: item.question?.points ?? 0 })}`}
                                    {item.cefrLevel ? ` · ${item.cefrLevel}` : ''}
                                </div>
                                <div style={{ fontSize: '0.9rem' }}>
                                    {item.kind === 'section' && item.section
                                        ? t('questionBank.section_bundle_title', { title: item.section.title })
                                        : item.question?.prompt || t('questionBank.untitled_prompt')}
                                </div>
                                {item.tags.length > 0 && (
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {item.tags.map((tag) => (
                                            <span
                                                key={tag}
                                                style={{
                                                    fontSize: '0.7rem',
                                                    background: 'var(--bg-elevated)',
                                                    padding: '2px 6px',
                                                    borderRadius: 4,
                                                    color: 'var(--text-dim)',
                                                }}
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    {items.length > PREVIEW_LIMIT && (
                        <div className="text-muted text-xs" style={{ marginTop: 4 }}>
                            {t('questionBank.import_more_rows', { count: items.length - PREVIEW_LIMIT })}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => {
                                onImport(items);
                                onClose();
                            }}
                        >
                            {t('questionBank.import_confirm', { count: items.length })}
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
