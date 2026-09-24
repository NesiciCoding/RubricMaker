import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    Trash2,
    Plus,
    X,
    Check,
    BookOpen,
    GraduationCap,
    AlertCircle,
    GripVertical,
    Image,
    Music,
    Paperclip,
    Lightbulb,
    MessageCircle,
    ChevronUp,
    ChevronDown,
    Settings2,
    BookmarkPlus,
    Gauge,
    Sparkles,
} from 'lucide-react';
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { useAuthoring, useSettings } from '../../context/AppContext';
import { useToast } from '../../hooks/useToast';
import { nanoid } from '../../utils/nanoid';
import EssayEditor from '../Editor/EssayEditor';
import ClozeGapEditor from './ClozeGapEditor';
import HotTextEditor from './HotTextEditor';
import StandardsPickerModal from '../Standards/StandardsPickerModal';
import CefrPickerModal from '../CEFR/CefrPickerModal';
import HelpPopover from './HelpPopover';
import AudioUrlStatus from './AudioUrlStatus';
import { parseClozeGaps, plainQuestionPromptText, renderClozeSegments } from '../../utils/clozeParse';
import { generateCloze, type ClozeStrategy } from '../../utils/clozeGenerators';
import { CEFR_LEVELS } from '../../data/cefrDescriptors';
import { cefrEloRange, LEVEL_TO_ELO } from '../../utils/placementStaircase';
import { grammarItemToFrameworkDescriptor } from '../../data/grammarStandards';
import type {
    TestQuestion,
    TestQuestionType,
    TestOption,
    MatchingPair,
    OrderItem,
    TestCategory,
    CategorizeItem,
    TestSection,
    LinkedStandard,
    LinkedCefrDescriptor,
    LinkedFrameworkDescriptor,
    CefrLevel,
} from '../../types';

interface Props {
    question: TestQuestion;
    index: number;
    total: number;
    sections: TestSection[];
    dragHandleProps?: DraggableProvidedDragHandleProps | null;
    onChange: (question: TestQuestion) => void;
    onRemove: () => void;
    /** Hide the remove/trash button — set false when the question IS the item being edited (e.g. a Question Bank item), where "remove" is meaningless. Defaults to true. */
    showRemove?: boolean;
    /** Hide the "save to bank" button — set false when already editing a bank item, where saving-to-bank is confusing. Defaults to true. */
    showSaveToBank?: boolean;
}

export const QUESTION_TYPES: TestQuestionType[] = [
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
    'numeric',
    'audio-response',
];

const DEFAULT_MAX_RECORDING_SECONDS = 60;

