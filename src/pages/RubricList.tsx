import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, Copy, BookOpen, Users } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { DEFAULT_FORMAT } from '../types';
import { nanoid } from '../utils/nanoid';

export default function RubricList() {
    const navigate = useNavigate();
    const { rubrics, students, studentRubrics, addRubric, deleteRubric } = useApp();
    const [search, setSearch] = useState('');
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const filtered = rubrics.filter(r =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.subject.toLowerCase().includes(search.toLowerCase())
    );

    function handleDuplicate(rubricId: string) {
        const r = rubrics.find(x => x.id === rubricId);
        if (!r) return;
        addRubric({
            ...r,
            name: `${r.name} (Copy)`,
            criteria: r.criteria.map(c => ({ ...c, id: nanoid(), levels: c.levels.map(l => ({ ...l, id: nanoid() })) })),
            attachmentIds: [],
        });
    }

    return (
        <>
            <Topbar title="Rubrics" actions={
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/rubrics/new')}>
                    <Plus size={15} /> New Rubric
                </button>
            } />
            <div className="page-content fade-in">
                <div style={{ position: 'relative', maxWidth: 400, marginBottom: 20 }}>
                    <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                    <input
                        type="text"
                        placeholder="Search rubrics…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ paddingLeft: 36 }}
                    />
                </div>

                {filtered.length === 0 ? (
                    <div className="empty-state">
                        <BookOpen size={40} />
                        <h3>No rubrics yet</h3>
                        <p className="text-muted text-sm">Create your first rubric to get started.</p>
                        <button className="btn btn-primary" onClick={() => navigate('/rubrics/new')}>
                            <Plus size={16} /> Create Rubric
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                        {filtered.map(r => {
                            const gradedStudents = [...new Set(studentRubrics.filter(sr => sr.rubricId === r.id).map(sr => sr.studentId))];
                            return (
                                <div key={r.id} className="card" style={{ cursor: 'pointer', transition: 'border-color var(--transition)' }}
                                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                        <div>
                                            <h3>{r.name}</h3>
                                            {r.subject && <div className="text-muted text-xs" style={{ marginTop: 2 }}>{r.subject}</div>}
                                        </div>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button className="btn btn-ghost btn-icon btn-sm" title="Duplicate"
                                                onClick={e => { e.stopPropagation(); handleDuplicate(r.id); }}>
                                                <Copy size={14} />
                                            </button>
                                            <button className="btn btn-ghost btn-icon btn-sm" title="Edit"
                                                onClick={e => { e.stopPropagation(); navigate(`/rubrics/${r.id}`); }}>
                                                <Edit2 size={14} />
                                            </button>
                                            <button className="btn btn-ghost btn-icon btn-sm" title="Delete"
                                                style={{ color: 'var(--red)' }}
                                                onClick={e => { e.stopPropagation(); setConfirmDelete(r.id); }}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                                        <span className="badge badge-blue">{r.criteria.length} criteria</span>
                                        <span className="badge badge-purple">{r.criteria[0]?.levels.length ?? 0} levels</span>
                                        <span className="badge badge-green">{gradedStudents.length} students graded</span>
                                    </div>

                                    {r.description && (
                                        <p className="text-muted text-sm truncate" style={{ marginBottom: 14 }}>{r.description}</p>
                                    )}

                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
                                            onClick={() => navigate(`/rubrics/${r.id}`)}>
                                            <Edit2 size={14} /> Edit Rubric
                                        </button>
                                        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }}
                                            onClick={() => navigate('/students')}>
                                            <Users size={14} /> Grade Students
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Delete confirm modal */}
                {confirmDelete && (
                    <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
                        <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
                            <div className="modal-header"><h3>Delete Rubric</h3></div>
                            <div className="modal-body">
                                <p>This will permanently delete the rubric and all associated student scores. This cannot be undone.</p>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
                                <button className="btn btn-danger" onClick={() => { deleteRubric(confirmDelete); setConfirmDelete(null); }}>
                                    <Trash2 size={14} /> Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
