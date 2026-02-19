import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Edit2, Users as UsersIcon, Upload, Download } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import Papa from 'papaparse';

export default function StudentsPage() {
    const navigate = useNavigate();
    const { students, classes, rubrics, studentRubrics, addStudent, updateStudent, deleteStudent, addClass } = useApp();
    const [activeClass, setActiveClass] = useState(classes[0]?.id ?? '');
    const [showAddModal, setShowAddModal] = useState(false);
    const [editStudent, setEditStudent] = useState<null | { id: string; name: string; email: string }>(null);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [newClassName, setNewClassName] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const filteredStudents = students.filter(s => s.classId === activeClass);

    function handleAddStudent() {
        if (!name.trim()) return;
        if (editStudent) {
            updateStudent({ ...students.find(s => s.id === editStudent.id)!, name, email });
        } else {
            addStudent({ name, email, classId: activeClass });
        }
        setName(''); setEmail(''); setShowAddModal(false); setEditStudent(null);
    }

    function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        Papa.parse(file, {
            header: true,
            complete: ({ data }) => {
                (data as { name?: string; email?: string }[]).forEach(row => {
                    if (row.name) addStudent({ name: row.name, email: row.email ?? '', classId: activeClass });
                });
            }
        });
        e.target.value = '';
    }

    function exportCSV() {
        const rows = filteredStudents.map(s => ({ name: s.name, email: s.email ?? '' }));
        const csv = Papa.unparse(rows);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'students.csv'; a.click();
    }

    return (
        <>
            <Topbar title="Students & Classes" actions={
                <>
                    <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                        <Upload size={15} /> Import CSV
                    </button>
                    <input ref={fileRef} type="file" accept=".csv" onChange={handleCSVImport} style={{ display: 'none' }} />
                    <button className="btn btn-secondary btn-sm" onClick={exportCSV}>
                        <Download size={15} /> Export CSV
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
                        <Plus size={15} /> Add Student
                    </button>
                </>
            } />
            <div className="page-content fade-in">
                <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
                    {/* Class list */}
                    <div className="card" style={{ height: 'fit-content' }}>
                        <div className="card-header">
                            <h3>Classes</h3>
                        </div>
                        {classes.map(c => (
                            <button key={c.id} className={`nav-item ${c.id === activeClass ? 'active' : ''}`}
                                onClick={() => setActiveClass(c.id)}>
                                <UsersIcon size={15} />
                                <span className="truncate">{c.name}</span>
                                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.7 }}>
                                    {students.filter(s => s.classId === c.id).length}
                                </span>
                            </button>
                        ))}
                        <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                            <input type="text" placeholder="New class…" value={newClassName}
                                onChange={e => setNewClassName(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && newClassName.trim()) {
                                        addClass({ name: newClassName.trim() });
                                        setNewClassName('');
                                    }
                                }}
                                style={{ flex: 1, fontSize: '0.82rem' }}
                            />
                            <button className="btn btn-primary btn-icon btn-sm"
                                onClick={() => { if (newClassName.trim()) { addClass({ name: newClassName.trim() }); setNewClassName(''); } }}>
                                <Plus size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Student list */}
                    <div className="card">
                        <div className="card-header">
                            <h3>{classes.find(c => c.id === activeClass)?.name ?? 'Class'} — {filteredStudents.length} students</h3>
                        </div>
                        {filteredStudents.length === 0 ? (
                            <div className="empty-state">
                                <UsersIcon size={32} />
                                <p>No students in this class yet.</p>
                                <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
                                    <Plus size={14} /> Add Student
                                </button>
                            </div>
                        ) : (
                            <table className="data-table">
                                <thead>
                                    <tr><th>Name</th><th>Email</th><th>Grades</th><th>Actions</th></tr>
                                </thead>
                                <tbody>
                                    {filteredStudents.map(s => {
                                        const graded = studentRubrics.filter(sr => sr.studentId === s.id).length;
                                        return (
                                            <tr key={s.id}>
                                                <td style={{ fontWeight: 500 }}>{s.name}</td>
                                                <td className="text-muted text-sm">{s.email || '—'}</td>
                                                <td>
                                                    {graded > 0
                                                        ? <span className="badge badge-green">{graded} rubric{graded !== 1 ? 's' : ''}</span>
                                                        : <span className="badge badge-yellow">Not graded</span>}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        {rubrics.map(r => (
                                                            <button key={r.id} className="btn btn-primary btn-sm"
                                                                onClick={() => navigate(`/rubrics/${r.id}/grade/${s.id}`)}>
                                                                Grade: {r.name.slice(0, 12)}{r.name.length > 12 ? '…' : ''}
                                                            </button>
                                                        ))}
                                                        <button className="btn btn-ghost btn-icon btn-sm"
                                                            onClick={() => { setEditStudent({ id: s.id, name: s.name, email: s.email ?? '' }); setName(s.name); setEmail(s.email ?? ''); setShowAddModal(true); }}>
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--red)' }}
                                                            onClick={() => deleteStudent(s.id)}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {showAddModal && (
                    <div className="modal-overlay" onClick={() => { setShowAddModal(false); setEditStudent(null); }}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>{editStudent ? 'Edit Student' : 'Add Student'}</h3>
                                <button className="btn btn-ghost btn-icon" onClick={() => { setShowAddModal(false); setEditStudent(null); }}>✕</button>
                            </div>
                            <div className="modal-body">
                                <div className="form-group" style={{ marginBottom: 12 }}>
                                    <label>Full Name *</label>
                                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Student name" autoFocus />
                                </div>
                                <div className="form-group">
                                    <label>Email (optional)</label>
                                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="student@school.edu" />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => { setShowAddModal(false); setEditStudent(null); }}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleAddStudent} disabled={!name.trim()}>
                                    {editStudent ? 'Save Changes' : 'Add Student'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
