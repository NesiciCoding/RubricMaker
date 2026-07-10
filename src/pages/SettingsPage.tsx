import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import {
    Save,
    Plus,
    Trash2,
    Download,
    Upload,
    AlertCircle,
    MessageSquare,
    Globe,
    Layout,
    Star,
    PlayCircle,
    Shield,
    Lock,
    User,
    GraduationCap,
    BookOpen,
    Settings,
    Eye,
    EyeOff,
    Sparkles,
} from 'lucide-react';
import CommentBankModal from '../components/Comments/CommentBankModal';
import TemplateUploadModal from '../components/Rubric/TemplateUploadModal';
import StandardMasteryTargetModal from '../components/Standards/StandardMasteryTargetModal';
import Modal from '../components/ui/Modal';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import { useDbStatus } from '../hooks/useDbStatus';
import type { GradeScale, GradeRange, UserRole, StandardMasteryTarget } from '../types';
import { exportFullBackup } from '../store/storage';
import { seedDemoData } from '../utils/seedDemoData';
import { hashPin, verifyPin, isHashed } from '../utils/pinHash';
import { THEME_BUNDLES, ACCENT_PRESETS } from '../data/themes';
import { SCHOOL_YEAR_LABELS } from '../data/schoolYears';
import { VO_TRACK_LABELS } from '../data/voTracks';

type Tab = 'general' | 'teaching' | 'administration';

// ─── Role helpers ──────────────────────────────────────────────────────────────

const VALID_ROLES = new Set<string>(['admin', 'teacher', 'student']);

function normalizeStoredRole(raw: string | undefined): UserRole {
    if (raw === 'user') return 'teacher';
    if (raw && VALID_ROLES.has(raw)) return raw as UserRole;
    return 'admin';
}

const ROLE_META: Record<
    UserRole,
    { labelKey: string; icon: React.ReactNode; badgeClass: string; descriptionKey: string }
> = {
    admin: {
        labelKey: 'settings.role_admin_label',
        icon: <Shield size={13} />,
        badgeClass: 'role-badge-admin',
        descriptionKey: 'settings.role_admin_description',
    },
    teacher: {
        labelKey: 'settings.role_teacher_label',
        icon: <User size={13} />,
        badgeClass: 'role-badge-teacher',
        descriptionKey: 'settings.role_teacher_description',
    },
    student: {
        labelKey: 'settings.role_student_label',
        icon: <GraduationCap size={13} />,
        badgeClass: 'role-badge-student',
        descriptionKey: 'settings.role_student_description',
    },
};

/**
 * Render the settings page with tabs for General, Teaching, and Administration, including role-based access,
 * admin PIN gating, grade scale and template management, localization, database connection and sync controls,
 * rubric/class sharing, user role management, and backup export/import.
 *
 * @returns The settings page UI as a JSX element
 */
