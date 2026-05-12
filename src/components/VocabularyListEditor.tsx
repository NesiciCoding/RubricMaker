import React, { useState, useRef } from 'react';
import { Plus, Trash2, Upload, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { VocabularyItem, VocabularyCategory, RubricCriterion } from '../types';
import { nanoid } from '../utils/nanoid';

interface Props {
    rubricId: string;
    items: VocabularyItem[];
    criteria: RubricCriterion[];
    onAdd: (item: Omit<VocabularyItem, 'id'>) => void;
    onUpdate: (item: VocabularyItem) => void;
    onDelete: (itemId: string) => void;
}

const CATEGORIES: VocabularyCategory[] = ['vocabulary', 'grammar', 'discourse', 'other'];

const CATEGORY_COLORS: Record<VocabularyCategory, string> = {
    vocabulary: 'var(--accent)',
    grammar: '#22c55e',
    discourse: '#f59e0b',
    other: '#8b5cf6',
};

export default function VocabularyListEditor({ rubricId: _rubricId, items, criteria, onAdd, onUpdate, onDelete }: Props) {
    const { t } = useTranslation();
    const [filterCat, setFilterCat] = useState<VocabularyCategory | 'all'>('all');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newPhrase, setNewPhrase] = useState('');
    const [newCategory, setNewCategory] = useState<VocabularyCategory>('vocabulary');
    const [newCriterionId, setNewCriterionId] = useState('');
    const [newNotes, setNewNotes] = useState('');
    const csvRef = useRef<HTMLInputElement>(null);

    function handleAdd() {
        const phrase = newPhrase.trim();
        if (!phrase) return;
        onAdd({
            phrase,
            category: newCategory,
            linkedCriterionId: newCriterionId || undefined,
            notes: newNotes.trim() || undefined,
        });
        setNewPhrase('');
        setNewNotes('');
        setNewCriterionId('');
    }

    function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const text = reader.result as string;
            text.split('\n').forEach(line => {
                const phrase = line.split(',')[0].trim();
                if (phrase) {
                    onAdd({ phrase, category: newCategory });
                }
            });
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    function handleInlineUpdate(item: VocabularyItem, patch: Partial<VocabularyItem>) {
        onUpdate({ ...item, ...patch });
    }

    const visible = filterCat === 'all' ? items : items.filter(i => i.category === filterCat);

    return (
        <div>
            {/* Filter bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                {(['all', ...CATEGORIES] as const).map(cat => (
                    <button
                        key={cat}
                        className={filterCat === cat ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                        onClick={() => setFilterCat(cat)}
                        style={cat !== 'all' && filterCat !== cat ? { borderLeft: `3px solid ${CATEGORY_COLORS[cat]}` } : undefined}
                    >
                        {cat === 'all' ? t('vocabulary.filter_all', 'All') : t(`vocabulary.category_${cat}`, cat)}
                        {cat !== 'all' && ` (${items.filter(i => i.category === cat).length})`}
                    </button>
                ))}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <input ref={csvRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleCsvImport} />
                    <button className="btn btn-ghost btn-sm" onClick={() => csvRef.current?.click()} title={t('vocabulary.import_csv', 'Import from CSV')}>
                        <Upload size={14} />
                        {t('vocabulary.import_csv', 'Import CSV')}
                    </button>
                </div>
            </div>

            {/* Item list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {visible.length === 0 && (
                    <p className="text-muted text-sm" style={{ textAlign: 'center', padding: '20px 0' }}>
                        {t('vocabulary.empty', 'No items yet. Add phrases below.')}
                    </p>
                )}
                {visible.map(item => (
                    <div
                        key={item.id}
                        className="card"
                        style={{ padding: '10px 14px', borderLeft: `3px solid ${CATEGORY_COLORS[item.category]}` }}
                    >
                        {editingId === item.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <input
                                        className="input"
                                        style={{ flex: 1, minWidth: 160 }}
                                        value={item.phrase}
                                        onChange={e => handleInlineUpdate(item, { phrase: e.target.value })}
                                        placeholder={t('vocabulary.phrase_placeholder', 'Word or phrase…')}
                                    />
                                    <select
                                        className="input"
                                        style={{ width: 140 }}
                                        value={item.category}
                                        onChange={e => handleInlineUpdate(item, { category: e.target.value as VocabularyCategory })}
                                    >
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <select
                                        className="input"
                                        style={{ width: 180 }}
                                        value={item.linkedCriterionId ?? ''}
                                        onChange={e => handleInlineUpdate(item, { linkedCriterionId: e.target.value || undefined })}
                                    >
                                        <option value="">{t('vocabulary.no_criterion', '— No criterion —')}</option>
                                        {criteria.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input
                                        className="input"
                                        style={{ flex: 1 }}
                                        value={item.notes ?? ''}
                                        onChange={e => handleInlineUpdate(item, { notes: e.target.value || undefined })}
                                        placeholder={t('vocabulary.notes_placeholder', 'Notes (optional)…')}
                                    />
                                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>
                                        {t('common.done', 'Done')}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontWeight: 600, flex: 1 }}>{item.phrase}</span>
                                <span className="text-xs text-muted" style={{ minWidth: 80 }}>{item.category}</span>
                                {item.linkedCriterionId && (
                                    <span className="text-xs text-muted">
                                        {criteria.find(c => c.id === item.linkedCriterionId)?.title ?? ''}
                                    </span>
                                )}
                                {item.notes && <span className="text-xs text-muted" style={{ fontStyle: 'italic' }}>{item.notes}</span>}
                                <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }} onClick={() => setEditingId(item.id)}>
                                    <ChevronDown size={14} />
                                </button>
                                <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', color: 'var(--danger)' }} onClick={() => onDelete(item.id)}>
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Add row */}
            <div className="card" style={{ padding: 14 }}>
                <p className="text-xs text-muted" style={{ marginBottom: 10, fontWeight: 600, textTransform: 'uppercase' }}>
                    {t('vocabulary.add_item', 'Add item')}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <input
                        className="input"
                        style={{ flex: 1, minWidth: 160 }}
                        value={newPhrase}
                        onChange={e => setNewPhrase(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        placeholder={t('vocabulary.phrase_placeholder', 'Word or phrase…')}
                    />
                    <select className="input" style={{ width: 140 }} value={newCategory} onChange={e => setNewCategory(e.target.value as VocabularyCategory)}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className="input" style={{ width: 180 }} value={newCriterionId} onChange={e => setNewCriterionId(e.target.value)}>
                        <option value="">{t('vocabulary.no_criterion', '— No criterion —')}</option>
                        {criteria.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <input
                        className="input"
                        style={{ flex: 1 }}
                        value={newNotes}
                        onChange={e => setNewNotes(e.target.value)}
                        placeholder={t('vocabulary.notes_placeholder', 'Notes (optional)…')}
                    />
                    <button className="btn btn-primary" onClick={handleAdd} disabled={!newPhrase.trim()}>
                        <Plus size={16} />
                        {t('vocabulary.add', 'Add')}
                    </button>
                </div>
            </div>
        </div>
    );
}
