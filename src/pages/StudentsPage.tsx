import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Edit2, Users as UsersIcon, Upload, Download, TrendingUp, MoreVertical, Search } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import Papa from 'papaparse';
import CsvImportModal from '../components/CsvImportModal';
import { useTranslation, Trans } from 'react-i18next';

export default function StudentsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { students, classes, rubrics, studentRubrics, addStudent, updateStudent, deleteStudent, addClass, updateClass, deleteClass, mergeClasses, settings, updateSettings } = useApp();

    // Initialize active class from settings, falling back to the first available class
    const initialClassId = classes.find(c => c.id === settings.activeClassId)?.id ?? classes[0]?.id ?? '';
    const [activeClass, setActiveClass] = useState(initialClassId);

    // Persist active class selection so back navigation maintains context
    React.useEffect(() => {
        if (activeClass && activeClass !== settings.activeClassId) {
            updateSettings({ activeClassId: activeClass });
        }
    }, [activeClass, settings.activeClassId, updateSettings]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editStudent, setEditStudent] = useState<null | { id: string; name: string; email: string }>(null);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [editStudentClassId, setEditStudentClassId] = useState('');
    const [newClassName, setNewClassName] = useState('');
    const [importFile, setImportFile] = useState<File | null>(null);

    // Context Menu State for Classes
    const [classMenuOpen, setClassMenuOpen] = useState<string | null>(null);

    // Class Management Modal States
    const [renameClassId, setRenameClassId] = useState<string | null>(null);
    const [renameClassVal, setRenameClassVal] = useState('');

    const [mergeClassId, setMergeClassId] = useState<string | null>(null);
    const [mergeTargetId, setMergeTargetId] = useState('');

    const [deleteClassId, setDeleteClassId] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const [studentSearch, setStudentSearch] = useState('');
    const [confirmDeleteStudent, setConfirmDeleteStudent] = useState<string | null>(null);

    const filteredStudents = students
        .filter(s => s.classId === activeClass)
        .filter(s => !studentSearch.trim() || s.name.toLowerCase().includes(studentSearch.toLowerCase()) || (s.email ?? '').toLowerCase().includes(studentSearch.toLowerCase()));

    function handleAddStudent() {
        if (!name.trim()) return;
        if (editStudent) {
            updateStudent({ ...students.find(s => s.id === editStudent.id)!, name, email, classId: editStudentClassId });
        } else {
            addStudent({ name, email, classId: activeClass });
        }
        setName(''); setEmail(''); setShowAddModal(false); setEditStudent(null);
    }

    function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setImportFile(file);
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

    // Helper to close all context menus on outside click
    React.useEffect(() => {
        const handleClick = () => setClassMenuOpen(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    return (
        <>
            <Topbar title={t('studentsPage.title')} actions={
                <>
                    <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                        <Upload size={15} /> {t('studentsPage.import_csv')}
                    </button>
                    <input ref={fileRef} type="file" accept=".csv" onChange={handleCSVImport} style={{ display: 'none' }} />
                    <button className="btn btn-secondary btn-sm" onClick={exportCSV}>
                        <Download size={15} /> {t('studentsPage.export_csv')}
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
                        <Plus size={15} /> {t('studentsPage.add_student')}
                    </button>
                </>
            } />
            <div className="page-content fade-in">
                <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
                    {/* Class list */}
                    <div className="card" style={{ height: 'fit-content' }}>
                        <div className="card-header">
                            <h3>{t('studentsPage.classes')}</h3>
                        </div>
                        {classes.map(c => (
                            <div key={c.id} style={{ position: 'relative' }}>
                                <button className={`nav-item ${c.id === activeClass ? 'active' : ''}`}
                                    onClick={() => setActiveClass(c.id)}>
                                    <UsersIcon size={15} />
                                    <span className="truncate">{c.name}</span>
                                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.7, paddingRight: 24 }}>
                                        {students.filter(s => s.classId === c.id).length}
                                    </span>
                                </button>

                                <button className="btn btn-ghost btn-icon btn-sm"
                                    onClick={(e) => { e.stopPropagation(); setClassMenuOpen(classMenuOpen === c.id ? null : c.id); }}
                                    style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', opacity: classMenuOpen === c.id ? 1 : 0.4 }}
                                >
                                    <MoreVertical size={14} />
                                </button>

                                {classMenuOpen === c.id && (
                                    <div className="card" style={{ position: 'absolute', right: 0, top: '100%', zIndex: 10, padding: 4, minWidth: 140, boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
                                        <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start' }}
                                            onClick={() => { setRenameClassId(c.id); setRenameClassVal(c.name); setClassMenuOpen(null); }}>
                                            {t('studentsPage.action_rename')}
                                        </button>
                                        <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start' }}
                                            onClick={() => { setMergeClassId(c.id); setMergeTargetId(''); setClassMenuOpen(null); }}>
                                            {t('studentsPage.action_merge')}
                                        </button>
                                        <button className="btn btn-ghost btn-sm text-red" style={{ width: '100%', justifyContent: 'flex-start' }}
                                            onClick={() => { setDeleteClassId(c.id); setClassMenuOpen(null); }}>
                                            {t('studentsPage.action_delete')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                        <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                            <input type="text" placeholder={t('studentsPage.new_class_placeholder')} value={newClassName}
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
                            <h3>{classes.find(c => c.id === activeClass)?.name ?? t('studentsPage.default_class_name')} — {filteredStudents.length} {t('studentsPage.students_count')}</h3>
                        </div>
                        {/* Student search */}
                        <div style={{ position: 'relative', marginBottom: 14 }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }} />
                            <input
                                type="text"
                                placeholder={t('studentsPage.search_students')}
                                value={studentSearch}
                                onChange={e => setStudentSearch(e.target.value)}
                                style={{ paddingLeft: 32, width: '100%' }}
                            />
                        </div>
                        {filteredStudents.length === 0 ? (
                            <div className="empty-state">
                                <UsersIcon size={32} />
                                <p>{studentSearch ? t('studentsPage.no_students_match') : t('studentsPage.no_students')}</p>
                                {!studentSearch && <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
                                    <Plus size={14} /> {t('studentsPage.add_student')}
                                </button>}
                            </div>
                        ) : (
                            <table className="data-table">
                                <thead>
                                    <tr><th>{t('studentsPage.table_name')}</th><th>{t('studentsPage.table_email')}</th><th>{t('studentsPage.table_grades')}</th><th>{t('studentsPage.table_actions')}</th></tr>
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
                                                        ? <span className="badge badge-green">{graded} {graded !== 1 ? t('studentsPage.rubric_plural') : t('studentsPage.rubric_single')}</span>
                                                        : <span className="badge badge-yellow">{t('studentsPage.not_graded')}</span>}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        {rubrics.map(r => (
                                                            <button key={r.id} className="btn btn-primary btn-sm"
                                                                onClick={() => navigate(`/rubrics/${r.id}/grade/${s.id}`)}>
                                                                {t('studentsPage.grade_prefix')} {r.name.slice(0, 12)}{r.name.length > 12 ? '…' : ''}
                                                            </button>
                                                        ))}
                                                        <button className="btn btn-secondary btn-icon btn-sm"
                                                            onClick={() => navigate(`/students/${s.id}`)} title={t('studentsPage.view_profile')}>
                                                            <TrendingUp size={14} />
                                                        </button>
                                                        <button className="btn btn-ghost btn-icon btn-sm"
                                                            onClick={() => { setEditStudent({ id: s.id, name: s.name, email: s.email ?? '' }); setName(s.name); setEmail(s.email ?? ''); setEditStudentClassId(s.classId); setShowAddModal(true); }}>
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--red)' }}
                                                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteStudent(s.id); }}>
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
                                <h3>{editStudent ? t('studentsPage.edit_student_title') : t('studentsPage.add_student_title')}</h3>
                                <button className="btn btn-ghost btn-icon" onClick={() => { setShowAddModal(false); setEditStudent(null); }}>✕</button>
                            </div>
                            <div className="modal-body">
                                <div className="form-group" style={{ marginBottom: 12 }}>
                                    <label>{t('studentsPage.form_full_name')}</label>
                                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('studentsPage.form_name_placeholder')} autoFocus />
                                </div>
                                <div className="form-group" style={{ marginBottom: 12 }}>
                                    <label>{t('studentsPage.form_email')}</label>
                                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('studentsPage.form_email_placeholder')} />
                                </div>
                                {editStudent && (
                                    <div className="form-group">
                                        <label>{t('studentsPage.form_class')}</label>
                                        <select value={editStudentClassId} onChange={e => setEditStudentClassId(e.target.value)}>
                                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => { setShowAddModal(false); setEditStudent(null); }}>{t('common.cancel')}</button>
                                <button className="btn btn-primary" onClick={handleAddStudent} disabled={!name.trim()}>
                                    {editStudent ? t('studentsPage.action_save_changes') : t('studentsPage.add_student')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {importFile && (
                    <CsvImportModal
                        file={importFile}
                        onClose={() => setImportFile(null)}
                        onSuccess={() => setImportFile(null)}
                    />
                )}

                {/* Class Management Modals */}
                {renameClassId && (
                    <div className="modal-overlay" onClick={() => setRenameClassId(null)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>{t('studentsPage.rename_class_title')}</h3>
                                <button className="btn btn-ghost btn-icon" onClick={() => setRenameClassId(null)}>✕</button>
                            </div>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>{t('studentsPage.form_new_name')}</label>
                                    <input type="text" value={renameClassVal} onChange={e => setRenameClassVal(e.target.value)} autoFocus
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && renameClassVal.trim()) {
                                                const c = classes.find(cl => cl.id === renameClassId);
                                                if (c) updateClass({ ...c, name: renameClassVal.trim() });
                                                setRenameClassId(null);
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setRenameClassId(null)}>{t('common.cancel')}</button>
                                <button className="btn btn-primary" disabled={!renameClassVal.trim()} onClick={() => {
                                    const c = classes.find(cl => cl.id === renameClassId);
                                    if (c) updateClass({ ...c, name: renameClassVal.trim() });
                                    setRenameClassId(null);
                                }}>{t('studentsPage.form_new_name') !== t('studentsPage.form_new_name') /* use generic instead */ ? t('common.save') : t('common.save')}</button>
                            </div>
                        </div>
                    </div>
                )}

                {mergeClassId && (
                    <div className="modal-overlay" onClick={() => setMergeClassId(null)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>{t('studentsPage.merge_class_title')}</h3>
                                <button className="btn btn-ghost btn-icon" onClick={() => setMergeClassId(null)}>✕</button>
                            </div>
                            <div className="modal-body">
                                <p style={{ marginBottom: 16 }}>
                                    <Trans i18nKey="studentsPage.merge_class_description" values={{ className: classes.find(c => c.id === mergeClassId)?.name }} >
                                        Select the target class to move all students into. The current class (<strong>{'{{className}}'}</strong>) will be deleted.
                                    </Trans>
                                </p>
                                <div className="form-group">
                                    <label>{t('studentsPage.form_target_class')}</label>
                                    <select value={mergeTargetId} onChange={e => setMergeTargetId(e.target.value)}>
                                        <option value="" disabled>{t('studentsPage.select_class_placeholder')}</option>
                                        {classes.filter(c => c.id !== mergeClassId).map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setMergeClassId(null)}>{t('common.cancel')}</button>
                                <button className="btn btn-primary" disabled={!mergeTargetId} onClick={() => {
                                    if (mergeTargetId) {
                                        mergeClasses(mergeClassId!, mergeTargetId);
                                        if (activeClass === mergeClassId) setActiveClass(mergeTargetId);
                                        setMergeClassId(null);
                                    }
                                }}>{t('studentsPage.action_merge_classes')}</button>
                            </div>
                        </div>
                    </div>
                )}

                {deleteClassId && (
                    <div className="modal-overlay" onClick={() => setDeleteClassId(null)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>{t('studentsPage.delete_class_title')}</h3>
                                <button className="btn btn-ghost btn-icon" onClick={() => setDeleteClassId(null)}>✕</button>
                            </div>
                            <div className="modal-body">
                                <p>
                                    <Trans i18nKey="studentsPage.delete_class_confirmation" values={{ className: classes.find(c => c.id === deleteClassId)?.name }}>
                                        Are you sure you want to delete <strong>{'{{className}}'}</strong>?
                                    </Trans>
                                </p>

                                <div style={{ background: 'var(--red-soft)', color: 'var(--red)', padding: '12px 16px', borderRadius: 8, marginTop: 16, fontSize: '0.9rem' }}>
                                    <strong>{t('studentsPage.warning_label')}</strong> {t('studentsPage.delete_class_warning', { count: students.filter(s => s.classId === deleteClassId).length })}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setDeleteClassId(null)}>{t('common.cancel')}</button>
                                <button className="btn btn-primary" style={{ background: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => {
                                    deleteClass(deleteClassId!, true);
                                    if (activeClass === deleteClassId) setActiveClass(classes.find(c => c.id !== deleteClassId)?.id ?? '');
                                    setDeleteClassId(null);
                                }}>{t('common.delete')}</button>
                            </div>
                        </div>
                    </div>
                )}

                {confirmDeleteStudent && (
                    <div className="modal-overlay" onClick={() => setConfirmDeleteStudent(null)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>{t('studentsPage.delete_student_title') || 'Delete Student'}</h3>
                                <button className="btn btn-ghost btn-icon" onClick={() => setConfirmDeleteStudent(null)}>✕</button>
                            </div>
                            <div className="modal-body">
                                <p>
                                    <Trans i18nKey="studentsPage.delete_student_confirmation" values={{ studentName: students.find(s => s.id === confirmDeleteStudent)?.name }}>
                                        Are you sure you want to delete <strong>{'{{studentName}}'}</strong>?
                                    </Trans>
                                </p>
                                <div style={{ background: 'var(--red-soft)', color: 'var(--red)', padding: '12px 16px', borderRadius: 8, marginTop: 16, fontSize: '0.9rem' }}>
                                    <strong>{t('studentsPage.warning_label') || 'Warning:'}</strong> {t('studentsPage.delete_student_warning') || 'This will permanently delete all grades and rubrics associated with this student.'}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setConfirmDeleteStudent(null)}>{t('common.cancel')}</button>
                                <button className="btn btn-primary" style={{ background: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => {
                                    deleteStudent(confirmDeleteStudent);
                                    setConfirmDeleteStudent(null);
                                }}>{t('common.delete')}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
