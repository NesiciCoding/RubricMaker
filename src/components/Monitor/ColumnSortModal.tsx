import React, { useState } from 'react';
import { X, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ColumnSortKey, ColumnSortRule } from '../../utils/responseGridOrder';

const KEYS: ColumnSortKey[] = ['section', 'cefr', 'type', 'grammar', 'score'];

export interface ColumnSortModalProps {
    rules: ColumnSortRule[];
    onApply: (rules: ColumnSortRule[]) => void;
    onClose: () => void;
}

export default function ColumnSortModal({ rules, onApply, onClose }: ColumnSortModalProps) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState<ColumnSortRule[]>(rules.filter((r) => r.key !== 'original'));

    const usedKeys = new Set(draft.map((r) => r.key));
    const nextUnusedKey = () => KEYS.find((k) => !usedKeys.has(k)) ?? 'section';

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={t('tests.monitor.grid.sort_title')}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
            }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'var(--bg-elevated)',
                    borderRadius: 12,
                    padding: 20,
                    maxWidth: 480,
                    width: '90%',
                    maxHeight: '80vh',
                    overflowY: 'auto',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <h3 style={{ margin: 0 }}>{t('tests.monitor.grid.sort_title')}</h3>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label={t('common.close')}>
                        <X size={16} />
                    </button>
                </div>
                <p className="text-muted text-sm" style={{ margin: '6px 0 14px' }}>
                    {t('tests.monitor.grid.sort_hint')}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {draft.length === 0 && (
                        <p className="text-muted text-sm" style={{ margin: 0 }}>
                            {t('tests.monitor.grid.sort_none')}
                        </p>
                    )}
                    {draft.map((rule, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="text-muted text-xs" style={{ width: 56 }}>
                                {t(i === 0 ? 'tests.monitor.grid.sort_by' : 'tests.monitor.grid.sort_then')}
                            </span>
                            <select
                                aria-label={t(i === 0 ? 'tests.monitor.grid.sort_by' : 'tests.monitor.grid.sort_then')}
                                value={rule.key}
                                onChange={(e) =>
                                    setDraft((prev) =>
                                        prev.map((r, j) =>
                                            j === i ? { ...r, key: e.target.value as ColumnSortKey } : r
                                        )
                                    )
                                }
                                style={{ flex: 1 }}
                            >
                                {KEYS.map((k) => (
                                    <option key={k} value={k} disabled={k !== rule.key && usedKeys.has(k)}>
                                        {t(`tests.monitor.grid.sort_key.${k}`)}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm btn-icon"
                                title={t(`tests.monitor.grid.sort_dir_${rule.dir}`)}
                                aria-label={t(`tests.monitor.grid.sort_dir_${rule.dir}`)}
                                onClick={() =>
                                    setDraft((prev) =>
                                        prev.map((r, j) =>
                                            j === i ? { ...r, dir: r.dir === 'asc' ? 'desc' : 'asc' } : r
                                        )
                                    )
                                }
                            >
                                {rule.dir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                            </button>
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm btn-icon"
                                aria-label={t('tests.monitor.grid.sort_remove')}
                                onClick={() => setDraft((prev) => prev.filter((_, j) => j !== i))}
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>

                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 10 }}
                    disabled={draft.length >= KEYS.length}
                    onClick={() => setDraft((prev) => [...prev, { key: nextUnusedKey(), dir: 'asc' }])}
                >
                    <Plus size={14} /> {t('tests.monitor.grid.sort_add')}
                </button>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft([])}>
                        {t('tests.monitor.grid.sort_reset')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                            onApply(draft.length ? draft : [{ key: 'original', dir: 'asc' }]);
                            onClose();
                        }}
                    >
                        {t('tests.monitor.grid.sort_apply')}
                    </button>
                </div>
            </div>
        </div>
    );
}
