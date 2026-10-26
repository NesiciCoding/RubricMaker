import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileText, LayoutTemplate, Upload, X } from 'lucide-react';
import Modal from '../ui/Modal';
import { QUICK_START_TEMPLATES } from '../../data/templates';
import type { Rubric, UserTemplate } from '../../types';

interface Props {
    userTemplates: UserTemplate[];
    onClose: () => void;
    onBlank: () => void;
    onImport: () => void;
    onPickTemplate: (template: Partial<Rubric>) => void;
}

function ChoiceButton({
    icon: Icon,
    title,
    description,
    onClick,
}: {
    icon: React.ComponentType<{ size?: number }>;
    title: string;
    description: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className="btn btn-secondary"
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                textAlign: 'left',
                padding: '14px 16px',
                width: '100%',
                justifyContent: 'flex-start',
            }}
        >
            <Icon size={20} />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{title}</span>
                <span style={{ fontWeight: 400, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{description}</span>
            </span>
        </button>
    );
}

function TemplateRow({ name, subject, onClick }: { name: string; subject?: string; onClick: () => void }) {
    return (
        <button
            type="button"
            className="btn btn-secondary"
            onClick={onClick}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 2,
                padding: '10px 12px',
                width: '100%',
            }}
        >
            <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{name}</span>
            {subject && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{subject}</span>}
        </button>
    );
}

/** Entry point for "New Rubric": offers a blank rubric, a saved/built-in template, or
 *  importing from a file/share code, instead of always jumping straight to a blank form. */
export default function NewRubricChooserModal({ userTemplates, onClose, onBlank, onImport, onPickTemplate }: Props) {
    const { t } = useTranslation();
    const [showTemplates, setShowTemplates] = useState(false);

    if (showTemplates) {
        return (
            <Modal titleId="new-rubric-chooser-title" onClose={onClose} maxWidth={440}>
                <div className="modal-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => setShowTemplates(false)}
                        aria-label={t('common.back')}
                    >
                        <ArrowLeft size={16} />
                    </button>
                    <h3 id="new-rubric-chooser-title" style={{ flex: 1, margin: 0 }}>
                        {t('rubricList.chooser_template_title')}
                    </h3>
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
                    style={{
                        maxHeight: '60vh',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 16,
                    }}
                >
                    {userTemplates.length > 0 && (
                        <div>
                            <div
                                style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    color: 'var(--text-muted)',
                                    marginBottom: 8,
                                    letterSpacing: '0.04em',
                                }}
                            >
                                {t('dashboard.my_templates')}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {userTemplates.map((tpl) => (
                                    <TemplateRow
                                        key={tpl.id}
                                        name={tpl.name}
                                        subject={tpl.subject}
                                        onClick={() => onPickTemplate(tpl)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                    <div>
                        <div
                            style={{
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                color: 'var(--text-muted)',
                                marginBottom: 8,
                                letterSpacing: '0.04em',
                            }}
                        >
                            {t('dashboard.builtin_templates')}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {QUICK_START_TEMPLATES.map((tpl, i) => (
                                <TemplateRow
                                    key={i}
                                    name={tpl.name ?? ''}
                                    subject={tpl.subject}
                                    onClick={() =>
                                        onPickTemplate({
                                            ...tpl,
                                            id: undefined,
                                            createdAt: undefined,
                                            updatedAt: undefined,
                                        })
                                    }
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>
        );
    }

    return (
        <Modal titleId="new-rubric-chooser-title" onClose={onClose} maxWidth={420}>
            <div className="modal-header">
                <h3 id="new-rubric-chooser-title">{t('rubricList.chooser_title')}</h3>
                <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t('common.close')}>
                    <X size={18} />
                </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <ChoiceButton
                    icon={FileText}
                    title={t('rubricList.chooser_blank_title')}
                    description={t('rubricList.chooser_blank_desc')}
                    onClick={onBlank}
                />
                <ChoiceButton
                    icon={LayoutTemplate}
                    title={t('rubricList.chooser_template_title')}
                    description={t('rubricList.chooser_template_desc')}
                    onClick={() => setShowTemplates(true)}
                />
                <ChoiceButton
                    icon={Upload}
                    title={t('rubricList.chooser_import_title')}
                    description={t('rubricList.chooser_import_desc')}
                    onClick={onImport}
                />
            </div>
        </Modal>
    );
}
