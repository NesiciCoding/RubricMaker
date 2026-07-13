import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Trash2, Edit2, Tag, Save, Users2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { useDbStatus } from '../../hooks/useDbStatus';
import { storageSync } from '../../services/database';
import { CommentBankItem } from '../../types';

interface CommentBankManagerProps {
    onSelect?: (text: string) => void;
    /** CEFR skill/level (or other tag) strings to surface a "Suggested" group for, when set */
    suggestedTags?: string[];
}

export default function CommentBankManager({ onSelect, suggestedTags }: CommentBankManagerProps) {
    const { t } = useTranslation();
    const { commentBank, addCommentBankItem, updateCommentBankItem, deleteCommentBankItem } = useApp();
    const dbStatus = useDbStatus();
    const [schoolShared, setSchoolShared] = useState<CommentBankItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        if (!dbStatus.isConnected) {
            setSchoolShared([]);
            return;
        }
        let cancelled = false;
        storageSync.adapter.fetchSchoolSharedCommentBank().then((items) => {
            if (!cancelled) setSchoolShared(items);
        });
        return () => {
            cancelled = true;
        };
    }, [dbStatus.isConnected]);

    // Form state for creating/editing
    const [formText, setFormText] = useState('');
    const [formTags, setFormTags] = useState('');

    const combinedItems = useMemo<Array<CommentBankItem & { isOwn: boolean }>>(
        () => [
            ...commentBank.map((item) => ({ ...item, isOwn: true })),
            ...schoolShared.map((item) => ({ ...item, isOwn: false })),
        ],
        [commentBank, schoolShared]
    );

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        combinedItems.forEach((item) => item.tags.forEach((tag) => tags.add(tag)));
        return Array.from(tags).sort();
    }, [combinedItems]);

    const filteredItems = useMemo(() => {
        return combinedItems
            .filter((item) => {
                const matchesSearch =
                    item.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    item.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()));
                const matchesTags = selectedTags.size === 0 || item.tags.some((tag) => selectedTags.has(tag));
                return matchesSearch && matchesTags;
            })
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }, [combinedItems, searchTerm, selectedTags]);

    // Additive surfacing, not filtering — matches items don't get hidden from the regular
    // list below, they're just echoed at the top when this criterion has a real signal.
    const suggestedItems = useMemo(() => {
        if (!suggestedTags?.length) return [];
        return filteredItems.filter((item) => item.tags.some((tag) => suggestedTags.includes(tag)));
    }, [filteredItems, suggestedTags]);

    const handleEdit = (item: CommentBankItem) => {
        setEditingId(item.id);
        setFormText(item.text);
        setFormTags(item.tags.join(', '));
        setIsCreating(false);
    };

    const handleCreate = () => {
        setIsCreating(true);
        setEditingId(null);
        setFormText('');
        setFormTags('');
    };

    const handleSave = () => {
        const tags = formTags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);
        if (editingId) {
            const existing = commentBank.find((i) => i.id === editingId);
            if (existing) {
                updateCommentBankItem({ ...existing, text: formText, tags });
            }
            setEditingId(null);
        } else {
            addCommentBankItem(formText, tags);
            setIsCreating(false);
        }
    };

    const renderItem = (item: CommentBankItem & { isOwn: boolean }) => (
        <div
            key={item.id}
            className="card"
            style={{
                padding: 12,
                cursor: onSelect ? 'pointer' : 'default',
                border: editingId === item.id ? '1px solid var(--accent)' : undefined,
            }}
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
            onClick={() => onSelect && onSelect(item.text)}
            onKeyDown={(e) => {
                if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSelect(item.text);
                }
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 6,
                }}
            >
                <div style={{ fontSize: '0.95rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{item.text}</div>
                {!onSelect && item.isOwn && (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-xs"
                            aria-label={t('rubricList.share_with_department')}
                            title={t('rubricList.share_with_department')}
                            style={{
                                color: item.sharedWithSchool ? 'var(--accent)' : undefined,
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                updateCommentBankItem({
                                    ...item,
                                    sharedWithSchool: !item.sharedWithSchool,
                                });
                            }}
                        >
                            <Users2 size={12} />
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-xs"
                            aria-label={t('common.edit')}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(item);
                            }}
                        >
                            <Edit2 size={12} />
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-xs"
                            aria-label={t('common.delete')}
                            style={{ color: 'var(--red)' }}
                            onClick={(e) => {
                                e.stopPropagation();
                                deleteCommentBankItem(item.id);
                            }}
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                )}
                {!item.isOwn && (
                    <span
                        style={{
                            fontSize: '0.65rem',
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: 'var(--accent-soft)',
                            color: 'var(--accent)',
                            fontWeight: 500,
                            flexShrink: 0,
                        }}
                    >
                        {t('rubricList.department_badge')}
                    </span>
                )}
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
    );

    const toggleTagFilter = (tag: string) => {
        setSelectedTags((prev) => {
            const next = new Set(prev);
            if (next.has(tag)) next.delete(tag);
            else next.add(tag);
            return next;
        });
    };

    return (
        <>
            {/* Toolbar */}
            <div
                style={{
                    padding: 16,
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    gap: 12,
                    flexDirection: 'column',
                }}
            >
                <div style={{ display: 'flex', gap: 8 }}>
                    <div className="input-group" style={{ flex: 1 }}>
                        <Search size={16} style={{ color: 'var(--text-dim)' }} />
                        <input
                            type="text"
                            placeholder={t('commentBank.search_placeholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ border: 'none', background: 'transparent', width: '100%' }}
                        />
                    </div>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleCreate}
                        disabled={isCreating || editingId !== null}
                    >
                        <Plus size={16} /> {t('commentBank.new_button')}
                    </button>
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

            {/* Editor Form */}
            {(isCreating || editingId) && (
                <div
                    style={{
                        padding: 16,
                        background: 'var(--bg-elevated)',
                        borderBottom: '1px solid var(--border)',
                    }}
                >
                    <textarea
                        value={formText}
                        onChange={(e) => setFormText(e.target.value)}
                        placeholder={t('commentBank.form_placeholder')}
                        rows={3}
                        style={{ width: '100%', marginBottom: 12 }}
                        autoFocus
                    />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Tag size={14} className="text-muted" />
                        <input
                            type="text"
                            value={formTags}
                            onChange={(e) => setFormTags(e.target.value)}
                            placeholder={t('commentBank.tags_placeholder')}
                            style={{ flex: 1 }}
                        />
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                                setIsCreating(false);
                                setEditingId(null);
                            }}
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={handleSave}
                            disabled={!formText.trim()}
                        >
                            <Save size={14} /> {t('common.save')}
                        </button>
                    </div>
                </div>
            )}

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {suggestedItems.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                        <div
                            className="text-muted text-xs"
                            style={{ fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}
                        >
                            {t('commentBank.suggested_for_criterion')}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {suggestedItems.map(renderItem)}
                        </div>
                    </div>
                )}
                {filteredItems.length === 0 ? (
                    <div className="empty-state">{t('commentBank.empty_state')}</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {filteredItems.map(renderItem)}
                    </div>
                )}
            </div>
        </>
    );
}
