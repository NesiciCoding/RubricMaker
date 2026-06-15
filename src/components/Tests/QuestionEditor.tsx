import React from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, ChevronUp, ChevronDown, Plus, X, Check, BookOpen, GraduationCap, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { nanoid } from '../../utils/nanoid';
import StandardsPickerModal from '../Standards/StandardsPickerModal';
import CefrPickerModal from '../CEFR/CefrPickerModal';
import HelpPopover from './HelpPopover';
import { parseClozeGaps, parseHotTextFragments, type HotTextFragmentSegment } from '../../utils/clozeParse';
import type {
    TestQuestion,
    TestQuestionType,
    TestOption,
    MatchingPair,
    OrderItem,
    TestCategory,
    CategorizeItem,
    LinkedStandard,
    LinkedCefrDescriptor,
} from '../../types';

interface Props {
    question: TestQuestion;
    index: number;
    total: number;
    onChange: (question: TestQuestion) => void;
    onRemove: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
}

const QUESTION_TYPES: TestQuestionType[] = [
    'multiple-choice',
    'multiple-response',
    'true-false',
    'short-answer',
    'open',
    'cloze',
    'cloze-dropdown',
    'matching',
    'ordering',
    'categorize',
    'hot-text',
];

export default function QuestionEditor({ question, index, total, onChange, onRemove, onMoveUp, onMoveDown }: Props) {
    const { t } = useTranslation();
    const { settings } = useApp();
    const [pickingStandard, setPickingStandard] = React.useState(false);
    const [pickingCefr, setPickingCefr] = React.useState(false);
    const promptRef = React.useRef<HTMLTextAreaElement>(null);
    const hotTextPassageRef = React.useRef<HTMLTextAreaElement>(null);

    function update(patch: Partial<TestQuestion>) {
        onChange({ ...question, ...patch });
    }

    function insertIntoPrompt(snippet: string) {
        const el = promptRef.current;
        if (!el) {
            update({ prompt: question.prompt + snippet });
            return;
        }
        const start = el.selectionStart ?? question.prompt.length;
        const end = el.selectionEnd ?? question.prompt.length;
        const next = question.prompt.slice(0, start) + snippet + question.prompt.slice(end);
        update({ prompt: next });
        requestAnimationFrame(() => {
            el.focus();
            const cursor = start + snippet.length;
            el.setSelectionRange(cursor, cursor);
        });
    }

    function changeType(type: TestQuestionType) {
        if (type === 'multiple-choice' || type === 'multiple-response') {
            update({
                type,
                options: question.options && question.options.length > 0 ? question.options : defaultOptions(),
            });
        } else if (type === 'true-false') {
            update({ type, correctBoolean: question.correctBoolean ?? true });
        } else if (type === 'matching') {
            update({
                type,
                matchingPairs:
                    question.matchingPairs && question.matchingPairs.length > 0
                        ? question.matchingPairs
                        : defaultMatchingPairs(),
            });
        } else if (type === 'ordering') {
            update({
                type,
                orderItems:
                    question.orderItems && question.orderItems.length > 0
                        ? question.orderItems
                        : defaultOrderItems(),
            });
        } else if (type === 'categorize') {
            const categories =
                question.categories && question.categories.length > 0 ? question.categories : defaultCategories();
            update({
                type,
                categories,
                categorizeItems:
                    question.categorizeItems && question.categorizeItems.length > 0
                        ? question.categorizeItems
                        : defaultCategorizeItems(categories),
            });
        } else if (type === 'hot-text') {
            update({
                type,
                hotTextPassage: question.hotTextPassage ?? '',
                hotTextCorrectIndices: question.hotTextCorrectIndices ?? [],
            });
        } else {
            update({ type });
        }
    }

    function wrapSelectionInPassage() {
        const el = hotTextPassageRef.current;
        const passage = question.hotTextPassage ?? '';
        if (!el) {
            update({ hotTextPassage: `${passage}[[word]]` });
            return;
        }
        const start = el.selectionStart ?? passage.length;
        const end = el.selectionEnd ?? passage.length;
        const selected = passage.slice(start, end) || 'word';
        const next = passage.slice(0, start) + `[[${selected}]]` + passage.slice(end);
        update({ hotTextPassage: next });
        requestAnimationFrame(() => {
            el.focus();
            const cursor = start + selected.length + 4;
            el.setSelectionRange(cursor, cursor);
        });
    }

    function toggleHotTextCorrect(fragmentIndex: number) {
        const current = question.hotTextCorrectIndices ?? [];
        const next = current.includes(fragmentIndex)
            ? current.filter((i) => i !== fragmentIndex)
            : [...current, fragmentIndex];
        update({ hotTextCorrectIndices: next });
    }

    function defaultOptions(): TestOption[] {
        return [
            { id: nanoid(), text: '', isCorrect: true },
            { id: nanoid(), text: '', isCorrect: false },
        ];
    }

    function defaultMatchingPairs(): MatchingPair[] {
        return [
            { id: nanoid(), left: '', right: '' },
            { id: nanoid(), left: '', right: '' },
        ];
    }

    function defaultOrderItems(): OrderItem[] {
        return [
            { id: nanoid(), text: '' },
            { id: nanoid(), text: '' },
        ];
    }

    function defaultCategories(): TestCategory[] {
        return [
            { id: nanoid(), label: '' },
            { id: nanoid(), label: '' },
        ];
    }

    function defaultCategorizeItems(categories: TestCategory[]): CategorizeItem[] {
        return [
            { id: nanoid(), text: '', categoryId: categories[0]?.id ?? '' },
            { id: nanoid(), text: '', categoryId: categories[0]?.id ?? '' },
        ];
    }

    function addOption() {
        update({ options: [...(question.options ?? []), { id: nanoid(), text: '', isCorrect: false }] });
    }

    function removeOption(optionId: string) {
        const removed = (question.options ?? []).find((o) => o.id === optionId);
        const remaining = (question.options ?? []).filter((o) => o.id !== optionId);
        if (
            question.type === 'multiple-choice' &&
            removed?.isCorrect &&
            !remaining.some((o) => o.isCorrect) &&
            remaining.length > 0
        ) {
            remaining[0] = { ...remaining[0], isCorrect: true };
        }
        update({ options: remaining });
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

    function toggleOptionCorrect(optionId: string) {
        update({
            options: (question.options ?? []).map((o) =>
                o.id === optionId ? { ...o, isCorrect: !o.isCorrect } : o
            ),
        });
    }

    function addMatchingPair() {
        update({ matchingPairs: [...(question.matchingPairs ?? []), { id: nanoid(), left: '', right: '' }] });
    }

    function removeMatchingPair(pairId: string) {
        update({ matchingPairs: (question.matchingPairs ?? []).filter((p) => p.id !== pairId) });
    }

    function updateMatchingPair(pairId: string, patch: Partial<MatchingPair>) {
        update({
            matchingPairs: (question.matchingPairs ?? []).map((p) => (p.id === pairId ? { ...p, ...patch } : p)),
        });
    }

    function addOrderItem() {
        update({ orderItems: [...(question.orderItems ?? []), { id: nanoid(), text: '' }] });
    }

    function removeOrderItem(itemId: string) {
        update({ orderItems: (question.orderItems ?? []).filter((i) => i.id !== itemId) });
    }

    function updateOrderItem(itemId: string, text: string) {
        update({
            orderItems: (question.orderItems ?? []).map((i) => (i.id === itemId ? { ...i, text } : i)),
        });
    }

    function moveOrderItem(from: number, to: number) {
        const items = [...(question.orderItems ?? [])];
        if (to < 0 || to >= items.length) return;
        const [moved] = items.splice(from, 1);
        items.splice(to, 0, moved);
        update({ orderItems: items });
    }

    function addCategory() {
        update({ categories: [...(question.categories ?? []), { id: nanoid(), label: '' }] });
    }

    function removeCategory(categoryId: string) {
        const remaining = (question.categories ?? []).filter((c) => c.id !== categoryId);
        update({
            categories: remaining,
            categorizeItems: (question.categorizeItems ?? []).map((item) =>
                item.categoryId === categoryId ? { ...item, categoryId: remaining[0]?.id ?? '' } : item
            ),
        });
    }

    function updateCategory(categoryId: string, label: string) {
        update({
            categories: (question.categories ?? []).map((c) => (c.id === categoryId ? { ...c, label } : c)),
        });
    }

    function addCategorizeItem() {
        update({
            categorizeItems: [
                ...(question.categorizeItems ?? []),
                { id: nanoid(), text: '', categoryId: question.categories?.[0]?.id ?? '' },
            ],
        });
    }

    function removeCategorizeItem(itemId: string) {
        update({ categorizeItems: (question.categorizeItems ?? []).filter((i) => i.id !== itemId) });
    }

    function updateCategorizeItem(itemId: string, patch: Partial<CategorizeItem>) {
        update({
            categorizeItems: (question.categorizeItems ?? []).map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
        });
    }

    function renderPartialCreditToggle() {
        return (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', marginTop: 4 }}>
                <input
                    type="checkbox"
                    checked={question.partialCredit ?? true}
                    onChange={(e) => update({ partialCredit: e.target.checked })}
                />
                {t('tests.partial_credit_label')}
                <HelpPopover title={t('tests.partial_credit_label')}>{t('tests.partial_credit_help')}</HelpPopover>
            </label>
        );
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
                    ref={promptRef}
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

            {(question.type === 'multiple-choice' || question.type === 'multiple-response') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label>
                        {t('tests.options_label')}{' '}
                        <HelpPopover title={t(`tests.help.${question.type.replace('-', '_')}_teacher_title`)}>
                            {t(`tests.help.${question.type.replace('-', '_')}_teacher_body`)}
                        </HelpPopover>
                    </label>
                    {(question.options ?? []).map((option) => (
                        <div key={option.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label={t('tests.mark_correct_option')}
                                aria-pressed={option.isCorrect}
                                title={t('tests.mark_correct_option')}
                                onClick={() =>
                                    question.type === 'multiple-response'
                                        ? toggleOptionCorrect(option.id)
                                        : setCorrectOption(option.id)
                                }
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
                    {question.type === 'multiple-response' && (
                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: '0.85rem',
                                marginTop: 4,
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={question.partialCredit ?? true}
                                onChange={(e) => update({ partialCredit: e.target.checked })}
                            />
                            {t('tests.partial_credit_label')}
                            <HelpPopover title={t('tests.partial_credit_label')}>
                                {t('tests.partial_credit_help')}
                            </HelpPopover>
                        </label>
                    )}
                </div>
            )}

            {question.type === 'true-false' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label>
                        {t('tests.true_false_correct_label')}{' '}
                        <HelpPopover title={t('tests.help.true_false_teacher_title')}>
                            {t('tests.help.true_false_teacher_body')}
                        </HelpPopover>
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            type="button"
                            className="btn btn-sm"
                            aria-pressed={question.correctBoolean === true}
                            onClick={() => update({ correctBoolean: true })}
                            style={{
                                flex: 1,
                                background:
                                    question.correctBoolean === true
                                        ? 'color-mix(in srgb, var(--green) 18%, transparent)'
                                        : undefined,
                                border:
                                    question.correctBoolean === true
                                        ? '1px solid var(--green)'
                                        : '1px solid var(--border)',
                                color: question.correctBoolean === true ? 'var(--green)' : 'var(--text)',
                                fontWeight: question.correctBoolean === true ? 700 : 400,
                            }}
                        >
                            {t('tests.true_false_true')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-sm"
                            aria-pressed={question.correctBoolean === false}
                            onClick={() => update({ correctBoolean: false })}
                            style={{
                                flex: 1,
                                background:
                                    question.correctBoolean === false
                                        ? 'color-mix(in srgb, var(--green) 18%, transparent)'
                                        : undefined,
                                border:
                                    question.correctBoolean === false
                                        ? '1px solid var(--green)'
                                        : '1px solid var(--border)',
                                color: question.correctBoolean === false ? 'var(--green)' : 'var(--text)',
                                fontWeight: question.correctBoolean === false ? 700 : 400,
                            }}
                        >
                            {t('tests.true_false_false')}
                        </button>
                    </div>
                </div>
            )}

            {(question.type === 'cloze' || question.type === 'cloze-dropdown') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label>
                        {t('tests.cloze_syntax_label')}{' '}
                        <HelpPopover title={t(`tests.help.${question.type.replace('-', '_')}_teacher_title`)}>
                            {t(`tests.help.${question.type.replace('-', '_')}_teacher_body`)}
                        </HelpPopover>
                    </label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => insertIntoPrompt('{{answer}}')}
                        >
                            <Plus size={14} /> {t('tests.cloze_insert_gap')}
                        </button>
                        {question.type === 'cloze-dropdown' && (
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => insertIntoPrompt('{{correct|wrong1|wrong2}}')}
                            >
                                <Plus size={14} /> {t('tests.cloze_insert_dropdown_gap')}
                            </button>
                        )}
                    </div>
                    {(() => {
                        const gaps = parseClozeGaps(question.prompt);
                        if (gaps.length === 0) {
                            return (
                                <p className="text-muted text-xs" style={{ margin: 0 }}>
                                    {t('tests.cloze_no_gaps')}
                                </p>
                            );
                        }
                        return (
                            <p className="text-muted text-xs" style={{ margin: 0 }}>
                                {t('tests.cloze_gap_preview', { count: gaps.length })}{' '}
                                {gaps.map((gap) => gap.alternatives[0] || '—').join(', ')}
                            </p>
                        );
                    })()}
                    <label
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: '0.85rem',
                            marginTop: 4,
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={question.partialCredit ?? true}
                            onChange={(e) => update({ partialCredit: e.target.checked })}
                        />
                        {t('tests.partial_credit_label')}
                        <HelpPopover title={t('tests.partial_credit_label')}>
                            {t('tests.partial_credit_help')}
                        </HelpPopover>
                    </label>
                </div>
            )}

            {question.type === 'matching' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label>
                        {t('tests.matching_pairs_label')}{' '}
                        <HelpPopover title={t('tests.help.matching_teacher_title')}>
                            {t('tests.help.matching_teacher_body')}
                        </HelpPopover>
                    </label>
                    {(question.matchingPairs ?? []).map((pair) => (
                        <div key={pair.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                                type="text"
                                value={pair.left}
                                onChange={(e) => updateMatchingPair(pair.id, { left: e.target.value })}
                                placeholder={t('tests.matching_left_placeholder')}
                                style={{ flex: 1 }}
                                aria-label={t('tests.matching_left_placeholder')}
                            />
                            <span style={{ color: 'var(--text-muted)' }}>↔</span>
                            <input
                                type="text"
                                value={pair.right}
                                onChange={(e) => updateMatchingPair(pair.id, { right: e.target.value })}
                                placeholder={t('tests.matching_right_placeholder')}
                                style={{ flex: 1 }}
                                aria-label={t('tests.matching_right_placeholder')}
                            />
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label={t('tests.remove_option')}
                                style={{ color: 'var(--red)' }}
                                disabled={(question.matchingPairs ?? []).length <= 1}
                                onClick={() => removeMatchingPair(pair.id)}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addMatchingPair}>
                        <Plus size={14} /> {t('tests.add_matching_pair')}
                    </button>
                    {renderPartialCreditToggle()}
                </div>
            )}

            {question.type === 'ordering' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label>
                        {t('tests.ordering_items_label')}{' '}
                        <HelpPopover title={t('tests.help.ordering_teacher_title')}>
                            {t('tests.help.ordering_teacher_body')}
                        </HelpPopover>
                    </label>
                    {(question.orderItems ?? []).map((item, idx) => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="text-muted text-xs" style={{ width: 20, flexShrink: 0 }}>
                                {idx + 1}.
                            </span>
                            <input
                                type="text"
                                value={item.text}
                                onChange={(e) => updateOrderItem(item.id, e.target.value)}
                                placeholder={t('tests.ordering_item_placeholder')}
                                style={{ flex: 1 }}
                                aria-label={t('tests.ordering_item_placeholder')}
                            />
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label={t('tests.move_question_up')}
                                disabled={idx === 0}
                                onClick={() => moveOrderItem(idx, idx - 1)}
                            >
                                <ChevronUp size={14} />
                            </button>
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label={t('tests.move_question_down')}
                                disabled={idx === (question.orderItems ?? []).length - 1}
                                onClick={() => moveOrderItem(idx, idx + 1)}
                            >
                                <ChevronDown size={14} />
                            </button>
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label={t('tests.remove_option')}
                                style={{ color: 'var(--red)' }}
                                disabled={(question.orderItems ?? []).length <= 1}
                                onClick={() => removeOrderItem(item.id)}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addOrderItem}>
                        <Plus size={14} /> {t('tests.add_ordering_item')}
                    </button>
                    {renderPartialCreditToggle()}
                </div>
            )}

            {question.type === 'categorize' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label>
                            {t('tests.categorize_categories_label')}{' '}
                            <HelpPopover title={t('tests.help.categorize_teacher_title')}>
                                {t('tests.help.categorize_teacher_body')}
                            </HelpPopover>
                        </label>
                        {(question.categories ?? []).map((cat) => (
                            <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input
                                    type="text"
                                    value={cat.label}
                                    onChange={(e) => updateCategory(cat.id, e.target.value)}
                                    placeholder={t('tests.categorize_category_placeholder')}
                                    style={{ flex: 1 }}
                                    aria-label={t('tests.categorize_category_placeholder')}
                                />
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-icon btn-sm"
                                    aria-label={t('tests.remove_option')}
                                    style={{ color: 'var(--red)' }}
                                    disabled={(question.categories ?? []).length <= 1}
                                    onClick={() => removeCategory(cat.id)}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                        <button type="button" className="btn btn-secondary btn-sm" onClick={addCategory}>
                            <Plus size={14} /> {t('tests.add_category')}
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label>{t('tests.categorize_items_label')}</label>
                        {(question.categorizeItems ?? []).map((item) => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input
                                    type="text"
                                    value={item.text}
                                    onChange={(e) => updateCategorizeItem(item.id, { text: e.target.value })}
                                    placeholder={t('tests.categorize_item_placeholder')}
                                    style={{ flex: 1 }}
                                    aria-label={t('tests.categorize_item_placeholder')}
                                />
                                <select
                                    value={item.categoryId}
                                    onChange={(e) => updateCategorizeItem(item.id, { categoryId: e.target.value })}
                                    aria-label={t('tests.categorize_item_category_label')}
                                >
                                    {(question.categories ?? []).map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.label || '—'}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-icon btn-sm"
                                    aria-label={t('tests.remove_option')}
                                    style={{ color: 'var(--red)' }}
                                    disabled={(question.categorizeItems ?? []).length <= 1}
                                    onClick={() => removeCategorizeItem(item.id)}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                        <button type="button" className="btn btn-secondary btn-sm" onClick={addCategorizeItem}>
                            <Plus size={14} /> {t('tests.add_categorize_item')}
                        </button>
                    </div>
                    {renderPartialCreditToggle()}
                </div>
            )}

            {question.type === 'hot-text' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label htmlFor={`question-hottext-${question.id}`}>
                        {t('tests.hot_text_passage_label')}{' '}
                        <HelpPopover title={t('tests.help.hot_text_teacher_title')}>
                            {t('tests.help.hot_text_teacher_body')}
                        </HelpPopover>
                    </label>
                    <textarea
                        ref={hotTextPassageRef}
                        id={`question-hottext-${question.id}`}
                        value={question.hotTextPassage ?? ''}
                        onChange={(e) => update({ hotTextPassage: e.target.value })}
                        rows={3}
                        placeholder={t('tests.hot_text_passage_placeholder')}
                        style={{ resize: 'vertical' }}
                    />
                    <div>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={wrapSelectionInPassage}>
                            <Plus size={14} /> {t('tests.hot_text_insert_fragment')}
                        </button>
                    </div>
                    {(() => {
                        const fragments = parseHotTextFragments(question.hotTextPassage ?? '').filter(
                            (s): s is HotTextFragmentSegment => s.type === 'fragment'
                        );
                        if (fragments.length === 0) {
                            return (
                                <p className="text-muted text-xs" style={{ margin: 0 }}>
                                    {t('tests.hot_text_no_fragments')}
                                </p>
                            );
                        }
                        const correctIndices = question.hotTextCorrectIndices ?? [];
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <p className="text-muted text-xs" style={{ margin: 0 }}>
                                    {t('tests.hot_text_fragments_help')}
                                </p>
                                {fragments.map((fragment) => (
                                    <div key={fragment.index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-icon btn-sm"
                                            aria-label={t('tests.mark_correct_option')}
                                            aria-pressed={correctIndices.includes(fragment.index)}
                                            title={t('tests.mark_correct_option')}
                                            onClick={() => toggleHotTextCorrect(fragment.index)}
                                            style={{
                                                color: correctIndices.includes(fragment.index)
                                                    ? 'var(--green)'
                                                    : 'var(--text-muted)',
                                                flexShrink: 0,
                                            }}
                                        >
                                            <Check size={16} />
                                        </button>
                                        <span style={{ color: 'var(--text)' }}>{fragment.text || '—'}</span>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                    {renderPartialCreditToggle()}
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
