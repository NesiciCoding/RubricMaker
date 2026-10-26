import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Link2, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import type { SubItem, SubItemMode } from '../../types';
import { createSubItem, splitIntoSubItemLabels, subItemRange } from '../../utils/subItems';

interface Props {
    items: SubItem[];
    mode: SubItemMode;
    /** Names the list for screen readers, e.g. the level label. */
    levelLabel: string;
    onChange: (items: SubItem[]) => void;
    onLinkStandard: (subItemId: string) => void;
    onUnlinkStandard: (subItemId: string, standardIndex: number) => void;
    /** Other levels of the same criterion a sub-item can be moved to. */
    moveTargets: { id: string; label: string }[];
    onMove: (subItemId: string, levelId: string) => void;
    /** Drops the heading and keyboard hint, for grids that show one hint for many lists. */
    compact?: boolean;
}

/**
 * Inline list editor for one level's sub-items: Enter adds the next item, Backspace on an empty
 * item removes it, Alt+↑/↓ reorders, and pasting several lines adds one item per line.
 */
export default function SubItemListEditor({
    items,
    mode,
    levelLabel,
    onChange,
    onLinkStandard,
    onUnlinkStandard,
    moveTargets,
    onMove,
    compact = false,
}: Props) {
    const { t } = useTranslation();
    const inputs = useRef(new Map<string, HTMLTextAreaElement>());
    const pendingFocus = useRef<string | null>(null);
    const [rangeOpen, setRangeOpen] = useState<ReadonlySet<string>>(new Set());

    useEffect(() => {
        if (!pendingFocus.current) return;
        const el = inputs.current.get(pendingFocus.current);
        if (!el) return;
        pendingFocus.current = null;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
    });

    const update = (id: string, patch: Partial<SubItem>) =>
        onChange(items.map((si) => (si.id === id ? { ...si, ...patch } : si)));

    function insertAfter(index: number, labels: string[]) {
        const added = labels.map((label) => createSubItem(mode, label));
        pendingFocus.current = added[added.length - 1].id;
        onChange([...items.slice(0, index + 1), ...added, ...items.slice(index + 1)]);
    }

    function remove(index: number, focusPrevious: boolean) {
        if (focusPrevious) pendingFocus.current = items[index - 1]?.id ?? items[index + 1]?.id ?? null;
        onChange(items.filter((_, i) => i !== index));
    }

    function move(index: number, dir: -1 | 1) {
        const to = index + dir;
        if (to < 0 || to >= items.length) return;
        const next = [...items];
        [next[index], next[to]] = [next[to], next[index]];
        pendingFocus.current = items[index].id;
        onChange(next);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>, index: number) {
        // Enter also confirms an IME candidate; that must not add a statement.
        if (e.nativeEvent.isComposing) return;
        const si = items[index];
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            insertAfter(index, ['']);
        } else if (e.key === 'Backspace' && si.label === '') {
            e.preventDefault();
            remove(index, true);
        } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
            move(index, e.key === 'ArrowUp' ? -1 : 1);
        }
    }

    function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>, index: number) {
        const text = e.clipboardData.getData('text');
        if (!/\r?\n/.test(text.trim())) return;
        const labels = splitIntoSubItemLabels(text);
        if (labels.length === 0) return;
        e.preventDefault();
        if (items[index].label.trim() === '') {
            const [first, ...rest] = labels;
            const replaced = items.map((si, i) => (i === index ? { ...si, label: first } : si));
            const added = rest.map((label) => createSubItem(mode, label));
            pendingFocus.current = (added[added.length - 1] ?? replaced[index]).id;
            onChange([...replaced.slice(0, index + 1), ...added, ...replaced.slice(index + 1)]);
        } else {
            insertAfter(index, labels);
        }
    }

    const iconBtn = { height: 26, width: 26 } as const;

    return (
        <div style={{ marginTop: compact ? 0 : 8 }}>
            {!compact && (
                <div
                    className="text-xs text-muted"
                    style={{ textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}
                >
                    {mode === 'checklist'
                        ? t('rubricBuilder.sub_items_checklist_heading')
                        : t('rubricBuilder.label_sub_items')}
                </div>
            )}
            <ul
                aria-label={t('rubricBuilder.sub_items_list_label', { level: levelLabel })}
                style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
            >
                {items.map((si, index) => {
                    const { min, max } = subItemRange(si);
                    const showRange = rangeOpen.has(si.id) || min > 0;
                    return (
                        <li
                            key={si.id}
                            data-testid="sub-item-row"
                            style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                        >
                            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                {mode === 'checklist' && (
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            width: 12,
                                            height: 12,
                                            marginTop: 7,
                                            flexShrink: 0,
                                            border: '1.5px solid var(--text-muted)',
                                            borderRadius: 2,
                                        }}
                                    />
                                )}
                                <textarea
                                    ref={(el) => {
                                        if (el) inputs.current.set(si.id, el);
                                        else inputs.current.delete(si.id);
                                    }}
                                    className="sub-item-input"
                                    value={si.label}
                                    rows={1}
                                    onChange={(e) => update(si.id, { label: e.target.value.replace(/\r?\n/g, ' ') })}
                                    onKeyDown={(e) => handleKeyDown(e, index)}
                                    onPaste={(e) => handlePaste(e, index)}
                                    placeholder={t('rubricBuilder.placeholder_sub_item_label')}
                                    aria-label={t('rubricBuilder.label_sub_item_n', { n: index + 1 })}
                                    style={{
                                        flex: 1,
                                        minWidth: 0,
                                        fontSize: '0.8rem',
                                        resize: 'none',
                                        fontFamily: 'inherit',
                                        padding: '4px 6px',
                                        borderRadius: 4,
                                        border: '1px solid var(--border)',
                                    }}
                                />
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 4,
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    paddingLeft: mode === 'checklist' ? 18 : 0,
                                }}
                            >
                                {mode === 'points' && (
                                    <>
                                        {showRange && (
                                            <>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={max}
                                                    value={min}
                                                    onChange={(e) =>
                                                        update(si.id, { minPoints: Number(e.target.value) })
                                                    }
                                                    aria-label={t('rubricBuilder.sub_item_min_title')}
                                                    title={t('rubricBuilder.sub_item_min_title')}
                                                    style={{
                                                        width: 48,
                                                        height: 26,
                                                        fontSize: '0.78rem',
                                                        padding: '2px 4px',
                                                    }}
                                                />
                                                <span className="text-xs text-muted">–</span>
                                            </>
                                        )}
                                        <input
                                            type="number"
                                            min={min}
                                            value={max}
                                            onChange={(e) => {
                                                const value = Number(e.target.value);
                                                update(si.id, { maxPoints: value, points: value });
                                            }}
                                            aria-label={t('rubricBuilder.sub_item_max_title')}
                                            title={t('rubricBuilder.sub_item_max_title')}
                                            style={{ width: 48, height: 26, fontSize: '0.78rem', padding: '2px 4px' }}
                                        />
                                        <span className="text-xs text-muted">{t('rubricBuilder.points_unit')}</span>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-icon btn-sm"
                                            aria-pressed={showRange}
                                            disabled={min > 0}
                                            onClick={() =>
                                                setRangeOpen((prev) => {
                                                    const next = new Set(prev);
                                                    if (next.has(si.id)) next.delete(si.id);
                                                    else next.add(si.id);
                                                    return next;
                                                })
                                            }
                                            title={t('rubricBuilder.sub_item_range_toggle')}
                                            aria-label={t('rubricBuilder.sub_item_range_toggle')}
                                            style={{ ...iconBtn, color: 'var(--text-muted)' }}
                                        >
                                            <SlidersHorizontal size={11} />
                                        </button>
                                    </>
                                )}
                                <div style={{ flex: 1 }} />
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-icon btn-sm"
                                    disabled={index === 0}
                                    onClick={() => move(index, -1)}
                                    title={t('rubricBuilder.sub_item_move_up')}
                                    aria-label={t('rubricBuilder.sub_item_move_up')}
                                    style={{ ...iconBtn, color: 'var(--text-muted)' }}
                                >
                                    <ArrowUp size={11} />
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-icon btn-sm"
                                    disabled={index === items.length - 1}
                                    onClick={() => move(index, 1)}
                                    title={t('rubricBuilder.sub_item_move_down')}
                                    aria-label={t('rubricBuilder.sub_item_move_down')}
                                    style={{ ...iconBtn, color: 'var(--text-muted)' }}
                                >
                                    <ArrowDown size={11} />
                                </button>
                                {moveTargets.length > 0 && (
                                    <select
                                        value=""
                                        onChange={(e) => {
                                            if (e.target.value) onMove(si.id, e.target.value);
                                        }}
                                        aria-label={t('rubricBuilder.sub_item_move_to_level')}
                                        title={t('rubricBuilder.sub_item_move_to_level')}
                                        style={{ height: 26, fontSize: '0.72rem', padding: '0 4px', maxWidth: 110 }}
                                    >
                                        <option value="">{t('rubricBuilder.sub_item_move_to_level_short')}</option>
                                        {moveTargets.map((lvl) => (
                                            <option key={lvl.id} value={lvl.id}>
                                                {lvl.label || t('rubricBuilder.untitled')}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-icon btn-sm"
                                    onClick={() => onLinkStandard(si.id)}
                                    title={t('rubricBuilder.sub_item_link_standard_title')}
                                    aria-label={t('rubricBuilder.sub_item_link_standard_title')}
                                    style={{ ...iconBtn, color: 'var(--accent)' }}
                                >
                                    <Link2 size={11} />
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-icon btn-sm"
                                    onClick={() => remove(index, false)}
                                    title={t('rubricBuilder.sub_item_delete_title')}
                                    aria-label={t('rubricBuilder.sub_item_delete_title')}
                                    style={{ ...iconBtn, color: 'var(--red)' }}
                                >
                                    <Trash2 size={11} />
                                </button>
                            </div>
                            {si.linkedStandards && si.linkedStandards.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                    {si.linkedStandards.map((std, idx) => (
                                        <div
                                            key={std.guid + idx}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 4,
                                                background: 'var(--accent-soft)',
                                                borderRadius: 4,
                                                padding: '2px 6px',
                                                fontSize: '0.65rem',
                                            }}
                                        >
                                            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                                                {std.statementNotation ?? std.guid}
                                            </span>
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-icon"
                                                aria-label={t('rubricBuilder.action_unlink_standard')}
                                                style={{
                                                    padding: 0,
                                                    height: 'auto',
                                                    minHeight: 0,
                                                    color: 'var(--text-muted)',
                                                }}
                                                onClick={() => onUnlinkStandard(si.id, idx)}
                                            >
                                                <X size={10} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
            <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '0.78rem', marginTop: 4 }}
                onClick={() => insertAfter(items.length - 1, [''])}
            >
                <Plus size={12} /> {t('rubricBuilder.action_add_sub_item')}
            </button>
            {!compact && items.length > 0 && (
                <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                    {t('rubricBuilder.sub_items_keyboard_hint')}
                </div>
            )}
        </div>
    );
}
