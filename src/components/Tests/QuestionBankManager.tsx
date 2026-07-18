import React, { useState, useMemo } from 'react';
import { Search, Trash2, Tag, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../hooks/useToast';
import { CEFR_LEVELS } from '../../data/cefrDescriptors';
import type { QuestionBankItem, CefrLevel } from '../../types';
import QuestionBankImportModal from './QuestionBankImportModal';

interface QuestionBankManagerProps {
    /** When set, items render as pick targets (insert-from-bank) instead of a plain manager list. */
    onSelect?: (item: QuestionBankItem) => void;
}

export default function QuestionBankManager({ onSelect }: QuestionBankManagerProps) {
    const { t } = useTranslation();
    const { questionBank, addQuestionBankItems, updateQuestionBankItem, deleteQuestionBankItem } = useApp();
    const { showToast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTags, setEditTags] = useState('');
    const [editCefrLevel, setEditCefrLevel] = useState<CefrLevel | ''>('');
    const [showImportModal, setShowImportModal] = useState(false);

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        questionBank.forEach((item) => item.tags.forEach((tag) => tags.add(tag)));
        return Array.from(tags).sort();
    }, [questionBank]);

    function itemSearchText(item: QuestionBankItem): string {
        if (item.kind === 'section' && item.section) {
            return [item.section.title, ...item.section.questions.map((q) => q.prompt)].join(' ');
        }
        return item.question?.prompt ?? '';
    }

    const filteredItems = useMemo(() => {
        const q = searchTerm.toLowerCase();
        return questionBank
            .filter((item) => {
                const matchesSearch =
                    !q ||
                    itemSearchText(item).toLowerCase().includes(q) ||
                    item.tags.some((tag) => tag.toLowerCase().includes(q));
                const matchesTags = selectedTags.size === 0 || item.tags.some((tag) => selectedTags.has(tag));
                return matchesSearch && matchesTags;
            })
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }, [questionBank, searchTerm, selectedTags]);

    function toggleTagFilter(tag: string) {
        setSelectedTags((prev) => {
            const next = new Set(prev);
            if (next.has(tag)) next.delete(tag);
            else next.add(tag);
            return next;
        });
    }

    function startEditTags(item: QuestionBankItem) {
        setEditingId(item.id);
        setEditTags(item.tags.join(', '));
        setEditCefrLevel(item.cefrLevel ?? '');
    }

    function saveTags(item: QuestionBankItem) {
        const tags = editTags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);
        updateQuestionBankItem({ ...item, tags, cefrLevel: editCefrLevel || undefined });
        setEditingId(null);
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
                {!onSelect && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowImportModal(true)}>
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
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {filteredItems.length === 0 ? (
                    <div className="empty-state">{t('questionBank.empty_state')}</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {filteredItems.map((item) => (
                            <div
                                key={item.id}
                                className="card"
                                style={{ padding: 12, cursor: onSelect ? 'pointer' : 'default' }}
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
                                                ? t('questionBank.section_bundle_title', { title: item.section.title })
                                                : item.question?.prompt || t('questionBank.untitled_prompt')}
                                        </div>
                                    </div>
                                    {!onSelect && (
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-icon btn-xs"
                                            aria-label={t('common.delete')}
                                            style={{ color: 'var(--red)' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteQuestionBankItem(item.id);
                                            }}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>

                                {!onSelect && editingId === item.id ? (
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <Tag size={14} className="text-muted" />
                                        <input
                                            type="text"
                                            value={editTags}
                                            onChange={(e) => setEditTags(e.target.value)}
                                            placeholder={t('questionBank.tags_placeholder')}
                                            style={{ flex: 1 }}
                                            autoFocus
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <select
                                            aria-label={t('questionBank.cefr_level_label')}
                                            value={editCefrLevel}
                                            onChange={(e) => setEditCefrLevel(e.target.value as CefrLevel | '')}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <option value="">{t('tests.section_cefr_level_none')}</option>
                                            {CEFR_LEVELS.map((lvl) => (
                                                <option key={lvl} value={lvl}>
                                                    {lvl} – {t(`cefr.level_${lvl}`)}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingId(null);
                                            }}
                                        >
                                            {t('common.cancel')}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-primary btn-sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                saveTags(item);
                                            }}
                                        >
                                            {t('common.save')}
                                        </button>
                                    </div>
                                ) : (
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
                                        {!onSelect && (
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-xs"
                                                style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    startEditTags(item);
                                                }}
                                            >
                                                <Tag size={11} /> {t('questionBank.edit_tags')}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
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
        </>
    );
}
