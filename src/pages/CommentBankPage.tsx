import React, { useState } from 'react';
import { Plus, Trash2, MessageSquare, Tag, Edit2 } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';

const TAGS = ['positive', 'improvement', 'structure', 'content', 'creativity', 'general'];

export default function CommentBankPage() {
    const { commentSnippets, addCommentSnippet, deleteCommentSnippet } = useApp();
    const [text, setText] = useState('');
    const [tag, setTag] = useState('general');
    const [filterTag, setFilterTag] = useState('all');

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [editTag, setEditTag] = useState('');

    const filtered = filterTag === 'all'
        ? commentSnippets
        : commentSnippets.filter(s => s.tag === filterTag);

    function handleAdd() {
        if (!text.trim()) return;
        addCommentSnippet(text.trim(), tag);
        setText('');
    }

    function handleSaveEdit(id: string) {
        if (!editText.trim()) return;
        // @ts-ignore - updateCommentSnippet is injected by AppContext
        if (typeof useApp().updateCommentSnippet === 'function') {
            // @ts-ignore
            useApp().updateCommentSnippet({ id, text: editText.trim(), tag: editTag });
        }
        setEditingId(null);
    }

    return (
        <>
            <Topbar title="Comment Bank" />
            <div className="page-content fade-in">
                {/* Add snippet */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <h3 style={{ marginBottom: 14 }}>Add New Snippet</h3>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <textarea
                            style={{ flex: 1 }}
                            placeholder="Type a reusable comment snippet…"
                            value={text}
                            onChange={e => setText(e.target.value)}
                            rows={2}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <select value={tag} onChange={e => setTag(e.target.value)}>
                                {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <button className="btn btn-primary" onClick={handleAdd} disabled={!text.trim()}>
                                <Plus size={15} /> Add
                            </button>
                        </div>
                    </div>
                </div>

                {/* Filter */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    {['all', ...TAGS].map(t => (
                        <button
                            key={t}
                            className={`btn btn-sm ${filterTag === t ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setFilterTag(t)}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                {filtered.length === 0 ? (
                    <div className="empty-state">
                        <MessageSquare size={32} />
                        <p>No snippets yet. Add some above for one-click insertion while grading.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                        {filtered.map(snip => (
                            <div key={snip.id} className="card" style={{ position: 'relative' }}>
                                {editingId === snip.id ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <textarea
                                            style={{ width: '100%' }}
                                            rows={2}
                                            value={editText}
                                            onChange={e => setEditText(e.target.value)}
                                            autoFocus
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <select value={editTag} onChange={e => setEditTag(e.target.value)} style={{ padding: '4px 8px' }}>
                                                {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                                                <button className="btn btn-primary btn-sm" onClick={() => handleSaveEdit(snip.id)}>Save</button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <span className={`badge badge-${snip.tag === 'positive' ? 'green' : snip.tag === 'improvement' ? 'yellow' : 'blue'}`}>
                                                <Tag size={10} /> {snip.tag}
                                            </span>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button className="btn btn-ghost btn-icon btn-sm"
                                                    onClick={() => { setEditingId(snip.id); setEditText(snip.text); setEditTag(snip.tag); }}>
                                                    <Edit2 size={13} />
                                                </button>
                                                <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--red)' }}
                                                    onClick={() => deleteCommentSnippet(snip.id)}>
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                        <p style={{ marginTop: 10, fontSize: '0.875rem', lineHeight: 1.5 }}>{snip.text}</p>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
