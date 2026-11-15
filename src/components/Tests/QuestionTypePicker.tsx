import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, X } from 'lucide-react';
import Modal from '../ui/Modal';
import QuestionTypePreview from './QuestionTypePreview';
import { QUESTION_TYPE_GROUPS, groupForType, type QuestionTypeGroupId } from '../../data/questionTypes';
import { questionTypeDescKey, questionTypeHelpKey, questionTypeLabelKey } from '../../utils/questionTypeKey';
import type { TestQuestionType } from '../../types';

interface Props {
    /** The question's current type, marked in the grid. */
    selected: TestQuestionType;
    onSelect: (type: TestQuestionType) => void;
    onClose: () => void;
}

const groupLabelKey = (id: QuestionTypeGroupId) => `tests.type_picker_group_${id}`;

/**
 * Grid picker for the test builder. Types are grouped by what a student actually does and each
 * card previews the real answer control, because several names ("hot text", "grid", "key word
 * transformation") don't say what the student will see. The ? on a card opens the full guide.
 */
export default function QuestionTypePicker({ selected, onSelect, onClose }: Props) {
    const { t } = useTranslation();
    const [filter, setFilter] = useState<QuestionTypeGroupId | 'all'>('all');
    const [guideType, setGuideType] = useState<TestQuestionType | null>(null);

    const groups = filter === 'all' ? QUESTION_TYPE_GROUPS : QUESTION_TYPE_GROUPS.filter((g) => g.id === filter);
    const chips: { id: QuestionTypeGroupId | 'all'; label: string }[] = [
        { id: 'all', label: t('tests.type_picker_all') },
        ...QUESTION_TYPE_GROUPS.map((group) => ({ id: group.id, label: t(groupLabelKey(group.id)) })),
    ];

    const card = (type: TestQuestionType) => {
        const isSelected = type === selected;
        return (
            <div key={type} className={`qtype-card${isSelected ? ' is-selected' : ''}`}>
                <QuestionTypePreview type={type} />
                <div className="qtype-card-body">
                    <span className="qtype-card-name" id={`qtype-card-name-${type}`}>
                        {t(questionTypeLabelKey(type))}
                        {isSelected && <span className="qtype-card-badge">{t('tests.type_picker_current')}</span>}
                    </span>
                    <span className="qtype-card-desc" id={`qtype-card-desc-${type}`}>
                        {t(questionTypeDescKey(type))}
                    </span>
                </div>
                {/* A card cannot be one <button>: the answer controls in the preview are
                    interactive themselves, and buttons cannot nest. This layer sits over the
                    card, under the ? that opens the guide. */}
                <button
                    type="button"
                    className="qtype-card-hit"
                    data-question-type={type}
                    aria-labelledby={`qtype-card-name-${type}`}
                    aria-describedby={`qtype-card-desc-${type}`}
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => onSelect(type)}
                />
                <button
                    type="button"
                    className="qtype-card-help"
                    aria-label={t('tests.type_picker_help_aria', { type: t(questionTypeLabelKey(type)) })}
                    onClick={() => setGuideType(type)}
                >
                    ?
                </button>
            </div>
        );
    };

    const guide = guideType && (
        <div className="qtype-guide">
            <div className="qtype-guide-main">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGuideType(null)}>
                    <ArrowLeft size={14} /> {t('tests.type_picker_back')}
                </button>
                <p className="qtype-eyebrow">{t(groupLabelKey(groupForType(guideType)))}</p>
                <h4 className="qtype-guide-title">{t(questionTypeLabelKey(guideType))}</h4>
                <p className="qtype-guide-desc">{t(questionTypeDescKey(guideType))}</p>
                <QuestionTypePreview type={guideType} variant="full" />
                <p className="qtype-note">{t('tests.type_picker_preview_note')}</p>
                <div className="qtype-actions">
                    <button type="button" className="btn btn-primary" onClick={() => onSelect(guideType)}>
                        {t('tests.type_picker_use')}
                    </button>
                </div>
            </div>
            <div className="qtype-guide-copy">
                <p>{t(questionTypeHelpKey(guideType, 'teacher', 'body'))}</p>
            </div>
        </div>
    );

    return (
        <Modal
            titleId="question-type-picker-title"
            onClose={onClose}
            maxWidth={1060}
            style={{ display: 'flex', flexDirection: 'column', maxHeight: '88vh' }}
        >
            <div className="modal-header qtype-header">
                <div>
                    <h3 id="question-type-picker-title">{t('tests.type_picker_title')}</h3>
                    <p className="qtype-intro">{t('tests.type_picker_intro')}</p>
                </div>
                <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    onClick={onClose}
                    aria-label={t('common.close')}
                >
                    <X size={18} />
                </button>
            </div>

            {!guideType && (
                <div className="qtype-toolbar" role="group" aria-label={t('tests.question_type_label')}>
                    {chips.map((chip) => (
                        <button
                            key={chip.id}
                            type="button"
                            className="qtype-chip"
                            aria-pressed={filter === chip.id}
                            onClick={() => setFilter(chip.id)}
                        >
                            {chip.label}
                        </button>
                    ))}
                </div>
            )}

            {guideType ? (
                guide
            ) : (
                <div className="qtype-scroll">
                    {groups.map((group) => (
                        <section key={group.id} className="qtype-group" aria-labelledby={`qtype-group-${group.id}`}>
                            <div className="qtype-group-head">
                                <h4 id={`qtype-group-${group.id}`} className="qtype-group-title">
                                    {t(groupLabelKey(group.id))}
                                </h4>
                                <span className="qtype-group-count">{group.types.length}</span>
                            </div>
                            <div className="qtype-grid">{group.types.map(card)}</div>
                        </section>
                    ))}
                </div>
            )}
        </Modal>
    );
}
