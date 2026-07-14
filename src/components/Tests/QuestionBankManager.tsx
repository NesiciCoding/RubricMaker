import React, { useState, useMemo } from 'react';
import { Search, Trash2, Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import type { QuestionBankItem } from '../../types';

interface QuestionBankManagerProps {
    /** When set, items render as pick targets (insert-from-bank) instead of a plain manager list. */
    onSelect?: (item: QuestionBankItem) => void;
}

export default function QuestionBankManager({ onSelect }: QuestionBankManagerProps) {
    const { t } = useTranslation();
    const { questionBank, updateQuestionBankItem, deleteQuestionBankItem } = useApp();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTags, setEditTags] = useState('');

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        questionBank.forEach((item) => item.tags.forEach((tag) => tags.add(tag)));
        return Array.from(tags).sort();
    }, [questionBank]);

    const filteredItems = useMemo(() => {
        const q = searchTerm.toLowerCase();
        return questionBank
            .filter((item) => {
                const matchesSearch =
                    !q ||
                    item.question.prompt.toLowerCase().includes(q) ||
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
    }

    function saveTags(item: QuestionBankItem) {
        const tags = editTags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);
        updateQuestionBankItem({ ...item, tags });
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
                                            {t(`tests.question_type_${item.question.type.replace(/-/g, '_')}`)} ·{' '}
                                            {t('tests.total_points', { points: item.question.points })}
                                        </div>
                                        <div style={{ fontSize: '0.95rem', marginTop: 4 }}>
                                            {item.question.prompt || t('questionBank.untitled_prompt')}
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
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <Tag size={14} className="text-muted" />
                                        <input
                                            type="text"
                                            value={editTags}
                                            onChange={(e) => setEditTags(e.target.value)}
                                            placeholder={t('commentBank.tags_placeholder')}
                                            style={{ flex: 1 }}
                                            autoFocus
                                            onClick={(e) => e.stopPropagation()}
                                        />
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
        </>
    );
}
