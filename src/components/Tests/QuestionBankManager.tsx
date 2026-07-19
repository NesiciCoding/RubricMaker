import React, { useState, useMemo, useEffect } from 'react';
import { Search, Trash2, Tag, Upload, Pencil, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { CEFR_LEVELS } from '../../data/cefrDescriptors';
import { getGrammarItemById } from '../../data/grammarStandards';
import { stripHtmlTags } from '../../utils/docxExport';
import { QUESTION_TYPES } from './QuestionEditor';
import type { QuestionBankItem, CefrLevel, TestQuestion, TestQuestionType } from '../../types';
import QuestionBankImportModal from './QuestionBankImportModal';
import QuestionBankItemEditorModal from './QuestionBankItemEditorModal';

interface QuestionBankManagerProps {
    /** When set, items render as pick targets (insert-from-bank) instead of a plain manager list. */
    onSelect?: (item: QuestionBankItem) => void;
}

const PAGE_SIZE = 25;

function questionsOf(item: QuestionBankItem): Omit<TestQuestion, 'sectionId'>[] {
    if (item.kind === 'section' && item.section) return item.section.questions;
    return item.question ? [item.question] : [];
}

function questionSearchText(q: Omit<TestQuestion, 'sectionId'>): string {
    const parts: string[] = [
        q.prompt,
        q.expectedAnswer ?? '',
        (q.expectedAnswers ?? []).join(' '),
        q.hotTextPassage ?? '',
        q.hint ?? '',
        q.explanation ?? '',
        (q.options ?? []).map((o) => o.text).join(' '),
        (q.matchingPairs ?? []).flatMap((p) => [p.left, p.right]).join(' '),
        (q.orderItems ?? []).map((i) => i.text).join(' '),
        (q.categorizeItems ?? []).map((i) => i.text).join(' '),
        (q.categories ?? []).map((c) => c.label).join(' '),
        (q.linkedStandards ?? []).map((s) => `${s.statementNotation ?? ''} ${s.description}`).join(' '),
        (q.linkedCefrDescriptors ?? []).map((d) => `${d.descriptionEn} ${d.descriptionNl}`).join(' '),
    ];
    if (q.linkedGrammarItemId) {
        const grammarItem = getGrammarItemById(q.linkedGrammarItemId);
        if (grammarItem) parts.push(grammarItem.labelEn, grammarItem.labelNl);
    }
    return parts.join(' ');
}

function itemSearchText(item: QuestionBankItem): string {
    const parts: string[] = [item.tags.join(' ')];
    if (item.kind === 'section' && item.section) {
        parts.push(item.section.title, stripHtmlTags(item.section.content ?? ''));
    }
    parts.push(...questionsOf(item).map(questionSearchText));
    return parts.join(' ').toLowerCase();
}

export default function QuestionBankManager({ onSelect }: QuestionBankManagerProps) {
    const { t } = useTranslation();
    const {
        questionBank,
        addQuestionBankItems,
        updateQuestionBankItem,
        deleteQuestionBankItem,
        deleteQuestionBankItems,
        bulkUpdateQuestionBankItems,
    } = useApp();
    const { showToast } = useToast();
    const { confirm, dialogProps } = useConfirm();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    const [selectedCefr, setSelectedCefr] = useState<Set<string>>(new Set());
    const [kindFilter, setKindFilter] = useState<'all' | 'question' | 'section'>('all');
    const [typeFilter, setTypeFilter] = useState<TestQuestionType | ''>('');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [editingItem, setEditingItem] = useState<QuestionBankItem | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [bulkTagInput, setBulkTagInput] = useState('');
    const [bulkCefrValue, setBulkCefrValue] = useState<CefrLevel | ''>('');

    const manager = !onSelect;

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        questionBank.forEach((item) => item.tags.forEach((tag) => tags.add(tag)));
        return Array.from(tags).sort();
    }, [questionBank]);

    const searchIndex = useMemo(() => {
        const index = new Map<string, string>();
        questionBank.forEach((item) => index.set(item.id, itemSearchText(item)));
        return index;
    }, [questionBank]);

    function itemKind(item: QuestionBankItem): 'question' | 'section' {
        return item.kind === 'section' ? 'section' : 'question';
    }

    function itemMatchesType(item: QuestionBankItem, type: TestQuestionType): boolean {
        return questionsOf(item).some((q) => q.type === type);
    }

    const filteredItems = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return questionBank
            .filter((item) => {
                const matchesSearch = !q || (searchIndex.get(item.id) ?? '').includes(q);
                const matchesTags = selectedTags.size === 0 || item.tags.some((tag) => selectedTags.has(tag));
                const matchesCefr = selectedCefr.size === 0 || selectedCefr.has(item.cefrLevel ?? '');
                const matchesKind = kindFilter === 'all' || itemKind(item) === kindFilter;
                const matchesType = !typeFilter || itemMatchesType(item, typeFilter);
                return matchesSearch && matchesTags && matchesCefr && matchesKind && matchesType;
            })
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }, [questionBank, searchTerm, selectedTags, selectedCefr, kindFilter, typeFilter, searchIndex]);

    const filterSignature = [
        searchTerm,
        Array.from(selectedTags).sort().join(','),
        Array.from(selectedCefr).sort().join(','),
        kindFilter,
        typeFilter,
    ].join('|');

    useEffect(() => {
        setCurrentPage(1);
        setSelectedIds(new Set());
    }, [filterSignature]);

    const totalPages = manager ? Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE)) : 1;

    useEffect(() => {
        setCurrentPage((p) => Math.min(p, totalPages));
    }, [totalPages]);

    const pagedItems = manager
        ? filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
        : filteredItems;

    function toggleTagFilter(tag: string) {
        setSelectedTags((prev) => {
            const next = new Set(prev);
            if (next.has(tag)) next.delete(tag);
            else next.add(tag);
            return next;
        });
    }

    function toggleCefrFilter(level: string) {
        setSelectedCefr((prev) => {
            const next = new Set(prev);
            if (next.has(level)) next.delete(level);
            else next.add(level);
            return next;
        });
    }

    function toggleSelected(id: string) {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    const allFilteredSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedIds.has(item.id));
    const someFilteredSelected = filteredItems.some((item) => selectedIds.has(item.id));

    function toggleSelectAll() {
        if (allFilteredSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredItems.map((item) => item.id)));
        }
    }

    async function handleDelete(item: QuestionBankItem) {
        const ok = await confirm({
            title: t('questionBank.delete_confirm_title'),
            message: t('questionBank.delete_confirm_message'),
            confirmLabel: t('common.delete'),
        });
        if (!ok) return;
        deleteQuestionBankItem(item.id);
        showToast(t('questionBank.delete_success_toast'), 'success');
    }

    async function handleBulkDelete() {
        const ok = await confirm({
            title: t('questionBank.bulk_delete_confirm_title'),
            message: t('questionBank.bulk_delete_confirm_message', { count: selectedIds.size }),
            confirmLabel: t('common.delete'),
        });
        if (!ok) return;
        const ids = Array.from(selectedIds);
        deleteQuestionBankItems(ids);
        setSelectedIds(new Set());
        showToast(t('questionBank.bulk_delete_success_toast', { count: ids.length }), 'success');
    }

    function handleBulkAddTag() {
        const tag = bulkTagInput.trim();
        if (!tag) return;
        bulkUpdateQuestionBankItems(Array.from(selectedIds), { addTags: [tag] });
        setBulkTagInput('');
    }

    function handleBulkRemoveTag() {
        const tag = bulkTagInput.trim();
        if (!tag) return;
        bulkUpdateQuestionBankItems(Array.from(selectedIds), { removeTags: [tag] });
        setBulkTagInput('');
    }

    function handleBulkApplyCefr() {
        bulkUpdateQuestionBankItems(Array.from(selectedIds), { cefrLevel: bulkCefrValue || null });
    }

    return (
        <>
            <div
                style={{
                    padding: 16,
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    gap: 12,
                    flexDirection: 'column',
                }}
            >
                {manager && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setShowImportModal(true)}
                        >
                            <Upload size={14} /> {t('questionBank.import_button')}
                        </button>
                    </div>
                )}
                <div className="input-group">
                    <Search size={16} style={{ color: 'var(--text-dim)' }} />
                    <input
                        type="text"
                        placeholder={t('questionBank.search_placeholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ border: 'none', background: 'transparent', width: '100%' }}
                    />
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                        aria-label={t('questionBank.filter_kind_label')}
                        value={kindFilter}
                        onChange={(e) => setKindFilter(e.target.value as 'all' | 'question' | 'section')}
                        style={{ fontSize: '0.8rem' }}
                    >
                        <option value="all">{t('questionBank.filter_kind_all')}</option>
                        <option value="question">{t('questionBank.filter_kind_question')}</option>
                        <option value="section">{t('questionBank.filter_kind_section')}</option>
                    </select>
                    <select
                        aria-label={t('questionBank.filter_type_label')}
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value as TestQuestionType | '')}
                        style={{ fontSize: '0.8rem' }}
                    >
                        <option value="">{t('questionBank.filter_type_any')}</option>
                        {QUESTION_TYPES.map((type) => (
                            <option key={type} value={type}>
                                {t(`tests.question_type_${type.replace(/-/g, '_')}`)}
                            </option>
                        ))}
                    </select>
                </div>

                {allTags.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {allTags.map((tag) => (
                            <button
                                key={tag}
                                type="button"
                                className={`btn btn-xs ${selectedTags.has(tag) ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => toggleTagFilter(tag)}
                                aria-pressed={selectedTags.has(tag)}
                                style={{ borderRadius: 12, fontSize: '0.75rem', padding: '2px 8px' }}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {CEFR_LEVELS.map((lvl) => (
                        <button
                            key={lvl}
                            type="button"
                            className={`btn btn-xs ${selectedCefr.has(lvl) ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => toggleCefrFilter(lvl)}
                            aria-pressed={selectedCefr.has(lvl)}
                            style={{ borderRadius: 12, fontSize: '0.75rem', padding: '2px 8px' }}
                        >
                            {lvl}
                        </button>
                    ))}
                    <button
                        type="button"
                        className={`btn btn-xs ${selectedCefr.has('') ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => toggleCefrFilter('')}
                        aria-pressed={selectedCefr.has('')}
                        style={{ borderRadius: 12, fontSize: '0.75rem', padding: '2px 8px' }}
                    >
                        {t('tests.section_cefr_level_none')}
                    </button>
                </div>

                {manager && filteredItems.length > 0 && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
                        <input
                            type="checkbox"
                            checked={allFilteredSelected}
                            ref={(el) => {
                                if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
                            }}
                            onChange={toggleSelectAll}
                        />
                        {t('questionBank.select_all_hint', { count: filteredItems.length })}
                    </label>
                )}

                {manager && selectedIds.size > 0 && (
                    <div
                        className="card"
                        style={{
                            padding: 10,
                            display: 'flex',
                            gap: 8,
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            background: 'var(--bg-elevated)',
                        }}
                    >
                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {t('questionBank.bulk_bar_selected_count', { count: selectedIds.size })}
                        </span>
                        <button type="button" className="btn btn-danger btn-xs" onClick={handleBulkDelete}>
                            <Trash2 size={12} /> {t('questionBank.bulk_delete_button')}
                        </button>
                        <input
                            type="text"
                            value={bulkTagInput}
                            onChange={(e) => setBulkTagInput(e.target.value)}
                            placeholder={t('questionBank.bulk_tag_input_placeholder')}
                            style={{ width: 140, fontSize: '0.75rem' }}
                        />
                        <button type="button" className="btn btn-secondary btn-xs" onClick={handleBulkAddTag}>
                            {t('questionBank.bulk_add_tags_label')}
                        </button>
                        <button type="button" className="btn btn-secondary btn-xs" onClick={handleBulkRemoveTag}>
                            {t('questionBank.bulk_remove_tags_label')}
                        </button>
                        <select
                            aria-label={t('questionBank.bulk_set_cefr_label')}
                            value={bulkCefrValue}
                            onChange={(e) => setBulkCefrValue(e.target.value as CefrLevel | '')}
                            style={{ fontSize: '0.75rem' }}
                        >
                            <option value="">{t('tests.section_cefr_level_none')}</option>
                            {CEFR_LEVELS.map((lvl) => (
                                <option key={lvl} value={lvl}>
                                    {lvl}
                                </option>
                            ))}
                        </select>
                        <button type="button" className="btn btn-secondary btn-xs" onClick={handleBulkApplyCefr}>
                            {t('questionBank.bulk_cefr_apply_button')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-xs"
                            aria-label={t('common.cancel')}
                            onClick={() => setSelectedIds(new Set())}
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {filteredItems.length === 0 ? (
                    <div className="empty-state">{t('questionBank.empty_state')}</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {pagedItems.map((item) => (
                            <div
                                key={item.id}
                                className="card"
                                style={{
                                    padding: 12,
                                    display: 'flex',
                                    gap: 10,
                                    cursor: onSelect ? 'pointer' : 'default',
                                }}
                                role={onSelect ? 'button' : undefined}
                                tabIndex={onSelect ? 0 : undefined}
                                onClick={() => onSelect && onSelect(item)}
                                onKeyDown={(e) => {
                                    if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
                                        e.preventDefault();
                                        onSelect(item);
                                    }
                                }}
                            >
                                {manager && (
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(item.id)}
                                        onChange={() => toggleSelected(item.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        aria-label={t('questionBank.select_item_label')}
                                        style={{ marginTop: 4 }}
                                    />
                                )}
                                <div style={{ flex: 1 }}>
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            marginBottom: 6,
                                            gap: 8,
                                        }}
                                    >
                                        <div style={{ flex: 1 }}>
                                            <div className="text-muted text-xs">
                                                {item.kind === 'section' && item.section
                                                    ? t('questionBank.section_bundle_meta', {
                                                          count: item.section.questions.length,
                                                      })
                                                    : `${t(`tests.question_type_${(item.question?.type ?? 'multiple-choice').replace(/-/g, '_')}`)} · ${t('tests.total_points', { points: item.question?.points ?? 0 })}`}
                                                {item.cefrLevel ? ` · ${item.cefrLevel}` : ''}
                                            </div>
                                            <div style={{ fontSize: '0.95rem', marginTop: 4 }}>
                                                {item.kind === 'section' && item.section
                                                    ? t('questionBank.section_bundle_title', {
                                                          title: item.section.title,
                                                      })
                                                    : item.question?.prompt || t('questionBank.untitled_prompt')}
                                            </div>
                                        </div>
                                        {manager && (
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-icon btn-xs"
                                                    aria-label={t('questionBank.edit_button')}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingItem(item);
                                                    }}
                                                >
                                                    <Pencil size={12} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-icon btn-xs"
                                                    aria-label={t('common.delete')}
                                                    style={{ color: 'var(--red)' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDelete(item);
                                                    }}
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
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
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {manager && totalPages > 1 && (
                    <div
                        style={{
                            display: 'flex',
                            gap: 8,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: 16,
                        }}
                    >
                        <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm"
                            aria-label={t('questionBank.pagination_prev')}
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-muted text-sm">
                            {t('questionBank.pagination_page_label', { current: currentPage, total: totalPages })}
                        </span>
                        <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm"
                            aria-label={t('questionBank.pagination_next')}
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>
            {showImportModal && (
                <QuestionBankImportModal
                    onClose={() => setShowImportModal(false)}
                    onImport={(items) => {
                        addQuestionBankItems(items);
                        showToast(t('questionBank.import_success_toast', { count: items.length }), 'success');
                    }}
                />
            )}
            {editingItem && (
                <QuestionBankItemEditorModal
                    item={editingItem}
                    onClose={() => setEditingItem(null)}
                    onSave={(updated) => {
                        updateQuestionBankItem(updated);
                        setEditingItem(null);
                        showToast(t('questionBank.edit_success_toast'), 'success');
                    }}
                />
            )}
            <ConfirmDialog {...dialogProps} />
        </>
    );
}