export default function QuestionEditor({
    question,
    index,
    total,
    sections,
    dragHandleProps,
    onChange,
    onRemove,
    showRemove = true,
    showSaveToBank = true,
}: Props) {
    const { t, i18n } = useTranslation();
    const { addQuestionBankItem } = useAuthoring();
    const { settings } = useSettings();

    const { showToast } = useToast();
    const [pickingStandard, setPickingStandard] = React.useState(false);
    const [pickingCefr, setPickingCefr] = React.useState(false);
    const [expandedOptionImages, setExpandedOptionImages] = React.useState<Set<string>>(new Set());
    const [attachOpen, setAttachOpen] = React.useState(() => !!(question.imageUrl || question.audioUrl));
    const [advancedOpen, setAdvancedOpen] = React.useState(
        () => !!(question.hint || question.explanation || question.eloRating)
    );
    const [clozeStrategy, setClozeStrategy] = React.useState<ClozeStrategy>('fixedRatio');
    const [clozeEveryNth, setClozeEveryNth] = React.useState(7);
    const [clozeLevel, setClozeLevel] = React.useState<CefrLevel>('B2');

    function update(patch: Partial<TestQuestion>) {
        onChange({ ...question, ...patch });
    }

    function generateGaps() {
        const plainText = plainQuestionPromptText(question).trim();
        if (!plainText) {
            showToast(t('tests.cloze_generate_empty'), 'info');
            return;
        }
        const prompt = generateCloze(plainText, clozeStrategy, { everyNth: clozeEveryNth, cefrLevel: clozeLevel });
        if (renderClozeSegments(prompt).filter((s) => s.type === 'gap').length === 0) {
            showToast(t('tests.cloze_generate_none_found'), 'info');
            return;
        }
        update({ prompt });
    }

    // A question can only carry one grammar tag at a time (mastery/learning-path aggregation reads
    // this single field) — keep it derived from frameworkDescriptors so the "Link CEFR / Framework"
    // grammar tab stays the single place to set it (see addFrameworkDescriptor/removeFrameworkDescriptor).
    function deriveLinkedGrammarItemId(frameworkDescriptors: LinkedFrameworkDescriptor[]): string | undefined {
        return frameworkDescriptors.find((d) => d.framework === 'grammar')?.descriptorId;
    }

    // Migration for questions tagged via the old standalone grammar dropdown (removed in favor of
    // the "Link CEFR / Framework" grammar tab): surfaces the existing tag as a linked chip. This is
    // a pure derived value, not a persisting effect — writing it back on mere mount/view would flag
    // the test builder's unsaved-changes guard on a load that made no real edit. It gets persisted
    // the next time the user makes an actual change here (add/remove/type-switch), since those all
    // read from this value rather than the raw `question.frameworkDescriptors`.
    const effectiveFrameworkDescriptors = React.useMemo(() => {
        const frameworkDescriptors = question.frameworkDescriptors ?? [];
        if (!question.linkedGrammarItemId) return frameworkDescriptors;
        const alreadyLinked = frameworkDescriptors.some(
            (d) => d.framework === 'grammar' && d.descriptorId === question.linkedGrammarItemId
        );
        if (alreadyLinked) return frameworkDescriptors;
        const descriptor = grammarItemToFrameworkDescriptor(question.linkedGrammarItemId);
        return descriptor ? [...frameworkDescriptors, descriptor] : frameworkDescriptors;
    }, [question.frameworkDescriptors, question.linkedGrammarItemId]);

    function addFrameworkDescriptor(descriptor: LinkedFrameworkDescriptor) {
        // Only one grammar tag can be active at a time (see deriveLinkedGrammarItemId above) — drop
        // any existing grammar descriptor before adding a new one so it doesn't linger as an unused
        // second chip. IB/Bloom's descriptors have no such limit and simply accumulate.
        const kept =
            descriptor.framework === 'grammar'
                ? effectiveFrameworkDescriptors.filter((d) => d.framework !== 'grammar')
                : effectiveFrameworkDescriptors;
        const frameworkDescriptors = [...kept, descriptor];
        update({ frameworkDescriptors, linkedGrammarItemId: deriveLinkedGrammarItemId(frameworkDescriptors) });
    }

    function removeFrameworkDescriptor(descriptorId: string) {
        /* v8 ignore next -- remove buttons only render when effectiveFrameworkDescriptors is non-empty */
        const frameworkDescriptors = effectiveFrameworkDescriptors.filter((d) => d.descriptorId !== descriptorId);
        update({ frameworkDescriptors, linkedGrammarItemId: deriveLinkedGrammarItemId(frameworkDescriptors) });
    }

    function changeType(type: TestQuestionType) {
        // Clear a stale grammar link (both the derived id and its frameworkDescriptors entry) when
        // switching to a type the grammar tag doesn't apply to, since getGrammarRecommendations()-style
        // matching has no type check of its own.
        const keepsGrammarLink = (['cloze', 'cloze-dropdown', 'hot-text', 'matching'] as TestQuestionType[]).includes(
            type
        );
        const linkedGrammarItemId = keepsGrammarLink ? question.linkedGrammarItemId : undefined;
        const frameworkDescriptors = keepsGrammarLink
            ? effectiveFrameworkDescriptors
            : effectiveFrameworkDescriptors.filter((d) => d.framework !== 'grammar');

        if (type === 'multiple-choice' || type === 'multiple-response') {
            update({
                type,
                linkedGrammarItemId,
                frameworkDescriptors,
                options: question.options && question.options.length > 0 ? question.options : defaultOptions(),
            });
        } else if (type === 'true-false') {
            update({
                type,
                correctBoolean: question.correctBoolean ?? true,
                linkedGrammarItemId,
                frameworkDescriptors,
            });
        } else if (type === 'matching') {
            update({
                type,
                linkedGrammarItemId,
                frameworkDescriptors,
                matchingPairs:
                    question.matchingPairs && question.matchingPairs.length > 0
                        ? question.matchingPairs
                        : defaultMatchingPairs(),
            });
        } else if (type === 'ordering') {
            update({
                type,
                linkedGrammarItemId,
                frameworkDescriptors,
                orderItems:
                    question.orderItems && question.orderItems.length > 0 ? question.orderItems : defaultOrderItems(),
            });
        } else if (type === 'categorize') {
            const categories =
                question.categories && question.categories.length > 0 ? question.categories : defaultCategories();
            update({
                type,
                linkedGrammarItemId,
                frameworkDescriptors,
                categories,
                categorizeItems:
                    question.categorizeItems && question.categorizeItems.length > 0
                        ? question.categorizeItems
                        : defaultCategorizeItems(categories),
            });
        } else if (type === 'hot-text') {
            update({
                type,
                linkedGrammarItemId,
                frameworkDescriptors,
                hotTextPassage: question.hotTextPassage ?? '',
                hotTextCorrectIndices: question.hotTextCorrectIndices ?? [],
            });
        } else if (type === 'audio-response') {
            update({
                type,
                linkedGrammarItemId,
                frameworkDescriptors,
                maxRecordingSeconds: question.maxRecordingSeconds ?? DEFAULT_MAX_RECORDING_SECONDS,
            });
        } else {
            update({ type, linkedGrammarItemId, frameworkDescriptors });
        }
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
            /* v8 ignore next -- defaultCategories always yields at least one category */
            { id: nanoid(), text: '', categoryId: categories[0]?.id ?? '' },
            /* v8 ignore next -- defaultCategories always yields at least one category */
            { id: nanoid(), text: '', categoryId: categories[0]?.id ?? '' },
        ];
    }

    function addOption() {
        update({ options: [...(question.options ?? []), { id: nanoid(), text: '', isCorrect: false }] });
    }

    function removeOption(optionId: string) {
        /* v8 ignore next -- the remove button is disabled when options is empty */
        const removed = (question.options ?? []).find((o) => o.id === optionId);
        /* v8 ignore next -- the remove button is disabled when options is empty */
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
            /* v8 ignore next 2 -- option inputs only render when options is non-empty */
            options: (question.options ?? []).map((o) => (o.id === optionId ? { ...o, ...patch } : o)),
        });
    }

    function setCorrectOption(optionId: string) {
        update({
            /* v8 ignore next -- option inputs only render when options is non-empty */
            options: (question.options ?? []).map((o) => ({ ...o, isCorrect: o.id === optionId })),
        });
    }

    function toggleOptionCorrect(optionId: string) {
        update({
            /* v8 ignore next -- option inputs only render when options is non-empty */
            options: (question.options ?? []).map((o) => (o.id === optionId ? { ...o, isCorrect: !o.isCorrect } : o)),
        });
    }

    function addMatchingPair() {
        update({ matchingPairs: [...(question.matchingPairs ?? []), { id: nanoid(), left: '', right: '' }] });
    }

    function removeMatchingPair(pairId: string) {
        /* v8 ignore next -- the remove button is disabled when matchingPairs is empty */
        update({ matchingPairs: (question.matchingPairs ?? []).filter((p) => p.id !== pairId) });
    }

    function updateMatchingPair(pairId: string, patch: Partial<MatchingPair>) {
        update({
            /* v8 ignore next 2 -- pair inputs only render when matchingPairs is non-empty */
            matchingPairs: (question.matchingPairs ?? []).map((p) => (p.id === pairId ? { ...p, ...patch } : p)),
        });
    }

    function addOrderItem() {
        update({ orderItems: [...(question.orderItems ?? []), { id: nanoid(), text: '' }] });
    }

    function removeOrderItem(itemId: string) {
        /* v8 ignore next -- the remove button is disabled when orderItems is empty */
        update({ orderItems: (question.orderItems ?? []).filter((i) => i.id !== itemId) });
    }

    function updateOrderItem(itemId: string, text: string) {
        update({
            /* v8 ignore next 2 -- item inputs only render when orderItems is non-empty */
            orderItems: (question.orderItems ?? []).map((i) => (i.id === itemId ? { ...i, text } : i)),
        });
    }

    function moveOrderItem(from: number, to: number) {
        /* v8 ignore next -- move buttons only render when orderItems is non-empty */
        const items = [...(question.orderItems ?? [])];
        /* v8 ignore next -- move buttons are disabled at the list boundaries */
        if (to < 0 || to >= items.length) return;
        const [moved] = items.splice(from, 1);
        items.splice(to, 0, moved);
        update({ orderItems: items });
    }

    function addCategory() {
        update({ categories: [...(question.categories ?? []), { id: nanoid(), label: '' }] });
    }

    function removeCategory(categoryId: string) {
        /* v8 ignore next -- the remove button is disabled when categories is empty */
        const remaining = (question.categories ?? []).filter((c) => c.id !== categoryId);
        update({
            categories: remaining,
            /* v8 ignore next 3 -- the remove button is disabled when categories is empty, so a fallback category always exists */
            categorizeItems: (question.categorizeItems ?? []).map((item) =>
                item.categoryId === categoryId ? { ...item, categoryId: remaining[0]?.id ?? '' } : item
            ),
        });
    }

    function updateCategory(categoryId: string, label: string) {
        update({
            /* v8 ignore next 2 -- category inputs only render when categories is non-empty */
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
        /* v8 ignore next -- the remove button only renders when categorizeItems is non-empty */
        update({ categorizeItems: (question.categorizeItems ?? []).filter((i) => i.id !== itemId) });
    }

    function updateCategorizeItem(itemId: string, patch: Partial<CategorizeItem>) {
        update({
            /* v8 ignore next 2 -- item inputs only render when categorizeItems is non-empty */
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
        /* v8 ignore next -- unlink buttons only render when linkedStandards is non-empty */
        const next = [...(question.linkedStandards ?? [])];
        next.splice(idx, 1);
        update({ linkedStandards: next });
    }

    function saveToBank() {
        const { sectionId: _sectionId, ...forBank } = question;
        addQuestionBankItem(forBank, []);
        showToast(t('questionBank.saved_toast'), 'success');
    }

    function addCefrDescriptor(descriptor: LinkedCefrDescriptor) {
        update({ linkedCefrDescriptors: [...(question.linkedCefrDescriptors ?? []), descriptor] });
    }

    function removeCefrDescriptor(descriptorId: string) {
        update({
            /* v8 ignore next 3 -- descriptor remove buttons only render when linkedCefrDescriptors is non-empty */
            linkedCefrDescriptors: (question.linkedCefrDescriptors ?? []).filter(
                (d) => d.descriptorId !== descriptorId
            ),
        });
    }

    // Elo rating for staircase placement self-calibration (roadmap Phase 25.5) — only meaningful
    // once the question's section has a CEFR level, since resolveNextStaircaseQuestion only ever
    // compares an item's rating against its own level's Elo anchor.
    const sectionLevel = sections.find((s) => s.id === question.sectionId)?.cefrLevel;
    const eloRange = sectionLevel ? cefrEloRange(sectionLevel) : null;

    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Drag handle */}
                    <div
                        {...(dragHandleProps ?? {})}
                        style={{
                            cursor: 'grab',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '2px 0',
                        }}
                        aria-label={t('tests.drag_question')}
                    >
                        <GripVertical size={16} />
                    </div>
                    <span className="badge badge-blue">{t('tests.question_number', { number: index + 1 })}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    {showSaveToBank && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm"
                            aria-label={t('questionBank.save_to_bank')}
                            title={t('questionBank.save_to_bank')}
                            onClick={saveToBank}
                        >
                            <BookmarkPlus size={14} />
                        </button>
                    )}
                    {showRemove && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm"
                            aria-label={t('tests.remove_question')}
                            style={{ color: 'var(--red)' }}
                            onClick={onRemove}
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>
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
                                {t(`tests.question_type_${type.replace(/-/g, '_')}`)}
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
                {sections.length > 0 && (
                    <div className="form-group" style={{ marginBottom: 0, flex: '1 1 180px' }}>
                        <label htmlFor={`question-section-${question.id}`}>{t('tests.question_section_label')}</label>
                        <select
                            id={`question-section-${question.id}`}
                            value={question.sectionId ?? ''}
                            onChange={(e) => update({ sectionId: e.target.value || undefined })}
                        >
                            <option value="">{t('tests.no_section')}</option>
                            {sections.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.title}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor={`question-prompt-${question.id}`}>{t('tests.question_prompt_label')}</label>
                {question.type === 'cloze' || question.type === 'cloze-dropdown' ? (
                    <>
                        <div
                            style={{
                                display: 'flex',
                                gap: 6,
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                marginBottom: 8,
                            }}
                        >
                            <select
                                aria-label={t('tests.cloze_generate_strategy_label')}
                                value={clozeStrategy}
                                onChange={(e) => setClozeStrategy(e.target.value as ClozeStrategy)}
                                style={{ width: 'auto' }}
                            >
                                <option value="fixedRatio">{t('tests.cloze_generate_fixed_ratio')}</option>
                                <option value="cTest">{t('tests.cloze_generate_c_test')}</option>
                                <option value="preposition">{t('tests.cloze_generate_preposition')}</option>
                                <option value="article">{t('tests.cloze_generate_article')}</option>
                                <option value="modal">{t('tests.cloze_generate_modal')}</option>
                                <option value="pastTense">{t('tests.cloze_generate_past_tense')}</option>
                                <option value="aboveLevel">{t('tests.cloze_generate_above_level')}</option>
                                <option value="academic">{t('tests.cloze_generate_academic')}</option>
                            </select>
                            {clozeStrategy === 'fixedRatio' && (
                                <input
                                    type="number"
                                    min={2}
                                    max={20}
                                    value={clozeEveryNth}
                                    onChange={(e) => setClozeEveryNth(Number(e.target.value) || 7)}
                                    aria-label={t('tests.cloze_generate_every_nth_label')}
                                    style={{ width: 60 }}
                                />
                            )}
                            {clozeStrategy === 'aboveLevel' && (
                                <select
                                    aria-label={t('tests.cloze_generate_level_label')}
                                    value={clozeLevel}
                                    onChange={(e) => setClozeLevel(e.target.value as CefrLevel)}
                                    style={{ width: 'auto' }}
                                >
                                    {CEFR_LEVELS.map((level) => (
                                        <option key={level} value={level}>
                                            {level}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={generateGaps}
                                title={t('tests.cloze_generate_hint')}
                            >
                                <Sparkles size={14} /> {t('tests.cloze_generate_button')}
                            </button>
                        </div>
                        {/* Cloze/cloze-dropdown gaps are authored as {{gap|alt}} syntax directly in the
                            prompt string (see clozeParse.ts) — ClozeGapEditor edits that string via
                            clickable pills instead of hand-typed syntax, but the stored format and the
                            parse/scoring layer are unchanged. */}
                        <ClozeGapEditor
                            value={question.prompt}
                            onChange={(prompt) => update({ prompt })}
                            allowDropdown={question.type === 'cloze-dropdown'}
                            insertGapLabel={t('tests.cloze_insert_gap')}
                            insertDropdownGapLabel={t('tests.cloze_insert_dropdown_gap')}
                        />
                    </>
                ) : (
                    <EssayEditor
                        content={question.prompt}
                        onChange={(html) => update({ prompt: html })}
                        minHeight={80}
                        allowPageMode={false}
                        allowImageEmbedding
                    />
                )}
            </div>

            {(question.type === 'multiple-choice' || question.type === 'multiple-response') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label>
                        {t('tests.options_label')}{' '}
                        <HelpPopover title={t(`tests.help.${question.type.replace('-', '_')}_teacher_title`)}>
                            {t(`tests.help.${question.type.replace('-', '_')}_teacher_body`)}
                        </HelpPopover>
                    </label>
                    {(question.options ?? []).map((option) => {
                        const showImageField = expandedOptionImages.has(option.id) || !!option.imageUrl;
                        return (
                            <div key={option.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                                        aria-label={t('tests.option_image_label')}
                                        aria-pressed={showImageField}
                                        title={t('tests.option_image_label')}
                                        onClick={() =>
                                            setExpandedOptionImages((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(option.id)) next.delete(option.id);
                                                else next.add(option.id);
                                                return next;
                                            })
                                        }
                                        style={{
                                            color: option.imageUrl ? 'var(--accent)' : 'var(--text-muted)',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <Image size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-icon btn-sm"
                                        aria-label={t('tests.remove_option')}
                                        style={{ color: 'var(--red)' }}
                                        disabled={question.options!.length <= 1}
                                        onClick={() => removeOption(option.id)}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                                {showImageField && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 32 }}>
                                        <input
                                            type="url"
                                            value={option.imageUrl ?? ''}
                                            onChange={(e) =>
                                                updateOption(option.id, { imageUrl: e.target.value || undefined })
                                            }
                                            placeholder={t('tests.question_image_placeholder')}
                                            style={{ flex: 1 }}
                                            aria-label={t('tests.option_image_label')}
                                        />
                                        {option.imageUrl && (
                                            <img
                                                src={option.imageUrl}
                                                alt={t('tests.question_image_preview_alt')}
                                                style={{
                                                    maxWidth: 60,
                                                    maxHeight: 44,
                                                    borderRadius: 4,
                                                    objectFit: 'contain',
                                                    border: '1px solid var(--border)',
                                                    flexShrink: 0,
                                                }}
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                                onLoad={(e) => {
                                                    (e.target as HTMLImageElement).style.display = '';
                                                }}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
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
                                {gaps.map((gap) => gap.alternatives[0]).join(', ')}
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
                                disabled={question.matchingPairs!.length <= 1}
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
                                disabled={idx === question.orderItems!.length - 1}
                                onClick={() => moveOrderItem(idx, idx + 1)}
                            >
                                <ChevronDown size={14} />
                            </button>
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label={t('tests.remove_option')}
                                style={{ color: 'var(--red)' }}
                                disabled={question.orderItems!.length <= 1}
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
                                    disabled={question.categories!.length <= 1}
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
                                    disabled={question.categorizeItems!.length <= 1}
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
                    <label>
                        {t('tests.hot_text_passage_label')}{' '}
                        <HelpPopover title={t('tests.help.hot_text_teacher_title')}>
                            {t('tests.help.hot_text_teacher_body')}
                        </HelpPopover>
                    </label>
                    <HotTextEditor
                        passage={question.hotTextPassage ?? ''}
                        correctIndices={question.hotTextCorrectIndices ?? []}
                        onChange={(hotTextPassage, hotTextCorrectIndices) =>
                            update({ hotTextPassage, hotTextCorrectIndices })
                        }
                        insertFragmentLabel={t('tests.hot_text_insert_fragment')}
                    />
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
                        value={question.expectedAnswers?.join(' | ') ?? question.expectedAnswer ?? ''}
                        onChange={(e) => {
                            const answers = e.target.value
                                .split('|')
                                .map((a) => a.trim())
                                .filter(Boolean);
                            update({
                                expectedAnswers: answers.length ? answers : undefined,
                                expectedAnswer: undefined,
                            });
                        }}
                        placeholder={t('tests.expected_answer_placeholder')}
                    />
                    <p className="text-muted text-xs" style={{ marginTop: 4 }}>
                        {t('tests.expected_answer_help')}
                    </p>
                </div>
            )}

            {question.type === 'numeric' && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor={`question-numeric-value-${question.id}`}>
                            {t('tests.numeric_expected_value_label')}
                        </label>
                        <input
                            id={`question-numeric-value-${question.id}`}
                            type="number"
                            step="any"
                            value={question.expectedNumericValue ?? ''}
                            onChange={(e) =>
                                update({
                                    expectedNumericValue: e.target.value === '' ? undefined : Number(e.target.value),
                                })
                            }
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor={`question-numeric-tolerance-${question.id}`}>
                            {t('tests.numeric_tolerance_label')}{' '}
                            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                                ({t('essay_assignment.optional')})
                            </span>
                        </label>
                        <input
                            id={`question-numeric-tolerance-${question.id}`}
                            type="number"
                            step="any"
                            min={0}
                            value={question.numericTolerance ?? ''}
                            onChange={(e) =>
                                update({ numericTolerance: e.target.value === '' ? undefined : Number(e.target.value) })
                            }
                            placeholder="0"
                        />
                    </div>
                </div>
            )}

            {question.type === 'audio-response' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor={`question-max-recording-${question.id}`}>
                        {t('tests.max_recording_seconds_label')}
                    </label>
                    <input
                        id={`question-max-recording-${question.id}`}
                        type="number"
                        min={5}
                        value={question.maxRecordingSeconds ?? DEFAULT_MAX_RECORDING_SECONDS}
                        onChange={(e) => update({ maxRecordingSeconds: Math.max(5, Number(e.target.value) || 5) })}
                        style={{ width: 120 }}
                    />
                    <p className="text-muted text-xs" style={{ marginTop: 4 }}>
                        {t('tests.max_recording_seconds_help')}
                    </p>
                </div>
            )}

            <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        aria-expanded={attachOpen}
                        onClick={() => setAttachOpen((v) => !v)}
                    >
                        <Paperclip size={14} /> {t('tests.attach_media')}
                    </button>
                    {question.imageUrl && (
                        <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Image size={12} /> {t('tests.question_image_label')}
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label={t('tests.remove_attachment', { name: t('tests.question_image_label') })}
                                style={{ padding: 0, color: 'inherit' }}
                                onClick={() => update({ imageUrl: undefined })}
                            >
                                <X size={11} />
                            </button>
                        </span>
                    )}
                    {question.audioUrl && (
                        <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Music size={12} /> {t('tests.question_audio_label')}
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label={t('tests.remove_attachment', { name: t('tests.question_audio_label') })}
                                style={{ padding: 0, color: 'inherit' }}
                                onClick={() => update({ audioUrl: undefined })}
                            >
                                <X size={11} />
                            </button>
                        </span>
                    )}
                </div>
                {attachOpen && (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                            marginTop: 8,
                            padding: 10,
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                        }}
                    >
                        <div>
                            <label
                                htmlFor={`question-image-${question.id}`}
                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                <Image size={14} /> {t('tests.question_image_label')}
                            </label>
                            <input
                                id={`question-image-${question.id}`}
                                type="url"
                                value={question.imageUrl ?? ''}
                                onChange={(e) => update({ imageUrl: e.target.value || undefined })}
                                placeholder={t('tests.question_image_placeholder')}
                            />
                            {question.imageUrl && (
                                <img
                                    src={question.imageUrl}
                                    alt={t('tests.question_image_preview_alt')}
                                    style={{
                                        marginTop: 8,
                                        maxWidth: '100%',
                                        maxHeight: 200,
                                        borderRadius: 6,
                                        objectFit: 'contain',
                                        border: '1px solid var(--border)',
                                    }}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                    onLoad={(e) => {
                                        (e.target as HTMLImageElement).style.display = '';
                                    }}
                                />
                            )}
                        </div>
                        <div>
                            <label
                                htmlFor={`question-audio-${question.id}`}
                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                <Music size={14} /> {t('tests.question_audio_label')}
                            </label>
                            <input
                                id={`question-audio-${question.id}`}
                                type="url"
                                value={question.audioUrl ?? ''}
                                onChange={(e) => update({ audioUrl: e.target.value || undefined })}
                                placeholder={t('tests.question_audio_placeholder')}
                            />
                            <AudioUrlStatus url={question.audioUrl} />
                            {question.audioUrl && (
                                <audio
                                    controls
                                    src={question.audioUrl}
                                    aria-label={t('tests.question_audio_preview_alt')}
                                    style={{ marginTop: 8, width: '100%' }}
                                />
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Advanced/optional: hint, practice explanation, staircase Elo rating */}
            <div className="form-group" style={{ marginBottom: 0 }}>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    aria-expanded={advancedOpen}
                    onClick={() => setAdvancedOpen((v) => !v)}
                >
                    <Settings2 size={14} /> {t('tests.advanced_options')}
                </button>
                {advancedOpen && (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                            marginTop: 8,
                            padding: 10,
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                        }}
                    >
                        <div>
                            <label
                                htmlFor={`question-hint-${question.id}`}
                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                <Lightbulb size={14} /> {t('tests.question_hint_label')}
                            </label>
                            <input
                                id={`question-hint-${question.id}`}
                                type="text"
                                value={question.hint ?? ''}
                                onChange={(e) => update({ hint: e.target.value || undefined })}
                                placeholder={t('tests.question_hint_placeholder')}
                            />
                        </div>
                        <div>
                            <label
                                htmlFor={`question-explanation-${question.id}`}
                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                <MessageCircle size={14} /> {t('tests.question_explanation_label')}
                            </label>
                            <textarea
                                id={`question-explanation-${question.id}`}
                                value={question.explanation ?? ''}
                                onChange={(e) => update({ explanation: e.target.value || undefined })}
                                placeholder={t('tests.question_explanation_placeholder')}
                                rows={2}
                            />
                            <p className="text-muted text-xs" style={{ marginTop: 4 }}>
                                {t('tests.question_explanation_help')}
                            </p>
                        </div>
                        {sectionLevel && eloRange ? (
                            <div>
                                <label
                                    htmlFor={`question-elo-${question.id}`}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                                >
                                    <Gauge size={14} /> {t('tests.elo_rating_label')}{' '}
                                    <HelpPopover title={t('tests.elo_rating_label')}>
                                        {t('tests.elo_rating_help')}
                                    </HelpPopover>
                                </label>
                                <input
                                    id={`question-elo-${question.id}`}
                                    type="number"
                                    min={eloRange.min}
                                    max={eloRange.max}
                                    value={question.eloRating ?? ''}
                                    onChange={(e) =>
                                        update({
                                            eloRating: e.target.value === '' ? undefined : Number(e.target.value),
                                        })
                                    }
                                    placeholder={String(LEVEL_TO_ELO[sectionLevel])}
                                    style={{ width: 140 }}
                                />
                                <p className="text-muted text-xs" style={{ marginTop: 4 }}>
                                    {t('tests.elo_rating_range_hint', { min: eloRange.min, max: eloRange.max })}
                                </p>
                            </div>
                        ) : (
                            <p className="text-muted text-xs" style={{ margin: 0 }}>
                                {t('tests.elo_rating_no_level')}
                            </p>
                        )}
                    </div>
                )}
            </div>

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
                    {effectiveFrameworkDescriptors.map((descriptor) => (
                        <div
                            key={descriptor.descriptorId}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                background: `color-mix(in srgb, ${descriptor.categoryColor} 8%, transparent)`,
                                border: `1px solid color-mix(in srgb, ${descriptor.categoryColor} 25%, transparent)`,
                                borderRadius: 8,
                                padding: '6px 12px',
                                fontSize: '0.8rem',
                            }}
                        >
                            <span
                                style={{
                                    background: descriptor.categoryColor,
                                    color: '#fff',
                                    borderRadius: 4,
                                    padding: '1px 5px',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {i18n.language.startsWith('nl')
                                    ? descriptor.categoryLabelNl
                                    : descriptor.categoryLabelEn}
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
                                {i18n.language.startsWith('nl') ? descriptor.descriptionNl : descriptor.descriptionEn}
                            </span>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label={t('rubricBuilder.action_remove_descriptor')}
                                style={{ color: 'var(--text-muted)', padding: 2 }}
                                onClick={() => removeFrameworkDescriptor(descriptor.descriptorId)}
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
                    linkedFrameworkDescriptors={effectiveFrameworkDescriptors}
                    onAddFramework={addFrameworkDescriptor}
                    onRemoveFramework={removeFrameworkDescriptor}
                    onClose={() => setPickingCefr(false)}
                />
            )}
        </div>
    );
}