export default function SettingsPage() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const {
        settings,
        updateSettings,
        gradeScales,
        addGradeScale,
        updateGradeScale,
        deleteGradeScale,
        commentBank,
        exportTemplates,
        addExportTemplate,
        deleteExportTemplate,
        rubrics,
        students,
        classes,
        studentRubrics,
        importBackup,
        standardMasteryTargets,
        deleteStandardMasteryTarget,
    } = useApp();
    const { showToast } = useToast();
    const dbStatus = useDbStatus();

    // ─── Role state ─────────────────────────────────────────────────────────────
    const role = normalizeStoredRole(settings.userRole);
    const isAdmin = role === 'admin';
    const isUserPlus = role === 'admin' || role === 'teacher'; // teaching features

    const [activeTab, setActiveTab] = useState<Tab>('general');

    // Downgrade active tab when role changes to one that can't see it
    useEffect(() => {
        if (!isUserPlus && activeTab !== 'general') setActiveTab('general');
    }, [isUserPlus, activeTab]);

    // Backup import preview — holds parsed JSON + summary until user confirms
    interface BackupSummary {
        rubrics: number;
        students: number;
        classes: number;
        studentRubrics: number;
    }
    const [backupPreview, setBackupPreview] = useState<{ json: string; summary: BackupSummary } | null>(null);

    // Role switch dialog (password-protected admin access)
    const [showPinDialog, setShowPinDialog] = useState(false);
    const [pendingRole, setPendingRole] = useState<UserRole | null>(null);
    const [pinInput, setPinInput] = useState('');
    const [pinError, setPinError] = useState(false);
    const [showPin, setShowPin] = useState(false);

    // Admin password management (in Administration tab)
    type PinSetupMode = 'idle' | 'setting' | 'changing' | 'removing';
    const [pinSetupMode, setPinSetupMode] = useState<PinSetupMode>('idle');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [currentPinVerify, setCurrentPinVerify] = useState('');
    const [pinSetupError, setPinSetupError] = useState('');
    const [showNewPin, setShowNewPin] = useState(false);

    // ─── Existing state ──────────────────────────────────────────────────────────
    const [editingScaleId, setEditingScaleId] = useState<string | null>(null);
    const [deleteScaleId, setDeleteScaleId] = useState<string | null>(null);
    const [deleteMasteryTargetId, setDeleteMasteryTargetId] = useState<string | null>(null);
    const [showCommentBank, setShowCommentBank] = useState(false);
    const [showTemplateUpload, setShowTemplateUpload] = useState(false);
    const [editingMasteryTarget, setEditingMasteryTarget] = useState<StandardMasteryTarget | 'new' | null>(null);
    const [accentInput, setAccentInput] = useState(settings.accentColor || '#37b49c');
    const [accentError, setAccentError] = useState(false);

    useEffect(() => {
        if (settings.language && i18n.language !== settings.language) {
            i18n.changeLanguage(settings.language);
        }
    }, [settings.language, i18n]);

    // ─── Role switch helpers ─────────────────────────────────────────────────────

    function requestRoleSwitch(newRole: UserRole) {
        if (newRole === role) return;
        if (newRole === 'admin' && settings.adminPin) {
            setPendingRole(newRole);
            setPinInput('');
            setPinError(false);
            setShowPinDialog(true);
        } else {
            applyRoleSwitch(newRole);
        }
    }

    function applyRoleSwitch(newRole: UserRole) {
        updateSettings({ userRole: newRole });
        showToast(t('settings.role_changed_to', { role: t(ROLE_META[newRole].labelKey) }), 'success');
    }

    async function confirmPinAndSwitch(targetRole: UserRole | null = pendingRole) {
        const stored = settings.adminPin;
        if (!stored || !targetRole) return;
        const ok = await verifyPin(pinInput, stored);
        if (ok) {
            // Upgrade legacy plaintext PIN to hashed on first successful use
            if (!isHashed(stored)) updateSettings({ adminPin: await hashPin(pinInput) });
            setShowPinDialog(false);
            applyRoleSwitch(targetRole);
            setPendingRole(null);
        } else {
            setPinError(true);
        }
    }

    // ─── Admin password helpers ──────────────────────────────────────────────────

    async function handleSaveNewPin() {
        if (!newPin) {
            setPinSetupError('Password cannot be empty.');
            return;
        }
        if (newPin !== confirmPin) {
            setPinSetupError('Passwords do not match.');
            return;
        }
        if (pinSetupMode === 'changing') {
            const ok = await verifyPin(currentPinVerify, settings.adminPin ?? '');
            if (!ok) {
                setPinSetupError('Current password is incorrect.');
                return;
            }
        }
        updateSettings({ adminPin: await hashPin(newPin) });
        showToast('Admin password saved', 'success');
        resetPinSetup();
    }

    async function handleRemovePin() {
        const ok = await verifyPin(currentPinVerify, settings.adminPin ?? '');
        if (!ok) {
            setPinSetupError('Current password is incorrect.');
            return;
        }
        updateSettings({ adminPin: undefined });
        showToast('Admin password removed', 'info');
        resetPinSetup();
    }

    function resetPinSetup() {
        setPinSetupMode('idle');
        setNewPin('');
        setConfirmPin('');
        setCurrentPinVerify('');
        setPinSetupError('');
    }

    // ─── Other handlers ──────────────────────────────────────────────────────────

    function handleLoadSampleData() {
        seedDemoData();
        window.location.reload();
    }

    function handleBackupExport() {
        const json = exportFullBackup();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'rubric-maker-backup.json';
        a.click();
    }

    function handleBackupImport(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const json = reader.result as string;
            try {
                const data = JSON.parse(json) as Record<string, unknown>;
                if (!data || typeof data !== 'object' || Array.isArray(data)) {
                    showToast(t('toast.import_error'), 'error');
                    return;
                }
                setBackupPreview({
                    json,
                    summary: {
                        rubrics: data.rubrics !== undefined && Array.isArray(data.rubrics) ? data.rubrics.length : 0,
                        students:
                            data.students !== undefined && Array.isArray(data.students) ? data.students.length : 0,
                        classes: data.classes !== undefined && Array.isArray(data.classes) ? data.classes.length : 0,
                        studentRubrics:
                            data.studentRubrics !== undefined && Array.isArray(data.studentRubrics)
                                ? data.studentRubrics.length
                                : 0,
                    },
                });
            } catch {
                showToast(t('toast.import_error'), 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    async function confirmImportBackup() {
        if (!backupPreview) return;
        try {
            const ok = await importBackup(backupPreview.json);
            if (ok) {
                showToast(t('toast.import_success'), 'success');
                setBackupPreview(null);
            } else {
                showToast(t('toast.import_error'), 'error');
                setBackupPreview(null);
            }
        } catch {
            showToast(t('toast.import_error'), 'error');
            setBackupPreview(null);
        }
    }

    function handleAccentChange(val: string) {
        setAccentInput(val);
        const valid = /^#[0-9A-Fa-f]{6}$/.test(val);
        setAccentError(!valid);
        if (valid) updateSettings({ accentColor: val, colorPreset: undefined });
    }

    function confirmDeleteScale() {
        if (!deleteScaleId) return;
        deleteGradeScale(deleteScaleId);
        setDeleteScaleId(null);
        if (editingScaleId === deleteScaleId) setEditingScaleId(null);
    }

    function confirmDeleteMasteryTarget() {
        if (!deleteMasteryTargetId) return;
        deleteStandardMasteryTarget(deleteMasteryTargetId);
        setDeleteMasteryTargetId(null);
    }

    function updateRange(scaleId: string, idx: number, patch: Partial<GradeRange>) {
        const scale = gradeScales.find((g) => g.id === scaleId);
        if (!scale) return;
        updateGradeScale({ ...scale, ranges: scale.ranges.map((r, i) => (i === idx ? { ...r, ...patch } : r)) });
    }

    function addRange(scaleId: string) {
        const scale = gradeScales.find((g) => g.id === scaleId);
        if (!scale) return;
        updateGradeScale({ ...scale, ranges: [...scale.ranges, { min: 0, max: 0, label: 'New', color: '#6b7280' }] });
    }

    function removeRange(scaleId: string, idx: number) {
        const scale = gradeScales.find((g) => g.id === scaleId);
        if (!scale) return;
        updateGradeScale({ ...scale, ranges: scale.ranges.filter((_, i) => i !== idx) });
    }

    function getScaleName(gs: GradeScale): string {
        const key = `settings.scale_name_${gs.id.replace(/-/g, '_')}`;
        const translated = t(key);
        return translated !== key ? translated : gs.name;
    }

    // ─── Tab navigation helper ───────────────────────────────────────────────────

    function handleTabClick(tab: Tab) {
        if (tab === 'teaching' && !isUserPlus) return; // student can't reach Teaching
        setActiveTab(tab);
    }

    // ─── Render ──────────────────────────────────────────────────────────────────

    return (
        <>
            <Topbar title={t('settings.title')} />
            <div className="page-content fade-in" style={{ maxWidth: 900 }}>
                {/* Tab bar */}
                <nav className="settings-tabs" aria-label="Settings sections">
                    <button
                        className={`settings-tab${activeTab === 'general' ? ' active' : ''}`}
                        onClick={() => handleTabClick('general')}
                        aria-selected={activeTab === 'general'}
                    >
                        <Settings size={15} aria-hidden="true" /> General
                    </button>

                    {isUserPlus && (
                        <button
                            className={`settings-tab${activeTab === 'teaching' ? ' active' : ''}`}
                            onClick={() => handleTabClick('teaching')}
                            aria-selected={activeTab === 'teaching'}
                        >
                            <BookOpen size={15} aria-hidden="true" /> Teaching
                        </button>
                    )}

                    <button
                        className={`settings-tab${activeTab === 'administration' ? ' active' : ''}${!isAdmin ? ' tab-locked' : ''}`}
                        onClick={() => handleTabClick('administration')}
                        aria-selected={activeTab === 'administration'}
                        aria-label={!isAdmin ? 'Administration (admin access required)' : 'Administration'}
                    >
                        {isAdmin ? <Shield size={15} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}
                        Administration
                    </button>
                </nav>

                {/* ── GENERAL TAB ─────────────────────────────────────────────── */}
                {activeTab === 'general' && (
                    <>
                        {/* Role & Access */}
                        <div
                            className="card"
                            style={{
                                marginBottom: 24,
                                borderLeft: `4px solid ${isAdmin ? 'var(--accent)' : isUserPlus ? 'var(--green)' : 'var(--yellow)'}`,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                {isAdmin ? (
                                    <Shield size={20} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                                ) : isUserPlus ? (
                                    <User size={20} style={{ color: 'var(--green)' }} aria-hidden="true" />
                                ) : (
                                    <GraduationCap size={20} style={{ color: 'var(--yellow)' }} aria-hidden="true" />
                                )}
                                <h3 style={{ margin: 0 }}>Role &amp; Access</h3>
                                <span className={`role-badge ${ROLE_META[role].badgeClass}`} style={{ marginLeft: 4 }}>
                                    {ROLE_META[role].icon} {t(ROLE_META[role].labelKey)}
                                </span>
                            </div>

                            <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
                                {t(ROLE_META[role].descriptionKey)}
                            </p>

                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {(['admin', 'teacher', 'student'] as UserRole[]).map((r) => (
                                    <button
                                        key={r}
                                        className={`btn btn-sm ${role === r ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => requestRoleSwitch(r)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                                    >
                                        {r === 'admin' && <Shield size={13} aria-hidden="true" />}
                                        {r === 'teacher' && <User size={13} aria-hidden="true" />}
                                        {r === 'student' && <GraduationCap size={13} aria-hidden="true" />}
                                        {t(ROLE_META[r].labelKey)}
                                        {r === 'admin' && settings.adminPin && role !== 'admin' && (
                                            <Lock size={11} aria-label="password required" style={{ marginLeft: 2 }} />
                                        )}
                                    </button>
                                ))}
                            </div>

                            {!settings.adminPin && (
                                <p className="text-muted text-xs" style={{ marginTop: 12 }}>
                                    <AlertCircle
                                        size={11}
                                        style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
                                        aria-hidden="true"
                                    />
                                    No admin password is set — anyone can switch to Administrator. Set a password in the{' '}
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        style={{ padding: '0 4px', fontSize: 'inherit' }}
                                        onClick={() => {
                                            if (isAdmin) setActiveTab('administration');
                                            else requestRoleSwitch('admin');
                                        }}
                                    >
                                        Administration tab
                                    </button>{' '}
                                    to restrict access.
                                </p>
                            )}
                        </div>

                        {/* Display */}
                        <div className="card" style={{ marginBottom: 24 }}>
                            <h3 style={{ marginBottom: 16 }}>{t('settings.general')}</h3>
                            <div className="grid-2" style={{ gap: 16 }}>
                                <div className="form-group">
                                    <label htmlFor="setting-theme">{t('settings.theme')}</label>
                                    <select
                                        id="setting-theme"
                                        value={settings.theme}
                                        onChange={(e) => updateSettings({ theme: e.target.value as 'light' | 'dark' })}
                                    >
                                        <option value="dark">{t('settings.theme_dark')}</option>
                                        <option value="light">{t('settings.theme_light')}</option>
                                    </select>
                                </div>
                                {isUserPlus && (
                                    <div className="form-group">
                                        <label htmlFor="setting-accent-text">{t('settings.accent_color_label')}</label>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <input
                                                type="color"
                                                aria-label={t('settings.accent_color_label') + ' (picker)'}
                                                value={/^#[0-9A-Fa-f]{6}$/.test(accentInput) ? accentInput : '#37b49c'}
                                                onChange={(e) => handleAccentChange(e.target.value)}
                                                style={{
                                                    width: 36,
                                                    height: 32,
                                                    padding: 2,
                                                    border: '1px solid var(--border)',
                                                    borderRadius: 5,
                                                }}
                                            />
                                            <input
                                                id="setting-accent-text"
                                                type="text"
                                                value={accentInput}
                                                onChange={(e) => handleAccentChange(e.target.value)}
                                                aria-describedby={accentError ? 'accent-error' : undefined}
                                                aria-invalid={accentError ? 'true' : undefined}
                                                style={{
                                                    width: 100,
                                                    borderColor: accentError ? 'var(--red)' : undefined,
                                                }}
                                            />
                                        </div>
                                        {accentError && (
                                            <div
                                                id="accent-error"
                                                className="text-xs"
                                                style={{ color: 'var(--red)', marginTop: 4 }}
                                            >
                                                {t('settings.accent_color_invalid')}
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                                            {ACCENT_PRESETS.map(({ id, color }) => (
                                                <button
                                                    key={id}
                                                    title={t(`settings.preset_${id}`, id)}
                                                    aria-label={`${t('settings.accent_color_label')}: ${t(`settings.preset_${id}`, id)}`}
                                                    onClick={() => handleAccentChange(color)}
                                                    style={{
                                                        width: 22,
                                                        height: 22,
                                                        borderRadius: '50%',
                                                        background: color,
                                                        border:
                                                            accentInput === color && !settings.colorPreset
                                                                ? '2.5px solid var(--text)'
                                                                : '2px solid transparent',
                                                        cursor: 'pointer',
                                                        padding: 0,
                                                        outline: 'none',
                                                        boxShadow:
                                                            accentInput === color && !settings.colorPreset
                                                                ? `0 0 0 1px ${color}`
                                                                : 'none',
                                                        transition: 'border 0.15s',
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {isUserPlus && (
                                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                        <label>{t('settings.theme_bundles_label')}</label>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                                            {THEME_BUNDLES.map((bundle) => {
                                                const active = settings.colorPreset === bundle.id;
                                                return (
                                                    <button
                                                        key={bundle.id}
                                                        title={t(`settings.theme_bundle_${bundle.id}`)}
                                                        onClick={() => {
                                                            updateSettings({
                                                                accentColor: bundle.accentColor,
                                                                uiFontFamily: bundle.uiFontFamily,
                                                                colorPreset: bundle.id,
                                                                defaultFormat: {
                                                                    ...settings.defaultFormat,
                                                                    fontFamily: bundle.exportFontFamily,
                                                                    headerColor: bundle.exportHeaderColor,
                                                                },
                                                            });
                                                            setAccentInput(bundle.accentColor);
                                                            setAccentError(false);
                                                        }}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 8,
                                                            padding: '6px 12px',
                                                            borderRadius: 8,
                                                            border: active
                                                                ? `2px solid ${bundle.accentColor}`
                                                                : '2px solid var(--border)',
                                                            background: active
                                                                ? `${bundle.accentColor}15`
                                                                : 'var(--bg-elevated)',
                                                            cursor: 'pointer',
                                                            fontFamily: `'${bundle.uiFontFamily}', system-ui, sans-serif`,
                                                            fontSize: '0.85rem',
                                                            fontWeight: active ? 700 : 500,
                                                            color: active ? bundle.accentColor : 'var(--text)',
                                                            transition: 'all 0.15s',
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                width: 12,
                                                                height: 12,
                                                                borderRadius: '50%',
                                                                background: bundle.accentColor,
                                                                flexShrink: 0,
                                                            }}
                                                        />
                                                        {t(`settings.theme_bundle_${bundle.id}`)}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {isUserPlus && (
                                    <div className="form-group">
                                        <label htmlFor="setting-ui-font">{t('settings.ui_font_label')}</label>
                                        <select
                                            id="setting-ui-font"
                                            value={settings.uiFontFamily || 'Inter'}
                                            onChange={(e) =>
                                                updateSettings({
                                                    uiFontFamily: e.target.value as import('../types').UiFontFamily,
                                                })
                                            }
                                            style={{
                                                fontFamily: settings.uiFontFamily
                                                    ? `'${settings.uiFontFamily}', system-ui, sans-serif`
                                                    : undefined,
                                            }}
                                        >
                                            {[
                                                { key: 'Inter', label: 'Inter (default)' },
                                                { key: 'Nunito', label: 'Nunito — friendly, rounded' },
                                                { key: 'Source Sans 3', label: 'Source Sans 3 — clean, neutral' },
                                                { key: 'Lato', label: 'Lato — professional' },
                                                { key: 'Roboto', label: 'Roboto — modern' },
                                            ].map(({ key, label }) => (
                                                <option key={key} value={key}>
                                                    {label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Localization */}
                        <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid var(--accent)' }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                                <Globe size={20} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                                <h3 style={{ margin: 0 }}>{t('navigation.localization') || 'Localization'}</h3>
                            </div>
                            <div className="form-group">
                                <label htmlFor="setting-language">{t('settings.language_selection')}</label>
                                <select
                                    id="setting-language"
                                    value={settings.language}
                                    onChange={(e) => updateSettings({ language: e.target.value })}
                                >
                                    <option value="en">{t('settings.language_en')}</option>
                                    <option value="nl">{t('settings.language_nl')}</option>
                                    <option value="fr">{t('settings.language_fr')}</option>
                                    <option value="de">{t('settings.language_de')}</option>
                                    <option value="es">{t('settings.language_es')}</option>
                                </select>
                            </div>
                            <p className="text-muted text-sm" style={{ marginTop: 12 }}>
                                {t('settings.language_help')}
                            </p>
                        </div>

                        {/* Cambridge English exam labels */}
                        <div className="card" style={{ marginBottom: 24 }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                                <GraduationCap size={20} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                                <h3 style={{ margin: 0 }}>{t('cambridge.settings_section_title')}</h3>
                            </div>
                            <label
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={!!settings.showCambridgeLabels}
                                    onChange={(e) => updateSettings({ showCambridgeLabels: e.target.checked })}
                                    style={{ accentColor: 'var(--accent)' }}
                                />
                                <div>
                                    <div style={{ fontWeight: 500 }}>{t('cambridge.show_labels_setting')}</div>
                                    <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                                        {t('cambridge.show_labels_help')}
                                    </div>
                                </div>
                            </label>
                        </div>

                        {/* Dyslexia-friendly reading mode */}
                        <div className="card" style={{ marginBottom: 24 }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                                <BookOpen size={20} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                                <h3 style={{ margin: 0 }}>{t('settings.dyslexia_section_title')}</h3>
                            </div>
                            <label
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={!!settings.dyslexiaFriendlyMode}
                                    onChange={(e) => updateSettings({ dyslexiaFriendlyMode: e.target.checked })}
                                    style={{ accentColor: 'var(--accent)' }}
                                />
                                <div>
                                    <div style={{ fontWeight: 500 }}>{t('settings.dyslexia_mode_label')}</div>
                                    <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                                        {t('settings.dyslexia_mode_help')}
                                    </div>
                                </div>
                            </label>
                        </div>

                        {/* Guided tour */}
                        <div className="card">
                            <h3 style={{ marginBottom: 16 }}>{t('tutorial.restart_section_title')}</h3>
                            <button
                                className="btn btn-secondary"
                                onClick={() => {
                                    updateSettings({ hasSeenTutorial: false });
                                    navigate('/');
                                }}
                            >
                                <PlayCircle size={16} aria-hidden="true" /> {t('tutorial.restart_button')}
                            </button>
                        </div>
                    </>
                )}

                {/* ── TEACHING TAB ─────────────────────────────────────────────── */}
                {activeTab === 'teaching' && isUserPlus && (
                    <>
                        {/* Grading preferences */}
                        <div className="card" style={{ marginBottom: 24 }}>
                            <h3 style={{ marginBottom: 16 }}>{t('settings.general')}</h3>
                            <div className="grid-2" style={{ gap: 16 }}>
                                <div className="form-group">
                                    <label htmlFor="setting-grade-scale">{t('settings.default_grade_scale')}</label>
                                    <select
                                        id="setting-grade-scale"
                                        value={settings.defaultGradeScaleId}
                                        onChange={(e) => updateSettings({ defaultGradeScaleId: e.target.value })}
                                    >
                                        {gradeScales.map((gs) => (
                                            <option key={gs.id} value={gs.id}>
                                                {getScaleName(gs)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                    <label
                                        htmlFor="setting-matchup-limit"
                                        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                                    >
                                        {t('settings.comparisons_limit_label')}
                                        <span className="badge badge-blue">
                                            {settings.comparativeMatchupLimit && settings.comparativeMatchupLimit > 0
                                                ? settings.comparativeMatchupLimit
                                                : t('settings.comparisons_limit_infinite')}
                                        </span>
                                    </label>
                                    <input
                                        id="setting-matchup-limit"
                                        type="number"
                                        min="0"
                                        placeholder={t('settings.comparisons_limit_placeholder')}
                                        value={settings.comparativeMatchupLimit || ''}
                                        onChange={(e) =>
                                            updateSettings({ comparativeMatchupLimit: parseInt(e.target.value) || 0 })
                                        }
                                        style={{ maxWidth: 200 }}
                                    />
                                    <div className="text-muted text-xs" style={{ marginTop: 4 }}>
                                        {t('settings.comparisons_limit_help')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Grade notification (Supabase mode only) */}
                        {dbStatus.isConnected && (
                            <div className="card" style={{ marginBottom: 24 }}>
                                <h3 style={{ marginBottom: 12 }}>
                                    {t('settings.notify_students_title', 'Student Notifications')}
                                </h3>
                                <label
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={!!settings.notifyStudentsOnGrade}
                                        onChange={(e) => updateSettings({ notifyStudentsOnGrade: e.target.checked })}
                                        style={{ accentColor: 'var(--accent)' }}
                                    />
                                    <div>
                                        <div style={{ fontWeight: 500 }}>
                                            {t('settings.notify_on_grade_label', 'Notify students when graded')}
                                        </div>
                                        <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                                            {t(
                                                'settings.notify_on_grade_help',
                                                'Sends an email to the student when you save a grade. Requires SMTP to be configured in your Supabase project.'
                                            )}
                                        </div>
                                    </div>
                                </label>
                                <label
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        marginTop: 14,
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={!!settings.notifyStudentsOnMessage}
                                        onChange={(e) => updateSettings({ notifyStudentsOnMessage: e.target.checked })}
                                        style={{ accentColor: 'var(--accent)' }}
                                    />
                                    <div>
                                        <div style={{ fontWeight: 500 }}>
                                            {t('settings.notify_on_message_label', 'Notify students on message reply')}
                                        </div>
                                        <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                                            {t(
                                                'settings.notify_on_message_help',
                                                'Sends an email to the student when you reply to or start a message thread. Requires SMTP to be configured in your Supabase project.'
                                            )}
                                        </div>
                                    </div>
                                </label>
                            </div>
                        )}

                        {/* Overdue Reminder Threshold */}
                        <div className="card" style={{ marginBottom: 24 }}>
                            <div className="card-header">
                                <h3>{t('settings.overdue_reminder')}</h3>
                            </div>
                            <div className="form-group">
                                <label htmlFor="setting-overdue-threshold">
                                    {t('settings.overdue_threshold_label')}
                                </label>
                                <input
                                    id="setting-overdue-threshold"
                                    type="number"
                                    min="1"
                                    max="365"
                                    value={settings.overdueReminderThreshold ?? 7}
                                    onChange={(e) =>
                                        updateSettings({
                                            overdueReminderThreshold: Math.max(1, parseInt(e.target.value) || 7),
                                        })
                                    }
                                    style={{ maxWidth: 120 }}
                                />
                                <div className="text-muted text-xs" style={{ marginTop: 4 }}>
                                    {t('settings.overdue_threshold_help')}
                                </div>
                            </div>
                        </div>

                        {/* Standard mastery targets (CEFR/SLO progress by track/year, roadmap 15.2) */}
                        <div className="card" style={{ marginBottom: 24 }}>
                            <div
                                className="card-header"
                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
                            >
                                <div>
                                    <h3 style={{ margin: 0 }}>{t('settings.mastery_targets_title')}</h3>
                                    <p className="text-muted text-sm" style={{ marginTop: 4, marginBottom: 0 }}>
                                        {t('settings.mastery_targets_help')}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setEditingMasteryTarget('new')}
                                >
                                    {t('settings.mastery_target_add_title')}
                                </button>
                            </div>
                            {standardMasteryTargets.length === 0 ? (
                                <p className="text-muted text-sm" style={{ marginTop: 12 }}>
                                    {t('settings.mastery_targets_empty')}
                                </p>
                            ) : (
                                <table className="data-table" style={{ marginTop: 12 }}>
                                    <thead>
                                        <tr>
                                            <th>{t('settings.mastery_target_standard_label')}</th>
                                            <th>{t('studentsPage.form_school_year')}</th>
                                            <th>{t('voTrack.section_label')}</th>
                                            <th>{t('settings.mastery_target_percentage_label')}</th>
                                            <th className="sr-only">{t('common.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {standardMasteryTargets.map((target) => (
                                            <tr key={target.id}>
                                                <td>{target.standardDescription}</td>
                                                <td>{SCHOOL_YEAR_LABELS[target.year]}</td>
                                                <td>{target.voTrack ? VO_TRACK_LABELS[target.voTrack] : '—'}</td>
                                                <td>{target.targetPercentage}%</td>
                                                <td style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => setEditingMasteryTarget(target)}
                                                    >
                                                        {t('common.edit')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-sm"
                                                        style={{ color: 'var(--red)' }}
                                                        onClick={() => setDeleteMasteryTargetId(target.id)}
                                                    >
                                                        {t('common.delete')}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Comment Bank */}
                        <div
                            className="card"
                            style={{
                                marginBottom: 24,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                            }}
                        >
                            <div>
                                <h3 style={{ margin: 0 }}>{t('settings.comment_bank')}</h3>
                                <p className="text-muted text-sm" style={{ marginTop: 4 }}>
                                    {t('settings.comment_bank_help').replace('{{count}}', String(commentBank.length))}
                                </p>
                            </div>
                            <button className="btn btn-secondary" onClick={() => setShowCommentBank(true)}>
                                <MessageSquare size={16} aria-hidden="true" /> {t('settings.action_manage_comments')}
                            </button>
                        </div>

                        {/* Grade Scales */}
                        <div className="card" style={{ marginBottom: 24 }}>
                            <div className="card-header">
                                <h3>{t('settings.grade_scales')}</h3>
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => {
                                        const gs = addGradeScale({
                                            name: t('settings.scale_new_name'),
                                            type: 'custom',
                                            ranges: [{ min: 0, max: 100, label: 'Pass', color: '#22c55e' }],
                                        });
                                        setEditingScaleId(gs.id);
                                    }}
                                >
                                    <Plus size={15} aria-hidden="true" /> {t('settings.action_new_scale')}
                                </button>
                            </div>

                            {gradeScales.map((gs) => (
                                <div
                                    key={gs.id}
                                    style={{
                                        marginBottom: 12,
                                        background: 'var(--bg-elevated)',
                                        borderRadius: 10,
                                        overflow: 'hidden',
                                        border: '1px solid var(--border)',
                                    }}
                                >
                                    <div
                                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}
                                    >
                                        <input
                                            type="text"
                                            value={gs.name}
                                            onChange={(e) => updateGradeScale({ ...gs, name: e.target.value })}
                                            style={{
                                                flex: 1,
                                                fontWeight: 600,
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--text)',
                                                fontSize: '0.9rem',
                                                outline: 'none',
                                            }}
                                        />
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {gs.ranges.map((r, i) => (
                                                <div
                                                    key={i}
                                                    title={`${r.label}: ${r.min}–${r.max}%`}
                                                    style={{
                                                        width: 14,
                                                        height: 14,
                                                        borderRadius: 3,
                                                        background: r.color,
                                                    }}
                                                />
                                            ))}
                                        </div>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => setEditingScaleId(editingScaleId === gs.id ? null : gs.id)}
                                        >
                                            {editingScaleId === gs.id
                                                ? t('settings.action_collapse')
                                                : t('settings.action_edit')}
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-icon btn-sm"
                                            aria-label={t('common.delete')}
                                            style={{ color: 'var(--red)' }}
                                            onClick={() => {
                                                if (gs.id !== settings.defaultGradeScaleId) setDeleteScaleId(gs.id);
                                                else showToast(t('settings.alert_cannot_delete_default'), 'info');
                                            }}
                                        >
                                            <Trash2 size={14} aria-hidden="true" />
                                        </button>
                                    </div>

                                    {editingScaleId === gs.id && (
                                        <div style={{ padding: '0 16px 16px' }}>
                                            <table className="data-table" style={{ marginBottom: 10 }}>
                                                <thead>
                                                    <tr>
                                                        <th>{t('settings.label_label')}</th>
                                                        <th>{t('settings.label_min_pct')}</th>
                                                        <th>{t('settings.label_max_pct')}</th>
                                                        <th>{t('settings.label_color')}</th>
                                                        <th></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {gs.ranges.map((r, idx) => (
                                                        <tr key={idx}>
                                                            <td>
                                                                <input
                                                                    type="text"
                                                                    value={r.label}
                                                                    onChange={(e) =>
                                                                        updateRange(gs.id, idx, {
                                                                            label: e.target.value,
                                                                        })
                                                                    }
                                                                    style={{ width: 80 }}
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="number"
                                                                    value={r.min}
                                                                    min={0}
                                                                    max={100}
                                                                    onChange={(e) =>
                                                                        updateRange(gs.id, idx, {
                                                                            min: Number(e.target.value),
                                                                        })
                                                                    }
                                                                    style={{ width: 60 }}
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="number"
                                                                    value={r.max}
                                                                    min={0}
                                                                    max={100}
                                                                    onChange={(e) =>
                                                                        updateRange(gs.id, idx, {
                                                                            max: Number(e.target.value),
                                                                        })
                                                                    }
                                                                    style={{ width: 60 }}
                                                                />
                                                            </td>
                                                            <td>
                                                                <div
                                                                    style={{
                                                                        display: 'flex',
                                                                        gap: 6,
                                                                        alignItems: 'center',
                                                                    }}
                                                                >
                                                                    <input
                                                                        type="color"
                                                                        value={r.color}
                                                                        onChange={(e) =>
                                                                            updateRange(gs.id, idx, {
                                                                                color: e.target.value,
                                                                            })
                                                                        }
                                                                        style={{
                                                                            width: 36,
                                                                            height: 32,
                                                                            padding: 2,
                                                                            border: '1px solid var(--border)',
                                                                            borderRadius: 5,
                                                                        }}
                                                                    />
                                                                    <input
                                                                        type="text"
                                                                        value={r.color}
                                                                        onChange={(e) =>
                                                                            updateRange(gs.id, idx, {
                                                                                color: e.target.value,
                                                                            })
                                                                        }
                                                                        style={{ width: 80 }}
                                                                    />
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <button
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    aria-label={t('common.delete')}
                                                                    style={{ color: 'var(--red)' }}
                                                                    onClick={() => removeRange(gs.id, idx)}
                                                                >
                                                                    <Trash2 size={13} aria-hidden="true" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => addRange(gs.id)}
                                            >
                                                <Plus size={14} aria-hidden="true" /> {t('settings.action_add_range')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Export Templates */}
                        <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid var(--accent)' }}>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 16,
                                }}
                            >
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                    <Layout size={20} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                                    <div>
                                        <h3 style={{ margin: 0 }}>{t('settings.export_templates')}</h3>
                                        <p className="text-muted text-xs" style={{ marginTop: 2 }}>
                                            {t('settings.export_templates_help')}
                                        </p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <a
                                        href="sample-template.docx"
                                        download="sample-template.docx"
                                        className="btn btn-secondary btn-sm"
                                        style={{ textDecoration: 'none' }}
                                    >
                                        <Download size={14} aria-hidden="true" /> Sample Template
                                    </a>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => setShowTemplateUpload(true)}
                                    >
                                        <Upload size={14} aria-hidden="true" /> {t('settings.action_upload_template')}
                                    </button>
                                </div>
                            </div>

                            {exportTemplates.length === 0 ? (
                                <div
                                    style={{
                                        textAlign: 'center',
                                        padding: '20px 0',
                                        color: 'var(--text-muted)',
                                        fontSize: '0.85rem',
                                    }}
                                >
                                    <Trans i18nKey="settings.empty_state_templates">
                                        No templates uploaded yet. Click <strong>Upload Template</strong> to add one.
                                    </Trans>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {exportTemplates.map((tmpl) => {
                                        const isStyle = tmpl.kind === 'style';
                                        const activeId = isStyle ? settings.styleTemplateId : settings.exportTemplateId;
                                        const isActive = activeId === tmpl.id;
                                        return (
                                            <div
                                                key={tmpl.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 12,
                                                    background: 'var(--bg-elevated)',
                                                    borderRadius: 10,
                                                    padding: '12px 16px',
                                                    border: isActive
                                                        ? '1.5px solid var(--accent)'
                                                        : '1px solid var(--border)',
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: 32,
                                                        height: 32,
                                                        borderRadius: 8,
                                                        background: isStyle
                                                            ? (tmpl.headingColor ?? 'var(--text-muted)')
                                                            : (tmpl.headerColor ?? '#1e3a5f'),
                                                        flexShrink: 0,
                                                    }}
                                                />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                                            {tmpl.name}
                                                        </span>
                                                        <span
                                                            style={{
                                                                fontSize: '0.7rem',
                                                                fontWeight: 600,
                                                                color: 'var(--text-muted)',
                                                                background: 'var(--bg-panel)',
                                                                borderRadius: 4,
                                                                padding: '1px 6px',
                                                            }}
                                                        >
                                                            {isStyle
                                                                ? t('settings.template_kind_style')
                                                                : t('settings.template_kind_table')}
                                                        </span>
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: '0.78rem',
                                                            color: 'var(--text-muted)',
                                                            marginTop: 2,
                                                        }}
                                                    >
                                                        {isStyle
                                                            ? tmpl.headingFont || tmpl.bodyFont
                                                                ? t('settings.template_style_summary', {
                                                                      heading:
                                                                          tmpl.headingFont ??
                                                                          t('settings.template_default_font'),
                                                                      body:
                                                                          tmpl.bodyFont ??
                                                                          t('settings.template_default_font'),
                                                                  })
                                                                : t('settings.template_style_none_detected')
                                                            : tmpl.levelHeaders.length > 0
                                                              ? tmpl.levelHeaders.join(' · ')
                                                              : t('settings.no_level_headers')}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button
                                                        className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                                                        onClick={() =>
                                                            updateSettings(
                                                                isStyle
                                                                    ? {
                                                                          styleTemplateId: isActive
                                                                              ? undefined
                                                                              : tmpl.id,
                                                                      }
                                                                    : {
                                                                          exportTemplateId: isActive
                                                                              ? undefined
                                                                              : tmpl.id,
                                                                      }
                                                            )
                                                        }
                                                    >
                                                        <Star size={13} aria-hidden="true" />
                                                        {isActive
                                                            ? t('settings.label_default')
                                                            : t('settings.action_set_default')}
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-icon btn-sm"
                                                        aria-label={t('common.delete')}
                                                        style={{ color: 'var(--red)' }}
                                                        onClick={() => {
                                                            deleteExportTemplate(tmpl.id);
                                                            if (isActive)
                                                                updateSettings(
                                                                    isStyle
                                                                        ? { styleTemplateId: undefined }
                                                                        : { exportTemplateId: undefined }
                                                                );
                                                        }}
                                                    >
                                                        <Trash2 size={14} aria-hidden="true" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Backup export (non-destructive — safe for teachers) */}
                        <div className="card">
                            <h3 style={{ marginBottom: 16 }}>{t('settings.backup_restore')}</h3>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <button className="btn btn-secondary" onClick={handleBackupExport}>
                                    <Download size={16} aria-hidden="true" /> {t('settings.action_export_backup')}
                                </button>
                            </div>
                            <p className="text-muted text-sm" style={{ marginTop: 12 }}>
                                {t('settings.backup_help')}
                            </p>
                        </div>
                    </>
                )}

                {/* ── ADMINISTRATION TAB ───────────────────────────────────────── */}
                {activeTab === 'administration' && (
                    <>
                        {/* Gate: non-admin sees lock screen */}
                        {!isAdmin ? (
                            <div className="card">
                                <div className="admin-locked-card">
                                    <Lock size={40} style={{ color: 'var(--text-dim)' }} aria-hidden="true" />
                                    <h3 style={{ margin: 0 }}>Administrator access required</h3>
                                    <p className="text-muted text-sm" style={{ maxWidth: 400 }}>
                                        These settings control database connections, API integrations, and system-level
                                        configuration. They are restricted to the Administrator role.
                                    </p>
                                    {settings.adminPin ? (
                                        <div
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 10,
                                                width: '100%',
                                                maxWidth: 300,
                                            }}
                                        >
                                            <div className="form-group" style={{ marginBottom: 0 }}>
                                                <label htmlFor="admin-unlock-pin">Admin password</label>
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <input
                                                        id="admin-unlock-pin"
                                                        type={showPin ? 'text' : 'password'}
                                                        value={pinInput}
                                                        onChange={(e) => {
                                                            setPinInput(e.target.value);
                                                            setPinError(false);
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                void confirmPinAndSwitch('admin');
                                                            }
                                                        }}
                                                        placeholder="Enter admin password"
                                                        aria-invalid={pinError ? 'true' : undefined}
                                                        style={{ flex: 1 }}
                                                        autoFocus
                                                    />
                                                    <button
                                                        className="btn btn-ghost btn-icon btn-sm"
                                                        onClick={() => setShowPin((p) => !p)}
                                                        aria-label={showPin ? 'Hide password' : 'Show password'}
                                                    >
                                                        {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                                                    </button>
                                                </div>
                                                {pinError && (
                                                    <div
                                                        className="text-xs"
                                                        style={{ color: 'var(--red)', marginTop: 4 }}
                                                    >
                                                        Incorrect password
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                className="btn btn-primary"
                                                onClick={() => void confirmPinAndSwitch('admin')}
                                            >
                                                <Shield size={15} aria-hidden="true" /> Switch to Administrator
                                            </button>
                                        </div>
                                    ) : (
                                        <button className="btn btn-primary" onClick={() => applyRoleSwitch('admin')}>
                                            <Shield size={15} aria-hidden="true" /> Switch to Administrator
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Admin Dashboard link */}
                                <div
                                    className="card"
                                    style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}
                                >
                                    <Shield
                                        size={20}
                                        style={{ color: 'var(--accent)', flexShrink: 0 }}
                                        aria-hidden="true"
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, marginBottom: 2 }}>{t('admin.title')}</div>
                                        <p className="text-muted text-sm" style={{ margin: 0 }}>
                                            Manage users, schools, database sync, integrations, and data retention.
                                        </p>
                                    </div>
                                    <Link
                                        to="/admin"
                                        className="btn btn-primary btn-sm"
                                        style={{ textDecoration: 'none', flexShrink: 0 }}
                                    >
                                        {t('settings.open_admin_dashboard', 'Open')}
                                    </Link>
                                </div>

                                {/* Backup — full (export + import) */}
                                <div className="card" style={{ marginBottom: 24 }}>
                                    <h3 style={{ marginBottom: 16 }}>{t('settings.backup_restore')}</h3>
                                    <div style={{ display: 'flex', gap: 12 }}>
                                        <button className="btn btn-secondary" onClick={handleBackupExport}>
                                            <Download size={16} aria-hidden="true" />{' '}
                                            {t('settings.action_export_backup')}
                                        </button>
                                        <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                                            <Upload size={16} aria-hidden="true" /> {t('settings.action_import_backup')}
                                            <input
                                                type="file"
                                                accept=".json"
                                                onChange={handleBackupImport}
                                                style={{ display: 'none' }}
                                            />
                                        </label>
                                    </div>
                                    <p className="text-muted text-sm" style={{ marginTop: 12 }}>
                                        {t('settings.backup_help')}
                                    </p>
                                    <div
                                        style={{
                                            marginTop: 10,
                                            padding: '8px 12px',
                                            background: 'color-mix(in srgb, var(--yellow) 10%, transparent)',
                                            border: '1px solid color-mix(in srgb, var(--yellow) 40%, transparent)',
                                            borderRadius: 8,
                                            fontSize: '0.8rem',
                                            color: 'var(--text-muted)',
                                        }}
                                    >
                                        <AlertCircle
                                            size={12}
                                            style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }}
                                            aria-hidden="true"
                                        />
                                        Importing a backup will <strong>overwrite all current data</strong>. This action
                                        cannot be undone.
                                    </div>
                                </div>

                                {/* Dev-only: seed demo data for design/UX review — never shown in production builds */}
                                {import.meta.env.DEV && (
                                    <div className="card" style={{ marginBottom: 24 }}>
                                        <h3 style={{ marginBottom: 16 }}>Dev: sample data</h3>
                                        <button className="btn btn-secondary" onClick={handleLoadSampleData}>
                                            <Sparkles size={16} aria-hidden="true" /> Load sample data
                                        </button>
                                        <p className="text-muted text-sm" style={{ marginTop: 12 }}>
                                            Populates classes, students, CEFR-tagged rubrics with grades, tests, essays,
                                            and comment-bank entries for design review. Overwrites current data — only
                                            available in dev builds.
                                        </p>
                                    </div>
                                )}

                                {/* Admin password */}
                                <div
                                    className="card"
                                    style={{ marginBottom: 24, borderLeft: '4px solid var(--accent)' }}
                                >
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                                        <Lock size={20} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                                        <div>
                                            <h3 style={{ margin: 0 }}>Admin Password</h3>
                                            <p className="text-muted text-xs" style={{ marginTop: 2 }}>
                                                {settings.adminPin
                                                    ? 'A password is set. Required to switch back to Administrator role.'
                                                    : 'No password set — anyone can switch to Administrator.'}
                                            </p>
                                        </div>
                                        {settings.adminPin && (
                                            <span className="badge badge-green" style={{ marginLeft: 'auto' }}>
                                                Protected
                                            </span>
                                        )}
                                    </div>

                                    {pinSetupMode === 'idle' ? (
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            {!settings.adminPin ? (
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => {
                                                        setPinSetupMode('setting');
                                                        setPinSetupError('');
                                                    }}
                                                >
                                                    <Lock size={14} aria-hidden="true" /> Set admin password
                                                </button>
                                            ) : (
                                                <>
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => {
                                                            setPinSetupMode('changing');
                                                            setPinSetupError('');
                                                        }}
                                                    >
                                                        <Save size={14} aria-hidden="true" /> Change password
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        style={{ color: 'var(--red)' }}
                                                        onClick={() => {
                                                            setPinSetupMode('removing');
                                                            setPinSetupError('');
                                                        }}
                                                    >
                                                        <Trash2 size={14} aria-hidden="true" /> Remove password
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <div
                                            style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 340 }}
                                        >
                                            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>
                                                {pinSetupMode === 'setting'
                                                    ? 'Set admin password'
                                                    : pinSetupMode === 'changing'
                                                      ? 'Change admin password'
                                                      : 'Remove admin password'}
                                            </h4>

                                            {(pinSetupMode === 'changing' || pinSetupMode === 'removing') && (
                                                <div className="form-group" style={{ marginBottom: 0 }}>
                                                    <label htmlFor="admin-current-pin">Current password</label>
                                                    <input
                                                        id="admin-current-pin"
                                                        type="password"
                                                        value={currentPinVerify}
                                                        onChange={(e) => {
                                                            setCurrentPinVerify(e.target.value);
                                                            setPinSetupError('');
                                                        }}
                                                        autoComplete="current-password"
                                                        autoFocus
                                                    />
                                                </div>
                                            )}

                                            {pinSetupMode !== 'removing' && (
                                                <>
                                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                                        <label htmlFor="admin-new-pin">New password</label>
                                                        <div style={{ display: 'flex', gap: 8 }}>
                                                            <input
                                                                id="admin-new-pin"
                                                                type={showNewPin ? 'text' : 'password'}
                                                                value={newPin}
                                                                onChange={(e) => {
                                                                    setNewPin(e.target.value);
                                                                    setPinSetupError('');
                                                                }}
                                                                autoComplete="new-password"
                                                                autoFocus={pinSetupMode === 'setting'}
                                                                style={{ flex: 1 }}
                                                            />
                                                            <button
                                                                className="btn btn-ghost btn-icon btn-sm"
                                                                onClick={() => setShowNewPin((p) => !p)}
                                                                aria-label={
                                                                    showNewPin ? 'Hide password' : 'Show password'
                                                                }
                                                            >
                                                                {showNewPin ? <EyeOff size={14} /> : <Eye size={14} />}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                                        <label htmlFor="admin-confirm-pin">Confirm password</label>
                                                        <input
                                                            id="admin-confirm-pin"
                                                            type="password"
                                                            value={confirmPin}
                                                            onChange={(e) => {
                                                                setConfirmPin(e.target.value);
                                                                setPinSetupError('');
                                                            }}
                                                            autoComplete="new-password"
                                                        />
                                                    </div>
                                                </>
                                            )}

                                            {pinSetupError && (
                                                <div className="text-xs" style={{ color: 'var(--red)' }}>
                                                    {pinSetupError}
                                                </div>
                                            )}

                                            <p className="text-muted text-xs">
                                                <AlertCircle
                                                    size={11}
                                                    style={{
                                                        display: 'inline',
                                                        verticalAlign: 'middle',
                                                        marginRight: 4,
                                                    }}
                                                    aria-hidden="true"
                                                />
                                                This is UI access control for normal use, not cryptographic security.
                                                The password is stored locally in your browser.
                                            </p>

                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button className="btn btn-ghost btn-sm" onClick={resetPinSetup}>
                                                    Cancel
                                                </button>
                                                {pinSetupMode === 'removing' ? (
                                                    <button className="btn btn-danger btn-sm" onClick={handleRemovePin}>
                                                        Remove password
                                                    </button>
                                                ) : (
                                                    <button
                                                        className="btn btn-primary btn-sm"
                                                        onClick={handleSaveNewPin}
                                                    >
                                                        Save password
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Role management summary */}
                                <div className="card">
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                                        <User size={20} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                                        <h3 style={{ margin: 0 }}>Role Reference</h3>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {(['admin', 'teacher', 'student'] as UserRole[]).map((r) => (
                                            <div
                                                key={r}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'flex-start',
                                                    gap: 12,
                                                    padding: '12px 14px',
                                                    background: 'var(--bg-elevated)',
                                                    borderRadius: 10,
                                                    border:
                                                        role === r
                                                            ? '1.5px solid var(--accent)'
                                                            : '1px solid var(--border)',
                                                }}
                                            >
                                                <span
                                                    className={`role-badge ${ROLE_META[r].badgeClass}`}
                                                    style={{ flexShrink: 0, marginTop: 1 }}
                                                >
                                                    {ROLE_META[r].icon} {t(ROLE_META[r].labelKey)}
                                                </span>
                                                <p className="text-muted text-sm" style={{ margin: 0 }}>
                                                    {t(ROLE_META[r].descriptionKey)}
                                                </p>
                                                {role === r && (
                                                    <span
                                                        className="badge badge-blue"
                                                        style={{ marginLeft: 'auto', flexShrink: 0 }}
                                                    >
                                                        Current
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>

            {/* ── Modals & dialogs ─────────────────────────────────────────── */}

            {showCommentBank && <CommentBankModal onClose={() => setShowCommentBank(false)} />}
            {editingMasteryTarget && (
                <StandardMasteryTargetModal
                    existing={editingMasteryTarget === 'new' ? undefined : editingMasteryTarget}
                    onClose={() => setEditingMasteryTarget(null)}
                />
            )}
            {showTemplateUpload && (
                <TemplateUploadModal
                    onClose={() => setShowTemplateUpload(false)}
                    onSave={(tmpl) => {
                        addExportTemplate(tmpl);
                        setShowTemplateUpload(false);
                    }}
                />
            )}

            {/* Backup import preview / confirmation */}
            {backupPreview && (
                <Modal titleId="backup-preview-title" onClose={() => setBackupPreview(null)} maxWidth={480}>
                    <div className="modal-header">
                        <h3 id="backup-preview-title" style={{ margin: 0 }}>
                            {t('settings.backup_preview_title')}
                        </h3>
                        <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => setBackupPreview(null)}
                            aria-label={t('common.cancel')}
                        >
                            ✕
                        </button>
                    </div>
                    <div style={{ padding: '20px 24px' }}>
                        <p className="text-muted" style={{ marginBottom: 16, fontSize: '0.9rem' }}>
                            {t('settings.backup_preview_subtitle')}
                        </p>

                        {/* Summary table: current vs backup */}
                        <table
                            aria-label={t('settings.backup_preview_table_label')}
                            style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: '0.875rem',
                                marginBottom: 20,
                            }}
                        >
                            <thead>
                                <tr>
                                    <th
                                        style={{
                                            textAlign: 'left',
                                            padding: '6px 8px',
                                            borderBottom: '1px solid var(--border)',
                                            color: 'var(--text-muted)',
                                        }}
                                    ></th>
                                    <th
                                        style={{
                                            textAlign: 'right',
                                            padding: '6px 8px',
                                            borderBottom: '1px solid var(--border)',
                                            color: 'var(--text-muted)',
                                        }}
                                    >
                                        {t('settings.backup_preview_current')}
                                    </th>
                                    <th
                                        style={{
                                            textAlign: 'right',
                                            padding: '6px 8px',
                                            borderBottom: '1px solid var(--border)',
                                            color: 'var(--accent)',
                                            fontWeight: 700,
                                        }}
                                    >
                                        {t('settings.backup_preview_backup')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {(
                                    [
                                        [
                                            t('settings.backup_preview_rubrics'),
                                            rubrics.length,
                                            backupPreview.summary.rubrics,
                                        ],
                                        [
                                            t('settings.backup_preview_students'),
                                            students.length,
                                            backupPreview.summary.students,
                                        ],
                                        [
                                            t('settings.backup_preview_classes'),
                                            classes.length,
                                            backupPreview.summary.classes,
                                        ],
                                        [
                                            t('settings.backup_preview_grades'),
                                            studentRubrics.length,
                                            backupPreview.summary.studentRubrics,
                                        ],
                                    ] as [string, number, number][]
                                ).map(([label, current, backup]) => (
                                    <tr key={label}>
                                        <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{label}</td>
                                        <td
                                            style={{
                                                padding: '6px 8px',
                                                textAlign: 'right',
                                                color: 'var(--text-muted)',
                                            }}
                                        >
                                            {current}
                                        </td>
                                        <td
                                            style={{
                                                padding: '6px 8px',
                                                textAlign: 'right',
                                                fontWeight: 600,
                                                color: backup !== current ? 'var(--accent)' : 'var(--text)',
                                            }}
                                        >
                                            {backup}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div
                            style={{
                                padding: '10px 12px',
                                background: 'color-mix(in srgb, var(--red) 10%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)',
                                borderRadius: 8,
                                fontSize: '0.8rem',
                                color: 'var(--text-muted)',
                                marginBottom: 20,
                            }}
                        >
                            <AlertCircle
                                size={12}
                                style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }}
                                aria-hidden="true"
                            />
                            {t('settings.backup_preview_warning')}
                        </div>

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost" onClick={() => setBackupPreview(null)}>
                                {t('common.cancel')}
                            </button>
                            <button className="btn btn-danger" onClick={confirmImportBackup}>
                                {t('settings.action_confirm_import')}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Delete grade scale confirm */}
            {deleteScaleId && (
                <Modal titleId="delete-scale-title" onClose={() => setDeleteScaleId(null)} maxWidth={420}>
                    <div className="modal-header">
                        <h3 id="delete-scale-title" style={{ margin: 0 }}>
                            {t('settings.delete_scale_title')}
                        </h3>
                        <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => setDeleteScaleId(null)}
                            aria-label="Close"
                        >
                            ✕
                        </button>
                    </div>
                    <div style={{ padding: '20px 24px' }}>
                        <p className="text-muted" style={{ marginBottom: 20 }}>
                            {t('settings.delete_scale_confirm')}
                        </p>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost" onClick={() => setDeleteScaleId(null)}>
                                {t('common.cancel')}
                            </button>
                            <button className="btn btn-danger" onClick={confirmDeleteScale}>
                                {t('common.delete')}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Delete mastery target confirm */}
            {deleteMasteryTargetId && (
                <Modal
                    titleId="delete-mastery-target-title"
                    onClose={() => setDeleteMasteryTargetId(null)}
                    maxWidth={420}
                >
                    <div className="modal-header">
                        <h3 id="delete-mastery-target-title" style={{ margin: 0 }}>
                            {t('settings.mastery_target_delete_title')}
                        </h3>
                        <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => setDeleteMasteryTargetId(null)}
                            aria-label="Close"
                        >
                            ✕
                        </button>
                    </div>
                    <div style={{ padding: '20px 24px' }}>
                        <p className="text-muted" style={{ marginBottom: 20 }}>
                            {t('settings.mastery_target_delete_confirm')}
                        </p>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => setDeleteMasteryTargetId(null)}
                            >
                                {t('common.cancel')}
                            </button>
                            <button type="button" className="btn btn-danger" onClick={confirmDeleteMasteryTarget}>
                                {t('common.delete')}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Role-switch password dialog */}
            {showPinDialog && (
                <Modal
                    titleId="pin-dialog-title"
                    onClose={() => {
                        setShowPinDialog(false);
                        setPinInput('');
                        setPinError(false);
                    }}
                    maxWidth={380}
                >
                    <div className="modal-header">
                        <h3 id="pin-dialog-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Shield size={16} style={{ color: 'var(--accent)' }} aria-hidden="true" /> Switch to
                            Administrator
                        </h3>
                        <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => {
                                setShowPinDialog(false);
                                setPinInput('');
                                setPinError(false);
                            }}
                            aria-label="Close"
                        >
                            ✕
                        </button>
                    </div>
                    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <p className="text-muted text-sm" style={{ margin: 0 }}>
                            Enter the admin password to switch to the Administrator role.
                        </p>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label htmlFor="pin-dialog-input">Admin password</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    id="pin-dialog-input"
                                    type={showPin ? 'text' : 'password'}
                                    value={pinInput}
                                    onChange={(e) => {
                                        setPinInput(e.target.value);
                                        setPinError(false);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') confirmPinAndSwitch();
                                    }}
                                    aria-invalid={pinError ? 'true' : undefined}
                                    aria-describedby={pinError ? 'pin-error' : undefined}
                                    style={{ flex: 1 }}
                                    autoFocus
                                />
                                <button
                                    className="btn btn-ghost btn-icon btn-sm"
                                    onClick={() => setShowPin((p) => !p)}
                                    aria-label={showPin ? 'Hide password' : 'Show password'}
                                >
                                    {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </div>
                            {pinError && (
                                <div id="pin-error" className="text-xs" style={{ color: 'var(--red)', marginTop: 4 }}>
                                    Incorrect password. Please try again.
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button
                                className="btn btn-ghost"
                                onClick={() => {
                                    setShowPinDialog(false);
                                    setPinInput('');
                                    setPinError(false);
                                }}
                            >
                                Cancel
                            </button>
                            <button className="btn btn-primary" onClick={() => void confirmPinAndSwitch()}>
                                <Shield size={14} aria-hidden="true" /> Confirm
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
