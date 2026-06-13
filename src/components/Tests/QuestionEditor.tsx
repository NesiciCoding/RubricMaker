import React from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, ChevronUp, ChevronDown, Plus, X, Check, BookOpen, GraduationCap, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { nanoid } from '../../utils/nanoid';
import StandardsPickerModal from '../Standards/StandardsPickerModal';
import CefrPickerModal from '../CEFR/CefrPickerModal';
import type { TestQuestion, TestQuestionType, TestOption, LinkedStandard, LinkedCefrDescriptor } from '../../types';

interface Props {
    question: TestQuestion;
    index: number;
    total: number;
    onChange: (question: TestQuestion) => void;
    onRemove: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
}

const QUESTION_TYPES: TestQuestionType[] = ['multiple-choice', 'short-answer', 'open'];

export default function QuestionEditor({ question, index, total, onChange, onRemove, onMoveUp, onMoveDown }: Props) {
    const { t } = useTranslation();
    const { settings } = useApp();
    const [pickingStandard, setPickingStandard] = React.useState(false);
    const [pickingCefr, setPickingCefr] = React.useState(false);

    function update(patch: Partial<TestQuestion>) {
        onChange({ ...question, ...patch });
    }

    function changeType(type: TestQuestionType) {
        if (type === 'multiple-choice') {
            update({
                type,
                options: question.options && question.options.length > 0 ? question.options : defaultOptions(),
            });
        } else {
            update({ type });
        }
    }

    function defaultOptions(): TestOption[] {
        return [
            { id: nanoid(), text: '', isCorrect: true },
            { id: nanoid(), text: '', isCorrect: false },
        ];
    }

    function addOption() {
        update({ options: [...(question.options ?? []), { id: nanoid(), text: '', isCorrect: false }] });
    }

    function removeOption(optionId: string) {
        update({ options: (question.options ?? []).filter((o) => o.id !== optionId) });
    }

    function updateOption(optionId: string, patch: Partial<TestOption>) {
        update({
            options: (question.options ?? []).map((o) => (o.id === optionId ? { ...o, ...patch } : o)),
        });
    }

    function setCorrectOption(optionId: string) {
        update({
            options: (question.options ?? []).map((o) => ({ ...o, isCorrect: o.id === optionId })),
        });
    }

    function linkStandard(std: LinkedStandard) {
        update({ linkedStandards: [...(question.linkedStandards ?? []), std] });
    }

    function unlinkStandard(idx: number) {
        const next = [...(question.linkedStandards ?? [])];
        next.splice(idx, 1);
        update({ linkedStandards: next });
    }

    function addCefrDescriptor(descriptor: LinkedCefrDescriptor) {
        update({ linkedCefrDescriptors: [...(question.linkedCefrDescriptors ?? []), descriptor] });
    }

    function removeCefrDescriptor(descriptorId: string) {
        update({
            linkedCefrDescriptors: (question.linkedCefrDescriptors ?? []).filter(
                (d) => d.descriptorId !== descriptorId
            ),
        });
    }

    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="badge badge-blue">{t('tests.question_number', { number: index + 1 })}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button
                        className="btn btn-ghost btn-icon btn-sm"
                        aria-label={t('tests.move_question_up')}
                        disabled={index === 0}
                        onClick={onMoveUp}
                    >
                        <ChevronUp size={14} />
                    </button>
                    <button
                        className="btn btn-ghost btn-icon btn-sm"
                        aria-label={t('tests.move_question_down')}
                        disabled={index === total - 1}
                        onClick={onMoveDown}
                    >
                        <ChevronDown size={14} />
                    </button>
                    <button
                        className="btn btn-ghost btn-icon btn-sm"
                        aria-label={t('tests.remove_question')}
                        style={{ color: 'var(--red)' }}
                        onClick={onRemove}
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor={`question-prompt-${question.id}`}>{t('tests.question_prompt_label')}</label>
                <textarea
                    id={`question-prompt-${question.id}`}
                    value={question.prompt}
                    onChange={(e) => update({ prompt: e.target.value })}
                    rows={2}
                    placeholder={t('tests.question_prompt_placeholder')}
                    style={{ resize: 'vertical' }}
                />
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ marginBottom: 0, flex: '1 1 200px' }}>
                    <label htmlFor={`question-type-${question.id}`}>{t('tests.question_type_label')}</label>
                    <select
                        id={`question-type-${question.id}`}
                        value={question.type}
                        onChange={(e) => changeType(e.target.value as TestQuestionType)}
                    >
                        {QUESTION_TYPES.map((type) => (
                            <option key={type} value={type}>
                                {t(`tests.question_type_${type.replace('-', '_')}`)}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0, flex: '0 0 120px' }}>
                    <label htmlFor={`question-points-${question.id}`}>{t('tests.question_points_label')}</label>
                    <input
                        id={`question-points-${question.id}`}
                        type="number"
                        min={0}
                        value={question.points}
                        onChange={(e) => update({ points: Number(e.target.value) || 0 })}
                    />
                </div>
            </div>

            {question.type === 'multiple-choice' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label>{t('tests.options_label')}</label>
                    {(question.options ?? []).map((option) => (
                        <div key={option.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label={t('tests.mark_correct_option')}
                                aria-pressed={option.isCorrect}
                                title={t('tests.mark_correct_option')}
                                onClick={() => setCorrectOption(option.id)}
                                style={{
                                    color: option.isCorrect ? 'var(--green)' : 'var(--text-muted)',
                                    flexShrink: 0,
                                }}
                            >
                                <Check size={16} />
                            </button>
                            <input
                                type="text"
                                value={option.text}
                                onChange={(e) => updateOption(option.id, { text: e.target.value })}
                                placeholder={t('tests.option_placeholder')}
                                style={{ flex: 1 }}
                                aria-label={t('tests.option_text_label')}
                            />
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label={t('tests.remove_option')}
                                style={{ color: 'var(--red)' }}
                                disabled={(question.options ?? []).length <= 1}
                                onClick={() => removeOption(option.id)}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addOption}>
                        <Plus size={14} /> {t('tests.add_option')}
                    </button>
                </div>
            )}

            {question.type === 'short-answer' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor={`question-expected-${question.id}`}>
                        {t('tests.expected_answer_label')}{' '}
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                            ({t('essay_assignment.optional')})
                        </span>
                    </label>
                    <input
                        id={`question-expected-${question.id}`}
                        type="text"
                        value={question.expectedAnswer ?? ''}
                        onChange={(e) => update({ expectedAnswer: e.target.value })}
                        placeholder={t('tests.expected_answer_placeholder')}
                    />
                    <p className="text-muted text-xs" style={{ marginTop: 4 }}>
                        {t('tests.expected_answer_help')}
                    </p>
                </div>
            )}

            {/* Standards + CEFR linking */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(question.linkedStandards ?? []).map((std, idx) => (
                        <div
                            key={std.guid + idx}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                background: 'var(--accent-soft)',
                                border: '1px solid var(--accent)',
                                borderRadius: 8,
                                padding: '6px 12px',
                                fontSize: '0.8rem',
                            }}
                        >
                            <BookOpen size={13} style={{ color: 'var(--accent)' }} />
                            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                                {std.statementNotation ?? std.guid}
                            </span>
                            <span
                                style={{
                                    color: 'var(--text)',
                                    maxWidth: 280,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {std.description}
                            </span>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label={t('rubricBuilder.action_unlink_standard')}
                                style={{ color: 'var(--text-muted)', padding: 2 }}
                                onClick={() => unlinkStandard(idx)}
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                    {(question.linkedCefrDescriptors ?? []).map((descriptor) => (
                        <div
                            key={descriptor.descriptorId}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                background: 'var(--accent-soft)',
                                border: '1px solid var(--accent)',
                                borderRadius: 8,
                                padding: '6px 12px',
                                fontSize: '0.8rem',
                            }}
                        >
                            <GraduationCap size={13} style={{ color: 'var(--accent)' }} />
                            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{descriptor.level}</span>
                            <span
                                style={{
                                    color: 'var(--text)',
                                    maxWidth: 280,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {descriptor.descriptionEn}
                            </span>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label={t('rubricBuilder.action_remove_descriptor')}
                                style={{ color: 'var(--text-muted)', padding: 2 }}
                                onClick={() => removeCefrDescriptor(descriptor.descriptorId)}
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setPickingStandard(true)}>
                        <BookOpen size={14} /> {t('tests.link_standard')}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setPickingCefr(true)}>
                        <GraduationCap size={14} /> {t('tests.link_cefr')}
                    </button>
                </div>
            </div>

            {pickingStandard && settings.standardsApiKey ? (
                <StandardsPickerModal
                    apiKey={settings.standardsApiKey}
                    onSelect={(std) => {
                        linkStandard(std);
                        setPickingStandard(false);
                    }}
                    onClose={() => setPickingStandard(false)}
                />
            ) : pickingStandard && !settings.standardsApiKey ? (
                <div className="modal-overlay" onClick={() => setPickingStandard(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
                        <div className="modal-header">
                            <h3>
                                <AlertCircle size={16} /> {t('rubricBuilder.standards_modal_title')}
                            </h3>
                            <button
                                className="btn btn-ghost btn-icon"
                                aria-label={t('common.close')}
                                onClick={() => setPickingStandard(false)}
                            >
                                ✕
                            </button>
                        </div>
                        <div className="modal-body">
                            <p>{t('tests.standards_api_key_required')}</p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setPickingStandard(false)}>
                                {t('rubricBuilder.action_close')}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {pickingCefr && (
                <CefrPickerModal
                    linkedDescriptors={question.linkedCefrDescriptors ?? []}
                    onAdd={addCefrDescriptor}
                    onRemove={removeCefrDescriptor}
                    linkedFrameworkDescriptors={[]}
                    onAddFramework={() => {}}
                    onRemoveFramework={() => {}}
                    onClose={() => setPickingCefr(false)}
                />
            )}
        </div>
    );
}
