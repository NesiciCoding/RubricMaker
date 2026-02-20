import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Plus, Trash2, Download, Upload, Key, ExternalLink, AlertCircle, MessageSquare, Globe } from 'lucide-react';
import CommentBankModal from '../components/Comments/CommentBankModal';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import type { GradeScale, GradeRange } from '../types';
import { exportFullBackup, importFullBackup } from '../store/storage';

export default function SettingsPage() {
    const { t, i18n } = useTranslation();
    const {
        settings, updateSettings, gradeScales, addGradeScale, updateGradeScale, deleteGradeScale, commentBank
    } = useApp();
    const [editingScaleId, setEditingScaleId] = useState<string | null>(null);
    const [showCommentBank, setShowCommentBank] = useState(false);

    useEffect(() => {
        if (settings.language && i18n.language !== settings.language) {
            i18n.changeLanguage(settings.language);
        }
    }, [settings.language, i18n]);

    function handleBackupExport() {
        const json = exportFullBackup();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'rubric-maker-backup.json'; a.click();
    }

    function handleBackupImport(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try { importFullBackup(reader.result as string); window.location.reload(); }
            catch { alert('Invalid backup file.'); }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    function updateRange(scaleId: string, idx: number, patch: Partial<GradeRange>) {
        const scale = gradeScales.find(g => g.id === scaleId);
        if (!scale) return;
        const ranges = scale.ranges.map((r, i) => i === idx ? { ...r, ...patch } : r);
        updateGradeScale({ ...scale, ranges });
    }

    function addRange(scaleId: string) {
        const scale = gradeScales.find(g => g.id === scaleId);
        if (!scale) return;
        updateGradeScale({ ...scale, ranges: [...scale.ranges, { min: 0, max: 0, label: 'New', color: '#6b7280' }] });
    }

    function removeRange(scaleId: string, idx: number) {
        const scale = gradeScales.find(g => g.id === scaleId);
        if (!scale) return;
        updateGradeScale({ ...scale, ranges: scale.ranges.filter((_, i) => i !== idx) });
    }

    return (
        <>
            <Topbar title={t('settings.title')} />
            <div className="page-content fade-in" style={{ maxWidth: 900 }}>

                {/* General settings */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <h3 style={{ marginBottom: 16 }}>General</h3>
                    <div className="grid-2" style={{ gap: 16 }}>
                        <div className="form-group">
                            <label>Default Grade Scale</label>
                            <select value={settings.defaultGradeScaleId}
                                onChange={e => updateSettings({ defaultGradeScaleId: e.target.value })}>
                                {gradeScales.map(gs => <option key={gs.id} value={gs.id}>{gs.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>{t('settings.theme')}</label>
                            <select value={settings.theme}
                                onChange={e => updateSettings({ theme: e.target.value as 'light' | 'dark' })}>
                                <option value="dark">Dark</option>
                                <option value="light">Light</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Localization settings */}
                <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid var(--accent)' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                        <Globe size={20} style={{ color: 'var(--accent)' }} />
                        <h3 style={{ margin: 0 }}>Localization</h3>
                    </div>
                    <div className="form-group">
                        <label>{t('settings.language_selection')}</label>
                        <select value={settings.language}
                            onChange={e => updateSettings({ language: e.target.value })}>
                            <option value="en">English</option>
                            {/* Future languages can be added here */}
                        </select>
                    </div>
                    <p className="text-muted text-sm" style={{ marginTop: 12 }}>
                        Choose your preferred language for the interface.
                    </p>
                </div>

                {/* Standards Integration */}
                <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid var(--accent)' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                        <Key size={20} style={{ color: 'var(--accent)' }} />
                        <h3 style={{ margin: 0 }}>Standards Integration</h3>
                    </div>
                    <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
                        To link standards (CCSS, NGSS, etc.) from the <strong>Common Standards Project</strong>, you need a free API key.
                    </p>

                    <div className="form-group">
                        <label>CSP API Key</label>
                        <input type="password"
                            value={settings.standardsApiKey ?? ''}
                            onChange={e => updateSettings({ standardsApiKey: e.target.value })}
                            placeholder="Paste your API key here..."
                            autoComplete="off"
                        />
                    </div>

                    <div style={{ marginTop: 16, background: 'var(--bg-elevated)', padding: 12, borderRadius: 8, fontSize: '0.85rem' }}>
                        <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <AlertCircle size={14} /> Setup Instructions
                        </div>
                        <ol style={{ paddingLeft: 20, margin: 0, lineHeight: 1.6 }}>
                            <li>Register at <a href="https://commonstandardsproject.com/developers" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>commonstandardsproject.com/developers <ExternalLink size={10} /></a></li>
                            <li>Copy your API Key and paste it above.</li>
                            <li><strong>Important:</strong> Add this app's URL (<code>{window.location.origin}</code>) to the <strong>Allowed Origins</strong> list on their dashboard, or requests will be blocked by CORS.</li>
                        </ol>
                    </div>
                </div>

                {/* Comment Bank */}
                <div className="card" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h3 style={{ margin: 0 }}>Comment Bank</h3>
                        <p className="text-muted text-sm" style={{ marginTop: 4 }}>
                            {commentBank.length} saved comments. Manage your reusable feedback snippets.
                        </p>
                    </div>
                    <button className="btn btn-secondary" onClick={() => setShowCommentBank(true)}>
                        <MessageSquare size={16} /> Manage Comments
                    </button>
                </div>

                {/* Grade Scales */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="card-header">
                        <h3>Grade Scales</h3>
                        <button className="btn btn-primary btn-sm"
                            onClick={() => {
                                const gs = addGradeScale({
                                    name: 'New Scale', type: 'custom',
                                    ranges: [{ min: 0, max: 100, label: 'Pass', color: '#22c55e' }]
                                });
                                setEditingScaleId(gs.id);
                            }}>
                            <Plus size={15} /> New Scale
                        </button>
                    </div>

                    {gradeScales.map(gs => (
                        <div key={gs.id} style={{ marginBottom: 12, background: 'var(--bg-elevated)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
                                <input type="text" value={gs.name}
                                    onChange={e => updateGradeScale({ ...gs, name: e.target.value })}
                                    style={{ flex: 1, fontWeight: 600, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '0.9rem', outline: 'none' }} />
                                <div style={{ display: 'flex', gap: 4 }}>
                                    {gs.ranges.map((r, i) => (
                                        <div key={i} title={`${r.label}: ${r.min}–${r.max}%`}
                                            style={{ width: 14, height: 14, borderRadius: 3, background: r.color }} />
                                    ))}
                                </div>
                                <button className="btn btn-ghost btn-sm"
                                    onClick={() => setEditingScaleId(editingScaleId === gs.id ? null : gs.id)}>
                                    {editingScaleId === gs.id ? 'Collapse' : 'Edit'}
                                </button>
                                <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--red)' }}
                                    onClick={() => { if (gs.id !== settings.defaultGradeScaleId) deleteGradeScale(gs.id); else alert("Can't delete the default scale."); }}>
                                    <Trash2 size={14} />
                                </button>
                            </div>

                            {editingScaleId === gs.id && (
                                <div style={{ padding: '0 16px 16px' }}>
                                    <table className="data-table" style={{ marginBottom: 10 }}>
                                        <thead>
                                            <tr><th>Label</th><th>Min %</th><th>Max %</th><th>Color</th><th></th></tr>
                                        </thead>
                                        <tbody>
                                            {gs.ranges.map((r, idx) => (
                                                <tr key={idx}>
                                                    <td><input type="text" value={r.label} onChange={e => updateRange(gs.id, idx, { label: e.target.value })} style={{ width: 80 }} /></td>
                                                    <td><input type="number" value={r.min} min={0} max={100} onChange={e => updateRange(gs.id, idx, { min: Number(e.target.value) })} style={{ width: 60 }} /></td>
                                                    <td><input type="number" value={r.max} min={0} max={100} onChange={e => updateRange(gs.id, idx, { max: Number(e.target.value) })} style={{ width: 60 }} /></td>
                                                    <td>
                                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                            <input type="color" value={r.color} onChange={e => updateRange(gs.id, idx, { color: e.target.value })}
                                                                style={{ width: 36, height: 32, padding: 2, border: '1px solid var(--border)', borderRadius: 5 }} />
                                                            <input type="text" value={r.color} onChange={e => updateRange(gs.id, idx, { color: e.target.value })} style={{ width: 80 }} />
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--red)' }}
                                                            onClick={() => removeRange(gs.id, idx)}>
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <button className="btn btn-secondary btn-sm" onClick={() => addRange(gs.id)}>
                                        <Plus size={14} /> Add Range
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Backup */}
                <div className="card">
                    <h3 style={{ marginBottom: 16 }}>Data Backup & Restore</h3>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button className="btn btn-secondary" onClick={handleBackupExport}>
                            <Download size={16} /> Export Backup (JSON)
                        </button>
                        <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                            <Upload size={16} /> Import Backup
                            <input type="file" accept=".json" onChange={handleBackupImport} style={{ display: 'none' }} />
                        </label>
                    </div>
                    <p className="text-muted text-sm" style={{ marginTop: 12 }}>
                        Export saves all rubrics, students, grades, and settings to a JSON file. Import restores everything.
                    </p>
                </div>
            </div>

            {showCommentBank && <CommentBankModal onClose={() => setShowCommentBank(false)} />}
        </>
    );
}
