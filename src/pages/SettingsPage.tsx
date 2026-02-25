import React, { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Save, Plus, Trash2, Download, Upload, Key, ExternalLink, AlertCircle, MessageSquare, Globe, Layout, Star } from 'lucide-react';
import CommentBankModal from '../components/Comments/CommentBankModal';
import TemplateUploadModal from '../components/TemplateUploadModal';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import type { GradeScale, GradeRange } from '../types';
import { exportFullBackup, importFullBackup } from '../store/storage';

export default function SettingsPage() {
    const { t, i18n } = useTranslation();
    const {
        settings, updateSettings, gradeScales, addGradeScale, updateGradeScale, deleteGradeScale, commentBank,
        exportTemplates, addExportTemplate, deleteExportTemplate,
    } = useApp();
    const [editingScaleId, setEditingScaleId] = useState<string | null>(null);
    const [showCommentBank, setShowCommentBank] = useState(false);
    const [showTemplateUpload, setShowTemplateUpload] = useState(false);

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
            catch { alert(t('settings.alert_invalid_backup')); }
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
                    <h3 style={{ marginBottom: 16 }}>{t('settings.general')}</h3>
                    <div className="grid-2" style={{ gap: 16 }}>
                        <div className="form-group">
                            <label>{t('settings.default_grade_scale')}</label>
                            <select value={settings.defaultGradeScaleId}
                                onChange={e => updateSettings({ defaultGradeScaleId: e.target.value })}>
                                {gradeScales.map(gs => <option key={gs.id} value={gs.id}>{gs.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>{t('settings.theme')}</label>
                            <select value={settings.theme}
                                onChange={e => updateSettings({ theme: e.target.value as 'light' | 'dark' })}>
                                <option value="dark">{t('settings.theme_dark')}</option>
                                <option value="light">{t('settings.theme_light')}</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Localization settings */}
                <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid var(--accent)' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                        <Globe size={20} style={{ color: 'var(--accent)' }} />
                        <h3 style={{ margin: 0 }}>{t('navigation.localization') || 'Localization'}</h3>
                    </div>
                    <div className="form-group">
                        <label>{t('settings.language_selection')}</label>
                        <select value={settings.language}
                            onChange={e => updateSettings({ language: e.target.value })}>
                            <option value="en">{t('settings.language_en')}</option>
                            <option value="nl">{t('settings.language_nl')}</option>
                        </select>
                    </div>
                    <p className="text-muted text-sm" style={{ marginTop: 12 }}>
                        {t('settings.language_help')}
                    </p>
                </div>

                {/* Standards Integration */}
                <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid var(--accent)' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                        <Key size={20} style={{ color: 'var(--accent)' }} />
                        <h3 style={{ margin: 0 }}>{t('settings.standards_integration')}</h3>
                    </div>
                    <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
                        <Trans i18nKey="settings.standards_help_1">
                            To link standards (CCSS, NGSS, etc.) from the <strong>Common Standards Project</strong>, you need a free API key.
                        </Trans>
                    </p>

                    <div className="form-group">
                        <label>{t('settings.standards_api_key')}</label>
                        <input type="password"
                            value={settings.standardsApiKey ?? ''}
                            onChange={e => updateSettings({ standardsApiKey: e.target.value })}
                            placeholder={t('settings.standards_api_placeholder')}
                            autoComplete="off"
                        />
                    </div>

                    <div style={{ marginTop: 16, background: 'var(--bg-elevated)', padding: 12, borderRadius: 8, fontSize: '0.85rem' }}>
                        <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <AlertCircle size={14} /> {t('settings.standards_setup_instructions')}
                        </div>
                        <ol style={{ paddingLeft: 20, margin: 0, lineHeight: 1.6 }}>
                            <li>{t('settings.standards_setup_1')} <a href="https://commonstandardsproject.com/developers" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>commonstandardsproject.com/developers <ExternalLink size={10} /></a></li>
                            <li>{t('settings.standards_setup_2')}</li>
                            <li><Trans i18nKey="settings.standards_setup_3" values={{ origin: window.location.origin }}>
                                <strong>Important:</strong> Add this app's URL (<code>{window.location.origin}</code>) to the <strong>Allowed Origins</strong> list on their dashboard, or requests will be blocked by CORS.
                            </Trans></li>
                        </ol>
                    </div>
                </div>

                {/* Comment Bank */}
                <div className="card" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h3 style={{ margin: 0 }}>{t('settings.comment_bank')}</h3>
                        <p className="text-muted text-sm" style={{ marginTop: 4 }}>
                            {t('settings.comment_bank_help').replace('{{count}}', String(commentBank.length))}
                        </p>
                    </div>
                    <button className="btn btn-secondary" onClick={() => setShowCommentBank(true)}>
                        <MessageSquare size={16} /> {t('settings.action_manage_comments')}
                    </button>
                </div>

                {/* Grade Scales */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="card-header">
                        <h3>{t('settings.grade_scales')}</h3>
                        <button className="btn btn-primary btn-sm"
                            onClick={() => {
                                const gs = addGradeScale({
                                    name: t('settings.scale_new_name'), type: 'custom',
                                    ranges: [{ min: 0, max: 100, label: 'Pass', color: '#22c55e' }]
                                });
                                setEditingScaleId(gs.id);
                            }}>
                            <Plus size={15} /> {t('settings.action_new_scale')}
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
                                    {editingScaleId === gs.id ? t('settings.action_collapse') : t('settings.action_edit')}
                                </button>
                                <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--red)' }}
                                    onClick={() => { if (gs.id !== settings.defaultGradeScaleId) deleteGradeScale(gs.id); else alert(t('settings.alert_cannot_delete_default')); }}>
                                    <Trash2 size={14} />
                                </button>
                            </div>

                            {editingScaleId === gs.id && (
                                <div style={{ padding: '0 16px 16px' }}>
                                    <table className="data-table" style={{ marginBottom: 10 }}>
                                        <thead>
                                            <tr><th>{t('settings.label_label')}</th><th>{t('settings.label_min_pct')}</th><th>{t('settings.label_max_pct')}</th><th>{t('settings.label_color')}</th><th></th></tr>
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
                                        <Plus size={14} /> {t('settings.action_add_range')}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Export Templates */}
                <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid var(--accent)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <Layout size={20} style={{ color: 'var(--accent)' }} />
                            <div>
                                <h3 style={{ margin: 0 }}>{t('settings.export_templates')}</h3>
                                <p className="text-muted text-xs" style={{ marginTop: 2 }}>{t('settings.export_templates_help')}</p>
                            </div>
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowTemplateUpload(true)}>
                            <Upload size={14} /> {t('settings.action_upload_template')}
                        </button>
                    </div>

                    {exportTemplates.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            <Trans i18nKey="settings.empty_state_templates">No templates uploaded yet. Click <strong>Upload Template</strong> to add one.</Trans>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {exportTemplates.map(tmpl => (
                                <div key={tmpl.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-elevated)', borderRadius: 10, padding: '12px 16px', border: settings.exportTemplateId === tmpl.id ? '1.5px solid var(--accent)' : '1px solid var(--border)' }}>
                                    {/* Colour swatch */}
                                    <div style={{ width: 32, height: 32, borderRadius: 8, background: tmpl.headerColor ?? '#1e3a5f', flexShrink: 0 }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{tmpl.name}</div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                            {tmpl.levelHeaders.length > 0
                                                ? tmpl.levelHeaders.join(' · ')
                                                : t('settings.no_level_headers')}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button
                                            className={`btn btn-sm ${settings.exportTemplateId === tmpl.id ? 'btn-primary' : 'btn-ghost'}`}
                                            title={settings.exportTemplateId === tmpl.id ? t('settings.label_default') : t('settings.action_set_default')}
                                            onClick={() => updateSettings({ exportTemplateId: settings.exportTemplateId === tmpl.id ? undefined : tmpl.id })}
                                        >
                                            <Star size={13} />
                                            {settings.exportTemplateId === tmpl.id ? t('settings.label_default') : t('settings.action_set_default')}
                                        </button>
                                        <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--red)' }}
                                            onClick={() => { deleteExportTemplate(tmpl.id); if (settings.exportTemplateId === tmpl.id) updateSettings({ exportTemplateId: undefined }); }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Backup */}
                <div className="card">
                    <h3 style={{ marginBottom: 16 }}>{t('settings.backup_restore')}</h3>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button className="btn btn-secondary" onClick={handleBackupExport}>
                            <Download size={16} /> {t('settings.action_export_backup')}
                        </button>
                        <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                            <Upload size={16} /> {t('settings.action_import_backup')}
                            <input type="file" accept=".json" onChange={handleBackupImport} style={{ display: 'none' }} />
                        </label>
                    </div>
                    <p className="text-muted text-sm" style={{ marginTop: 12 }}>
                        {t('settings.backup_help')}
                    </p>
                </div>
            </div>

            {showCommentBank && <CommentBankModal onClose={() => setShowCommentBank(false)} />}
            {showTemplateUpload && (
                <TemplateUploadModal
                    onClose={() => setShowTemplateUpload(false)}
                    onSave={tmpl => { addExportTemplate(tmpl); setShowTemplateUpload(false); }}
                />
            )}
        </>
    );
}
