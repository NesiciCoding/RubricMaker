import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const DEFAULT_VISIBLE = 24;

interface TagFilterChipsProps {
    tags: string[];
    isSelected: (tag: string) => boolean;
    onToggle: (tag: string) => void;
    initialVisible?: number;
}

/**
 * Searchable, collapsible tag filter. Avoids rendering the whole bank's tag set (often 100+) as a
 * single unfilterable chip wall: shows a search box, selected tags pinned first, and the rest
 * capped behind a "show all" toggle.
 */
export default function TagFilterChips({
    tags,
    isSelected,
    onToggle,
    initialVisible = DEFAULT_VISIBLE,
}: TagFilterChipsProps) {
    const { t } = useTranslation();
    const [search, setSearch] = useState('');
    const [showAll, setShowAll] = useState(false);

    const q = search.trim().toLowerCase();
    const visible = useMemo(() => {
        if (q) return tags.filter((tag) => tag.toLowerCase().includes(q));
        if (showAll) return tags;
        const selected = tags.filter(isSelected);
        const rest = tags.filter((tag) => !isSelected(tag));
        return [...selected, ...rest].slice(0, Math.max(initialVisible, selected.length));
    }, [tags, q, showAll, isSelected, initialVisible]);

    const hiddenCount = tags.length - visible.length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('questionBank.tag_filter_search')}
                aria-label={t('questionBank.tag_filter_search')}
                style={{ fontSize: '0.8rem', maxWidth: 240 }}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {visible.map((tag) => (
                    <button
                        key={tag}
                        type="button"
                        className={`btn btn-xs ${isSelected(tag) ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => onToggle(tag)}
                        aria-pressed={isSelected(tag)}
                        style={{ borderRadius: 12, fontSize: '0.75rem', padding: '2px 8px' }}
                    >
                        {tag}
                    </button>
                ))}
                {!q && !showAll && hiddenCount > 0 && (
                    <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        onClick={() => setShowAll(true)}
                        style={{ fontSize: '0.75rem' }}
                    >
                        {t('questionBank.tag_filter_show_all', { count: tags.length })}
                    </button>
                )}
                {!q && showAll && tags.length > initialVisible && (
                    <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        onClick={() => setShowAll(false)}
                        style={{ fontSize: '0.75rem' }}
                    >
                        {t('questionBank.tag_filter_show_less')}
                    </button>
                )}
                {q && visible.length === 0 && (
                    <span className="text-muted text-xs">{t('questionBank.tag_filter_no_match')}</span>
                )}
            </div>
        </div>
    );
}
