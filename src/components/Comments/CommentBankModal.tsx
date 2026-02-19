import React, { useState, useMemo } from 'react';
import { X, Plus, Search, Trash2, Edit2, Tag, Check, Save } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CommentBankItem } from '../../types';

interface CommentBankModalProps {
    onClose: () => void;
    onSelect?: (text: string) => void;
}

export default function CommentBankModal({ onClose, onSelect }: CommentBankModalProps) {
    const { commentBank, addCommentBankItem, updateCommentBankItem, deleteCommentBankItem } = useApp();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Form state for creating/editing
    const [formText, setFormText] = useState('');
    const [formTags, setFormTags] = useState('');

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        commentBank.forEach(item => item.tags.forEach(t => tags.add(t)));
        return Array.from(tags).sort();
    }, [commentBank]);

    const filteredItems = useMemo(() => {
        return commentBank.filter(item => {
            const matchesSearch = item.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
            const matchesTags = selectedTags.size === 0 || item.tags.some(t => selectedTags.has(t));
            return matchesSearch && matchesTags;
        }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }, [commentBank, searchTerm, selectedTags]);

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
        const tags = formTags.split(',').map(t => t.trim()).filter(Boolean);
        if (editingId) {
            const existing = commentBank.find(i => i.id === editingId);
            if (existing) {
                updateCommentBankItem({ ...existing, text: formText, tags });
            }
            setEditingId(null);
        } else {
            addCommentBankItem(formText, tags);
            setIsCreating(false);
        }
    };

    const toggleTagFilter = (tag: string) => {
        setSelectedTags(prev => {
            const next = new Set(prev);
            if (next.has(tag)) next.delete(tag);
            else next.add(tag);
            return next;
        });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 600, maxWidth: '95vw', display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
                <div className="modal-header">
                    <h3>Comment Bank</h3>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
                </div>

                <div className="modal-body" style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    {/* Toolbar */}
                    <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexDirection: 'column' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <div className="input-group" style={{ flex: 1 }}>
                                <Search size={16} style={{ color: 'var(--text-dim)' }} />
                                <input
                                    type="text"
                                    placeholder="Search comments..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    style={{ border: 'none', background: 'transparent', width: '100%' }}
                                />
                            </div>
                            <button className="btn btn-primary" onClick={handleCreate} disabled={isCreating || editingId !== null}>
                                <Plus size={16} /> New
                            </button>
                        </div>
                        {allTags.length > 0 && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {allTags.map(tag => (
                                    <button
                                        key={tag}
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
                        <div style={{ padding: 16, background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                            <textarea
                                value={formText}
                                onChange={e => setFormText(e.target.value)}
                                placeholder="Write your comment here..."
                                rows={3}
                                style={{ width: '100%', marginBottom: 12 }}
                                autoFocus
                            />
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <Tag size={14} className="text-muted" />
                                <input
                                    type="text"
                                    value={formTags}
                                    onChange={e => setFormTags(e.target.value)}
                                    placeholder="Tags (comma separated)"
                                    style={{ flex: 1 }}
                                />
                                <button className="btn btn-ghost btn-sm" onClick={() => { setIsCreating(false); setEditingId(null); }}>Cancel</button>
                                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!formText.trim()}>
                                    <Save size={14} /> Save
                                </button>
                            </div>
                        </div>
                    )}

                    {/* List */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                        {filteredItems.length === 0 ? (
                            <div className="empty-state">No comments found.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {filteredItems.map(item => (
                                    <div key={item.id} className="card" style={{ padding: 12, cursor: onSelect ? 'pointer' : 'default', border: editingId === item.id ? '1px solid var(--accent)' : undefined }}
                                        onClick={() => onSelect && onSelect(item.text)}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                            <div style={{ fontSize: '0.95rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                                {item.text}
                                            </div>
                                            {!onSelect && (
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <button className="btn btn-ghost btn-icon btn-xs" onClick={(e) => { e.stopPropagation(); handleEdit(item); }}>
                                                        <Edit2 size={12} />
                                                    </button>
                                                    <button className="btn btn-ghost btn-icon btn-xs" style={{ color: 'var(--red)' }} onClick={(e) => { e.stopPropagation(); deleteCommentBankItem(item.id); }}>
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        {item.tags.length > 0 && (
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                {item.tags.map(t => (
                                                    <span key={t} style={{ fontSize: '0.7rem', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4, color: 'var(--text-dim)' }}>
                                                        {t}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
