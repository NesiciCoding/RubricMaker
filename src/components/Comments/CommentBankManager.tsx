import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Trash2, Edit2, Tag, Save, Users2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthoring } from '../../context/AppContext';
import { useDbStatus } from '../../hooks/useDbStatus';
import { useToast } from '../../hooks/useToast';
import { storageSync } from '../../services/database';
import { CEFR_LEVELS } from '../../data/cefrDescriptors';
import CefrBadge from '../CEFR/CefrBadge';
import { CommentBankItem, type CefrLevel } from '../../types';

interface CommentBankManagerProps {
    onSelect?: (item: CommentBankItem) => void;
    /** CEFR skill/level (or other tag) strings to surface a "Suggested" group for, when set */
    suggestedTags?: string[];
    /** Set from the routed /comment-bank page, which has room for the sort toggle; the compact modal doesn't render it. */
    fullPage?: boolean;
}

type SortMode = 'newest' | 'mostUsed';

/**
 * Tag chips are typed by hand, so they arrive in whatever shape the teacher used. Show the
 * readable form ('connected_speech' → 'Connected speech') without touching the stored value,
 * and leave already-formatted tags such as 'EFL' or 'B1' alone.
 */
export function humaniseTag(tag: string): string {
    const spaced = tag.replace(/[_-]+/g, ' ').trim();
    // Tags without a separator are left byte-identical: 'EFL', 'B1' and 'positive' were typed
    // that way on purpose, so only slug-shaped tags get tidied up.
    if (spaced === tag) return tag;
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export default function CommentBankManager({ onSelect, suggestedTags, fullPage }: CommentBankManagerProps) {
    const { t } = useTranslation();
    const { commentBank, addCommentBankItem, updateCommentBankItem, deleteCommentBankItem, restoreCommentBankItem } =
        useAuthoring();
    const { showToast } = useToast();

    const dbStatus = useDbStatus();
    const [schoolShared, setSchoolShared] = useState<CommentBankItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [sortMode, setSortMode] = useState<SortMode>('newest');

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

    const tagCounts = useMemo(() => {
        const counts = new Map<string, number>();
        combinedItems.forEach((item) => item.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
        return counts;
    }, [combinedItems]);

    // The sidebar splits authored tags into the CEFR levels (shown in level order) and everything
    // else (alphabetical), so a long tag list reads as two scannable groups instead of one blob.
    const cefrTags = useMemo<string[]>(() => CEFR_LEVELS.filter((level) => allTags.includes(level)), [allTags]);
    const otherTags = useMemo(() => allTags.filter((tag) => !cefrTags.includes(tag)), [allTags, cefrTags]);

    function cefrTagOf(item: CommentBankItem): CefrLevel | undefined {
        return item.tags.find((tag): tag is CefrLevel => (CEFR_LEVELS as readonly string[]).includes(tag));
    }

    // A selected tag whose last comment was deleted has no chip left to untick (the compact view has
    // no "All" button), so it stops filtering instead of hiding everything.
    const activeTags = useMemo(() => [...selectedTags].filter((tag) => tagCounts.has(tag)), [selectedTags, tagCounts]);

    const filteredItems = useMemo(() => {
        const needle = searchTerm.toLowerCase();
        return combinedItems
            .filter((item) => {
                // Match both the stored tag and the label the chip actually shows, so searching for
                // the words on screen ('connected speech') finds a comment tagged the slug.
                const matchesSearch =
                    item.text.toLowerCase().includes(needle) ||
                    item.tags.some(
                        (tag) => tag.toLowerCase().includes(needle) || humaniseTag(tag).toLowerCase().includes(needle)
                    );
                // Each selected tag narrows the list further (B1 + Grammar = B1 grammar comments).
                const matchesTags = activeTags.every((tag) => item.tags.includes(tag));
                return matchesSearch && matchesTags;
            })
            .sort((a, b) =>
                sortMode === 'mostUsed'
                    ? (b.usageCount ?? 0) - (a.usageCount ?? 0)
                    : b.createdAt.localeCompare(a.createdAt)
            );
    }, [combinedItems, searchTerm, activeTags, sortMode]);

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
            /* v8 ignore next -- provably dead: editingId only ever comes from handleEdit, which is only reachable via the edit button on own (commentBank-derived) items */
            if (existing) {
                updateCommentBankItem({ ...existing, text: formText, tags });
            }
            setEditingId(null);
        } else {
            addCommentBankItem(formText, tags);
            setIsCreating(false);
        }
    };

    const handleDelete = ({ isOwn: _isOwn, ...item }: CommentBankItem & { isOwn: boolean }) => {
        deleteCommentBankItem(item.id);
        showToast(t('commentBank.deleted_toast'), 'info', {
            action: { label: t('common.undo'), onClick: () => restoreCommentBankItem(item) },
        });
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
                    flexWrap: 'wrap',
                    gap: 4,
                    marginBottom: 6,
                }}
            >
                {/* minWidth 0 lets a long comment wrap instead of pushing the action icons out of view. */}
                <div
                    style={{
                        fontSize: '0.95rem',
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.5,
                        minWidth: 0,
                        overflowWrap: 'anywhere',
                        flex: '1 1 160px',
                    }}
                >
                    {item.text}
                </div>
                {!onSelect && item.isOwn && (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                        <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-xs"
                            aria-label={t('rubricList.share_with_department')}
                            title={t('rubricList.share_with_department')}
                            style={{
                                color: item.sharedWithSchool ? 'var(--accent-text)' : undefined,
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
                            style={{ color: 'var(--red-text)' }}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(item);
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
                            color: 'var(--accent-text)',
                            fontWeight: 500,
                            flexShrink: 0,
                        }}
                    >
                        {t('rubricList.department_badge')}
                    </span>
                )}
            </div>
            {(cefrTagOf(item) || !!item.usageCount) && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    {cefrTagOf(item) && <CefrBadge level={cefrTagOf(item)!} size="sm" />}
                    {!!item.usageCount && (
                        <span className="text-xs text-muted">
                            {t('commentBank.usage_count_label', { count: item.usageCount })}
                        </span>
                    )}
                </div>
            )}
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
                            {humaniseTag(tag)}
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

    const searchAndNewRow = (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 200px' }}>
                <Search
                    size={15}
                    aria-hidden="true"
                    style={{
                        position: 'absolute',
                        left: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--text-dim)',
                    }}
                />
                <input
                    type="text"
                    aria-label={t('commentBank.search_placeholder')}
                    placeholder={t('commentBank.search_placeholder')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input"
                    style={{ paddingLeft: 36, width: '100%' }}
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
    );

    const sortToggleRow = (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="text-xs text-muted">{t('commentBank.sort_label')}</span>
            <button
                type="button"
                className={`btn btn-xs ${sortMode === 'newest' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSortMode('newest')}
            >
                {t('commentBank.sort_newest')}
            </button>
            <button
                type="button"
                className={`btn btn-xs ${sortMode === 'mostUsed' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSortMode('mostUsed')}
            >
                {t('commentBank.sort_most_used')}
            </button>
        </div>
    );

    const editorForm = (isCreating || editingId) && (
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
    );

    const renderTagRow = (tag: string) => (
        <button
            key={tag}
            type="button"
            className="btn btn-ghost btn-sm"
            style={{
                justifyContent: 'space-between',
                fontWeight: selectedTags.has(tag) ? 700 : 400,
                color: selectedTags.has(tag) ? 'var(--accent-text)' : undefined,
            }}
            onClick={() => toggleTagFilter(tag)}
            aria-pressed={selectedTags.has(tag)}
        >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                <Tag size={12} style={{ flexShrink: 0 }} />
                <span
                    style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {humaniseTag(tag)}
                </span>
            </span>
            <span className="text-xs text-muted" aria-hidden="true">
                {tagCounts.get(tag)}
            </span>
        </button>
    );

    const itemList = (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {activeTags.length > 1 && (
                <p className="text-xs text-muted" style={{ marginBottom: 12 }}>
                    {t('commentBank.filter_all_tags_hint', { count: activeTags.length })}
                </p>
            )}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{filteredItems.map(renderItem)}</div>
            )}
        </div>
    );

    if (fullPage) {
        return (
            // height: '100%' is load-bearing: .page-content (this component's parent) is the
            // page's own scroll container (see index.css's .main-area/.page-content comment) —
            // without a bounded height here, this row just grows and .page-content scrolls the
            // whole thing, including the sidebar, instead of the sidebar and item list each
            // scrolling independently within the available space.
            <div className="comment-bank-layout" style={{ display: 'flex', height: '100%', minHeight: 0 }}>
                <aside
                    className="comment-bank-sidebar"
                    style={{
                        width: 220,
                        flexShrink: 0,
                        borderRight: '1px solid var(--border)',
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        overflowY: 'auto',
                    }}
                >
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{
                            justifyContent: 'space-between',
                            fontWeight: selectedTags.size === 0 ? 700 : 400,
                            color: selectedTags.size === 0 ? 'var(--accent-text)' : undefined,
                        }}
                        onClick={() => setSelectedTags(new Set())}
                    >
                        <span>{t('commentBank.sidebar_all_comments')}</span>
                        <span className="text-xs text-muted" aria-hidden="true">
                            {combinedItems.length}
                        </span>
                    </button>
                    {cefrTags.length > 0 && (
                        <div className="text-muted text-xs tag-group-heading">{t('commentBank.tag_group_cefr')}</div>
                    )}
                    {cefrTags.map(renderTagRow)}
                    {otherTags.length > 0 && (
                        <div className="text-muted text-xs tag-group-heading">{t('commentBank.tag_group_other')}</div>
                    )}
                    {otherTags.map(renderTagRow)}
                </aside>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
                    <div
                        style={{
                            padding: 16,
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            gap: 12,
                            flexDirection: 'column',
                            flexShrink: 0,
                        }}
                    >
                        {searchAndNewRow}
                        {sortToggleRow}
                    </div>
                    {editorForm}
                    {itemList}
                </div>
            </div>
        );
    }

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
                {searchAndNewRow}
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
                                {humaniseTag(tag)}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            {editorForm}
            {itemList}
        </>
    );
}
