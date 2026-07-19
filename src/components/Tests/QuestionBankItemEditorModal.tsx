import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import QuestionEditor from './QuestionEditor';
import QuestionBankSectionEditor from './QuestionBankSectionEditor';
import { CEFR_LEVELS } from '../../data/cefrDescriptors';
import type { QuestionBankItem, CefrLevel, TestQuestion } from '../../types';

interface Props {
    item: QuestionBankItem;
    onSave: (item: QuestionBankItem) => void;
    onClose: () => void;
}

export default function QuestionBankItemEditorModal({ item, onSave, onClose }: Props) {
    const { t } = useTranslation();
    const [local, setLocal] = useState<QuestionBankItem>(item);
    const [tagsInput, setTagsInput] = useState(item.tags.join(', '));

    const isSection = local.kind === 'section' && !!local.section;
    const titleKey = isSection ? 'questionBank.edit_section_title' : 'questionBank.edit_question_title';

    function handleSave() {
        const tags = tagsInput
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);
        onSave({ ...local, tags });
    }

    return (
        <Modal
            titleId="question-bank-edit-title"
            onClose={onClose}
            maxWidth={900}
            style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}
        >
            <div className="modal-header">
                <h3 id="question-bank-edit-title">{t(titleKey)}</h3>
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
                style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}
            >
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ marginBottom: 0, flex: '1 1 220px' }}>
                        <label htmlFor="bank-edit-tags">{t('questionBank.tags_placeholder')}</label>
                        <input
                            id="bank-edit-tags"
                            type="text"
                            value={tagsInput}
                            onChange={(e) => setTagsInput(e.target.value)}
                            placeholder={t('questionBank.tags_placeholder')}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, flex: '1 1 160px' }}>
                        <label htmlFor="bank-edit-cefr">{t('questionBank.cefr_level_label')}</label>
                        <select
                            id="bank-edit-cefr"
                            value={local.cefrLevel ?? ''}
                            onChange={(e) =>
                                setLocal({ ...local, cefrLevel: (e.target.value as CefrLevel) || undefined })
                            }
                        >
                            <option value="">{t('tests.section_cefr_level_none')}</option>
                            {CEFR_LEVELS.map((lvl) => (
                                <option key={lvl} value={lvl}>
                                    {lvl} – {t(`cefr.level_${lvl}`)}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {isSection && local.section ? (
                    <QuestionBankSectionEditor
                        section={local.section}
                        onChange={(section) => setLocal({ ...local, section })}
                    />
                ) : (
                    local.question && (
                        <QuestionEditor
                            question={local.question as TestQuestion}
                            index={0}
                            total={1}
                            sections={[]}
                            showRemove={false}
                            showSaveToBank={false}
                            onChange={(question) => setLocal({ ...local, question })}
                            onRemove={() => {}}
                        />
                    )
                )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                    {t('common.cancel')}
                </button>
                <button type="button" className="btn btn-primary" onClick={handleSave}>
                    {t('common.save')}
                </button>
            </div>
        </Modal>
    );
}
