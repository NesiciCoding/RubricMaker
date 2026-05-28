import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import {
    Save,
    Plus,
    Trash2,
    Download,
    Upload,
    Key,
    ExternalLink,
    AlertCircle,
    MessageSquare,
    Globe,
    Layout,
    Star,
    Cloud,
    LogIn,
    LogOut,
    RefreshCw,
    PlayCircle,
    Database,
    Wifi,
    WifiOff,
    Copy,
    Check,
    Shield,
    Lock,
    User,
    GraduationCap,
    BookOpen,
    Settings,
    Eye,
    EyeOff,
    ChevronDown,
    ChevronUp,
    UserMinus,
    Share2,
} from 'lucide-react';
import CommentBankModal from '../components/Comments/CommentBankModal';
import TemplateUploadModal from '../components/Rubric/TemplateUploadModal';
import Modal from '../components/ui/Modal';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import { useDbStatus } from '../hooks/useDbStatus';
import type { GradeScale, GradeRange, UserRole } from '../types';
import { exportFullBackup } from '../store/storage';
import { loadSupabaseConfig, storageSync } from '../services/database';
import { hashPin, verifyPin, isHashed } from '../utils/pinHash';
import LoginButtons from '../components/auth/LoginButtons';

type Tab = 'general' | 'teaching' | 'administration';

// ─── Role helpers ──────────────────────────────────────────────────────────────

const ROLE_META: Record<UserRole, { label: string; icon: React.ReactNode; badgeClass: string; description: string }> = {
    admin: {
        label: 'Administrator',
        icon: <Shield size={13} />,
        badgeClass: 'role-badge-admin',
        description: 'Full access to all settings including database, integrations, and backup/restore.',
    },
    user: {
        label: 'Teacher',
        icon: <User size={13} />,
        badgeClass: 'role-badge-user',
        description: 'Access to teaching tools: grade scales, comment bank, templates, and display settings.',
    },
    student: {
        label: 'Student',
        icon: <GraduationCap size={13} />,
        badgeClass: 'role-badge-student',
        description: 'Access to display preferences and language only.',
    },
};

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
        classes,
        connectDatabase,
        disconnectDatabase,
        pushAllToDatabase,
        pullFromDatabase,
        fetchAllUsers,
        updateUserRole,
        updateMyProfile,
        connectForOAuth,
        signOutFromDatabase,
        importBackup,
    } = useApp();
    const { showToast } = useToast();
    const dbStatus = useDbStatus();

    // ─── Role state ─────────────────────────────────────────────────────────────
    const role: UserRole = settings.userRole ?? 'admin';
    const isAdmin = role === 'admin';
    const isUserPlus = role === 'admin' || role === 'user'; // teaching features

    const [activeTab, setActiveTab] = useState<Tab>('general');

    // Downgrade active tab when role changes to one that can't see it
    useEffect(() => {
        if (!isUserPlus && activeTab !== 'general') setActiveTab('general');
    }, [isUserPlus, activeTab]);

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
    const [showCommentBank, setShowCommentBank] = useState(false);
    const [showTemplateUpload, setShowTemplateUpload] = useState(false);
    const [accentInput, setAccentInput] = useState(settings.accentColor || '#3b82f6');
    const [accentError, setAccentError] = useState(false);

    // DB connection form state
    const existingConfig = loadSupabaseConfig();
    const [dbUrl, setDbUrl] = useState(existingConfig?.supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL ?? '');
    const [dbKey, setDbKey] = useState(existingConfig?.supabaseAnonKey ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');
    const [dbConnecting, setDbConnecting] = useState(false);
    const [dbSyncing, setDbSyncing] = useState(false);
    const [dbEmail, setDbEmail] = useState('');
    const [dbOtp, setDbOtp] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [userIdCopied, setUserIdCopied] = useState(false);
    const [supabaseReady, setSupabaseReady] = useState(!!existingConfig);
    const [showAdvancedConnect, setShowAdvancedConnect] = useState(!existingConfig);
    const [shareRubricId, setShareRubricId] = useState('');
    const [shareTargetUser, setShareTargetUser] = useState('');
    const [shareMode, setShareMode] = useState<'read' | 'edit'>('read');
    const [rubricShares, setRubricShares] = useState<{ userId: string; email?: string; displayName?: string; mode: 'read' | 'edit' }[]>([]);
    const [loadingRubricShares, setLoadingRubricShares] = useState(false);
    const [shareClassId, setShareClassId] = useState('');
    const [shareClassTargetUser, setShareClassTargetUser] = useState('');
    const [shareClassRole, setShareClassRole] = useState<'viewer' | 'editor'>('viewer');
    const [classMembers, setClassMembers] = useState<{ userId: string; email?: string; displayName?: string; role: 'viewer' | 'editor' }[]>([]);
    const [loadingClassMembers, setLoadingClassMembers] = useState(false);

    // ─── Profile / user management state ────────────────────────────────────────
    const [displayNameInput, setDisplayNameInput] = useState(dbStatus.currentUser?.displayName ?? '');
    const [savingDisplayName, setSavingDisplayName] = useState(false);
    const [allDbUsers, setAllDbUsers] = useState<import('../services/database').DbUser[]>([]);
    const [userRoleChanges, setUserRoleChanges] = useState<Record<string, 'admin' | 'user' | 'student'>>({});
    const [savingRoles, setSavingRoles] = useState<Record<string, boolean>>({});
    const [loadingUsers, setLoadingUsers] = useState(false);

    useEffect(() => {
        if (!dbStatus.isConnected || !isAdmin) return;
        setLoadingUsers(true);
        fetchAllUsers()
            .then((users) => {
                setAllDbUsers(users);
                const initial: Record<string, 'admin' | 'user' | 'student'> = {};
                users.forEach((u) => {
                    initial[u.id] = u.role;
                });
                setUserRoleChanges(initial);
            })
            .finally(() => setLoadingUsers(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dbStatus.isConnected, isAdmin]);

    useEffect(() => {
        if (!shareRubricId || !dbStatus.isConnected) { setRubricShares([]); return; }
        setLoadingRubricShares(true);
        storageSync.adapter.fetchRubricShares(shareRubricId)
            .then(setRubricShares)
            .finally(() => setLoadingRubricShares(false));
    }, [shareRubricId, dbStatus.isConnected]);

    useEffect(() => {
        if (!shareClassId || !dbStatus.isConnected) { setClassMembers([]); return; }
        setLoadingClassMembers(true);
        storageSync.adapter.fetchClassMembers(shareClassId)
            .then(setClassMembers)
            .finally(() => setLoadingClassMembers(false));
    }, [shareClassId, dbStatus.isConnected]);

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
        showToast(`Role changed to ${ROLE_META[newRole].label}`, 'success');
    }

    async function confirmPinAndSwitch() {
        const stored = settings.adminPin;
        if (!stored) return;
        const ok = await verifyPin(pinInput, stored);
        if (ok) {
            // Upgrade legacy plaintext PIN to hashed on first successful use
            if (!isHashed(stored)) updateSettings({ adminPin: await hashPin(pinInput) });
            setShowPinDialog(false);
            applyRoleSwitch(pendingRole!);
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
        reader.onload = async () => {
            const ok = await importBackup(reader.result as string);
            if (ok) showToast(t('toast.import_success'), 'success');
            else showToast(t('toast.import_error'), 'error');
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    function handleAccentChange(val: string) {
        setAccentInput(val);
        const valid = /^#[0-9A-Fa-f]{6}$/.test(val);
        setAccentError(!valid);
        if (valid) updateSettings({ accentColor: val });
    }

    function confirmDeleteScale() {
        if (!deleteScaleId) return;
        deleteGradeScale(deleteScaleId);
        setDeleteScaleId(null);
        if (editingScaleId === deleteScaleId) setEditingScaleId(null);
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
                                    {ROLE_META[role].icon} {ROLE_META[role].label}
                                </span>
                            </div>

                            <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
                                {ROLE_META[role].description}
                            </p>

                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {(['admin', 'user', 'student'] as UserRole[]).map((r) => (
                                    <button
                                        key={r}
                                        className={`btn btn-sm ${role === r ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => requestRoleSwitch(r)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                                    >
                                        {r === 'admin' && <Shield size={13} aria-hidden="true" />}
                                        {r === 'user' && <User size={13} aria-hidden="true" />}
                                        {r === 'student' && <GraduationCap size={13} aria-hidden="true" />}
                                        {ROLE_META[r].label}
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
                                                value={/^#[0-9A-Fa-f]{6}$/.test(accentInput) ? accentInput : '#3b82f6'}
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
                                </select>
                            </div>
                            <p className="text-muted text-sm" style={{ marginTop: 12 }}>
                                {t('settings.language_help')}
                            </p>
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
                                    {exportTemplates.map((tmpl) => (
                                        <div
                                            key={tmpl.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 12,
                                                background: 'var(--bg-elevated)',
                                                borderRadius: 10,
                                                padding: '12px 16px',
                                                border:
                                                    settings.exportTemplateId === tmpl.id
                                                        ? '1.5px solid var(--accent)'
                                                        : '1px solid var(--border)',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: 32,
                                                    height: 32,
                                                    borderRadius: 8,
                                                    background: tmpl.headerColor ?? '#1e3a5f',
                                                    flexShrink: 0,
                                                }}
                                            />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{tmpl.name}</div>
                                                <div
                                                    style={{
                                                        fontSize: '0.78rem',
                                                        color: 'var(--text-muted)',
                                                        marginTop: 2,
                                                    }}
                                                >
                                                    {tmpl.levelHeaders.length > 0
                                                        ? tmpl.levelHeaders.join(' · ')
                                                        : t('settings.no_level_headers')}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button
                                                    className={`btn btn-sm ${settings.exportTemplateId === tmpl.id ? 'btn-primary' : 'btn-ghost'}`}
                                                    onClick={() =>
                                                        updateSettings({
                                                            exportTemplateId:
                                                                settings.exportTemplateId === tmpl.id
                                                                    ? undefined
                                                                    : tmpl.id,
                                                        })
                                                    }
                                                >
                                                    <Star size={13} aria-hidden="true" />
                                                    {settings.exportTemplateId === tmpl.id
                                                        ? t('settings.label_default')
                                                        : t('settings.action_set_default')}
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-icon btn-sm"
                                                    style={{ color: 'var(--red)' }}
                                                    onClick={() => {
                                                        deleteExportTemplate(tmpl.id);
                                                        if (settings.exportTemplateId === tmpl.id)
                                                            updateSettings({ exportTemplateId: undefined });
                                                    }}
                                                >
                                                    <Trash2 size={14} aria-hidden="true" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
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
                                                                setPendingRole('admin');
                                                                confirmPinAndSwitch();
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
                                                onClick={() => {
                                                    setPendingRole('admin');
                                                    confirmPinAndSwitch();
                                                }}
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
                                {/* Standards Integration */}
                                <div
                                    className="card"
                                    style={{ marginBottom: 24, borderLeft: '4px solid var(--accent)' }}
                                >
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                                        <Key size={20} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                                        <h3 style={{ margin: 0 }}>{t('settings.standards_integration')}</h3>
                                    </div>
                                    <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
                                        <Trans i18nKey="settings.standards_help_1">
                                            To link standards (CCSS, NGSS, etc.) from the{' '}
                                            <strong>Common Standards Project</strong>, you need a free API key.
                                        </Trans>
                                    </p>
                                    <div className="form-group">
                                        <label htmlFor="setting-standards-key">{t('settings.standards_api_key')}</label>
                                        <input
                                            id="setting-standards-key"
                                            type="password"
                                            value={settings.standardsApiKey ?? ''}
                                            onChange={(e) => updateSettings({ standardsApiKey: e.target.value })}
                                            placeholder={t('settings.standards_api_placeholder')}
                                            autoComplete="off"
                                        />
                                    </div>
                                    <div
                                        style={{
                                            marginTop: 16,
                                            background: 'var(--bg-elevated)',
                                            padding: 12,
                                            borderRadius: 8,
                                            fontSize: '0.85rem',
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontWeight: 600,
                                                marginBottom: 8,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                            }}
                                        >
                                            <AlertCircle size={14} aria-hidden="true" />{' '}
                                            {t('settings.standards_setup_instructions')}
                                        </div>
                                        <ol style={{ paddingLeft: 20, margin: 0, lineHeight: 1.6 }}>
                                            <li>
                                                {t('settings.standards_setup_1')}{' '}
                                                <a
                                                    href="https://commonstandardsproject.com/developers"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{ color: 'var(--accent)' }}
                                                >
                                                    commonstandardsproject.com/developers <ExternalLink size={10} />
                                                </a>
                                            </li>
                                            <li>{t('settings.standards_setup_2')}</li>
                                            <li>
                                                <Trans
                                                    i18nKey="settings.standards_setup_3"
                                                    values={{ origin: window.location.origin }}
                                                >
                                                    <strong>Important:</strong> Add this app's URL (
                                                    <code>{window.location.origin}</code>) to the{' '}
                                                    <strong>Allowed Origins</strong> list on their dashboard, or
                                                    requests will be blocked by CORS.
                                                </Trans>
                                            </li>
                                        </ol>
                                    </div>
                                </div>

                                {/* Database (Supabase) */}
                                <div
                                    className="card"
                                    style={{ marginBottom: 24, borderLeft: '4px solid var(--accent)' }}
                                >
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                                        <Database size={20} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                                        <h3 style={{ margin: 0 }}>Database (Supabase)</h3>
                                        <span
                                            style={{
                                                marginLeft: 'auto',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                fontSize: '0.8rem',
                                            }}
                                        >
                                            {dbStatus.isConnected ? (
                                                <>
                                                    <Wifi
                                                        size={14}
                                                        style={{ color: 'var(--green)' }}
                                                        aria-hidden="true"
                                                    />
                                                    <span style={{ color: 'var(--green)' }}>Connected</span>
                                                </>
                                            ) : (
                                                <>
                                                    <WifiOff
                                                        size={14}
                                                        style={{ color: 'var(--text-muted)' }}
                                                        aria-hidden="true"
                                                    />
                                                    <span style={{ color: 'var(--text-muted)' }}>Not connected</span>
                                                </>
                                            )}
                                        </span>
                                    </div>

                                    {dbStatus.isConnected ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                            <div
                                                style={{
                                                    background: 'var(--bg-elevated)',
                                                    borderRadius: 8,
                                                    padding: '12px 16px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: 8,
                                                }}
                                            >
                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    {dbStatus.lastSyncAt
                                                        ? `Last synced: ${new Date(dbStatus.lastSyncAt).toLocaleString()}`
                                                        : 'Not yet synced this session'}
                                                </div>
                                                {dbStatus.userId && (
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 8,
                                                            fontSize: '0.8rem',
                                                        }}
                                                    >
                                                        <span style={{ color: 'var(--text-muted)' }}>
                                                            Your user ID:
                                                        </span>
                                                        <code
                                                            style={{
                                                                background: 'var(--bg)',
                                                                padding: '2px 6px',
                                                                borderRadius: 4,
                                                                fontSize: '0.75rem',
                                                                maxWidth: 200,
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                        >
                                                            {dbStatus.userId}
                                                        </code>
                                                        <button
                                                            className="btn btn-ghost btn-icon btn-sm"
                                                            title="Copy user ID"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(dbStatus.userId!);
                                                                setUserIdCopied(true);
                                                                setTimeout(() => setUserIdCopied(false), 2000);
                                                            }}
                                                        >
                                                            {userIdCopied ? (
                                                                <Check size={12} aria-hidden="true" />
                                                            ) : (
                                                                <Copy size={12} aria-hidden="true" />
                                                            )}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Display name */}
                                            <div
                                                style={{
                                                    background: 'var(--bg-elevated)',
                                                    borderRadius: 8,
                                                    padding: '12px 16px',
                                                }}
                                            >
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>
                                                    Display name
                                                </div>
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <input
                                                        type="text"
                                                        value={displayNameInput}
                                                        onChange={(e) => setDisplayNameInput(e.target.value)}
                                                        placeholder="Your name (visible to colleagues)"
                                                        style={{ flex: 1 }}
                                                    />
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        disabled={savingDisplayName}
                                                        onClick={async () => {
                                                            setSavingDisplayName(true);
                                                            const result = await updateMyProfile({
                                                                displayName: displayNameInput.trim() || undefined,
                                                            });
                                                            setSavingDisplayName(false);
                                                            showToast(
                                                                result.success
                                                                    ? 'Display name saved'
                                                                    : `Error: ${result.error}`,
                                                                result.success ? 'success' : 'error'
                                                            );
                                                        }}
                                                    >
                                                        <Save size={13} aria-hidden="true" />{' '}
                                                        {savingDisplayName ? 'Saving…' : 'Save'}
                                                    </button>
                                                </div>
                                            </div>

                                            {!dbStatus.currentUser?.email && (
                                                <div
                                                    style={{
                                                        background: 'var(--bg-elevated)',
                                                        borderRadius: 8,
                                                        padding: '12px 16px',
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            fontSize: '0.85rem',
                                                            fontWeight: 600,
                                                            marginBottom: 8,
                                                        }}
                                                    >
                                                        Sign in with email (to enable sharing)
                                                    </div>
                                                    {!otpSent ? (
                                                        <div style={{ display: 'flex', gap: 8 }}>
                                                            <input
                                                                type="email"
                                                                placeholder="your@email.com"
                                                                value={dbEmail}
                                                                onChange={(e) => setDbEmail(e.target.value)}
                                                                style={{ flex: 1 }}
                                                            />
                                                            <button
                                                                className="btn btn-secondary btn-sm"
                                                                onClick={async () => {
                                                                    const { error } =
                                                                        await storageSync.adapter.signInWithEmail(
                                                                            dbEmail
                                                                        );
                                                                    if (error) showToast(error, 'error');
                                                                    else {
                                                                        setOtpSent(true);
                                                                        showToast(
                                                                            'Check your email for a login code',
                                                                            'success'
                                                                        );
                                                                    }
                                                                }}
                                                            >
                                                                <LogIn size={14} aria-hidden="true" /> Send code
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', gap: 8 }}>
                                                            <input
                                                                type="text"
                                                                placeholder="Enter 6-digit code"
                                                                value={dbOtp}
                                                                onChange={(e) => setDbOtp(e.target.value)}
                                                                maxLength={6}
                                                                style={{ flex: 1 }}
                                                            />
                                                            <button
                                                                className="btn btn-primary btn-sm"
                                                                onClick={async () => {
                                                                    const { error } =
                                                                        await storageSync.adapter.verifyOtp(
                                                                            dbEmail,
                                                                            dbOtp
                                                                        );
                                                                    if (error) showToast(error, 'error');
                                                                    else {
                                                                        setOtpSent(false);
                                                                        setDbOtp('');
                                                                        showToast('Signed in successfully', 'success');
                                                                    }
                                                                }}
                                                            >
                                                                <Check size={14} aria-hidden="true" /> Verify
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                                <button
                                                    className="btn btn-secondary"
                                                    disabled={dbSyncing}
                                                    onClick={async () => {
                                                        setDbSyncing(true);
                                                        const result = await pushAllToDatabase();
                                                        setDbSyncing(false);
                                                        showToast(
                                                            result.success
                                                                ? 'All local data pushed to database'
                                                                : `Push failed: ${result.error}`,
                                                            result.success ? 'success' : 'error'
                                                        );
                                                    }}
                                                >
                                                    <Upload size={15} aria-hidden="true" />{' '}
                                                    {dbSyncing ? 'Pushing…' : 'Push local → database'}
                                                </button>
                                                <button
                                                    className="btn btn-secondary"
                                                    disabled={dbSyncing}
                                                    onClick={async () => {
                                                        if (
                                                            !confirm(
                                                                'This will overwrite your local data with the database. Continue?'
                                                            )
                                                        )
                                                            return;
                                                        setDbSyncing(true);
                                                        await pullFromDatabase();
                                                        setDbSyncing(false);
                                                        showToast('Data pulled from database', 'success');
                                                    }}
                                                >
                                                    <Download size={15} aria-hidden="true" /> Pull database → local
                                                </button>
                                                <button
                                                    className="btn btn-ghost"
                                                    style={{ marginLeft: 'auto' }}
                                                    onClick={async () => {
                                                        await signOutFromDatabase();
                                                        showToast('Signed out from database', 'info');
                                                    }}
                                                >
                                                    <LogOut size={14} aria-hidden="true" /> Sign out
                                                </button>
                                            </div>

                                            {dbStatus.userId && (
                                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
                                                    {/* ── Rubric sharing ── */}
                                                    <div>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <Share2 size={13} aria-hidden="true" />
                                                            {t('settings.sharing_rubric_title')}
                                                        </div>
                                                        {allDbUsers.filter((u) => u.id !== dbStatus.userId).length === 0 ? (
                                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('settings.sharing_no_users')}</p>
                                                        ) : (
                                                            <>
                                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                                                                    <select
                                                                        value={shareRubricId}
                                                                        onChange={(e) => { setShareRubricId(e.target.value); setShareTargetUser(''); }}
                                                                        style={{ flex: 2, minWidth: 140 }}
                                                                    >
                                                                        <option value="">{t('settings.sharing_select_rubric')}</option>
                                                                        {rubrics.map((r) => (
                                                                            <option key={r.id} value={r.id}>{r.name}</option>
                                                                        ))}
                                                                    </select>
                                                                    <select
                                                                        value={shareTargetUser}
                                                                        onChange={(e) => setShareTargetUser(e.target.value)}
                                                                        style={{ flex: 3, minWidth: 160 }}
                                                                        disabled={!shareRubricId}
                                                                    >
                                                                        <option value="">{t('settings.sharing_select_colleague')}</option>
                                                                        {allDbUsers
                                                                            .filter((u) => u.id !== dbStatus.userId && !rubricShares.some((s) => s.userId === u.id))
                                                                            .map((u) => (
                                                                                <option key={u.id} value={u.id}>
                                                                                    {u.displayName ?? u.email ?? u.id}
                                                                                </option>
                                                                            ))}
                                                                    </select>
                                                                    <select
                                                                        value={shareMode}
                                                                        onChange={(e) => setShareMode(e.target.value as 'read' | 'edit')}
                                                                        style={{ width: 110 }}
                                                                        disabled={!shareRubricId}
                                                                    >
                                                                        <option value="read">{t('settings.sharing_mode_read')}</option>
                                                                        <option value="edit">{t('settings.sharing_mode_edit')}</option>
                                                                    </select>
                                                                    <button
                                                                        className="btn btn-primary btn-sm"
                                                                        disabled={!shareRubricId || !shareTargetUser}
                                                                        onClick={async () => {
                                                                            const result = await storageSync.adapter.shareRubric(shareRubricId, shareTargetUser, shareMode);
                                                                            if (result.success) {
                                                                                showToast(t('settings.sharing_success'), 'success');
                                                                                setShareTargetUser('');
                                                                                const updated = await storageSync.adapter.fetchRubricShares(shareRubricId);
                                                                                setRubricShares(updated);
                                                                            } else {
                                                                                showToast(t('settings.sharing_failed', { error: result.error }), 'error');
                                                                            }
                                                                        }}
                                                                    >
                                                                        {t('settings.sharing_btn_share')}
                                                                    </button>
                                                                </div>
                                                                {shareRubricId && (
                                                                    <div>
                                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>{t('settings.sharing_current')}</div>
                                                                        {loadingRubricShares ? (
                                                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>…</p>
                                                                        ) : rubricShares.length === 0 ? (
                                                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('settings.sharing_no_shares')}</p>
                                                                        ) : (
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                                {rubricShares.map((s) => (
                                                                                    <div key={s.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-elevated)', borderRadius: 6, border: '1px solid var(--border)' }}>
                                                                                        <User size={12} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                                                                        <span style={{ flex: 1, fontSize: '0.82rem' }}>{s.displayName ?? s.email ?? s.userId}</span>
                                                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.mode === 'edit' ? t('settings.sharing_mode_edit') : t('settings.sharing_mode_read')}</span>
                                                                                        <button
                                                                                            className="btn btn-ghost btn-icon btn-sm"
                                                                                            title={t('settings.sharing_btn_remove')}
                                                                                            onClick={async () => {
                                                                                                const result = await storageSync.adapter.unshareRubric(shareRubricId, s.userId);
                                                                                                if (result.success) {
                                                                                                    showToast(t('settings.sharing_removed'), 'success');
                                                                                                    setRubricShares((prev) => prev.filter((x) => x.userId !== s.userId));
                                                                                                }
                                                                                            }}
                                                                                        >
                                                                                            <UserMinus size={13} aria-hidden="true" />
                                                                                        </button>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>

                                                    {/* ── Class sharing ── */}
                                                    <div>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <Share2 size={13} aria-hidden="true" />
                                                            {t('settings.sharing_class_title')}
                                                        </div>
                                                        {allDbUsers.filter((u) => u.id !== dbStatus.userId).length === 0 ? (
                                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('settings.sharing_no_users')}</p>
                                                        ) : (
                                                            <>
                                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                                                                    <select
                                                                        value={shareClassId}
                                                                        onChange={(e) => { setShareClassId(e.target.value); setShareClassTargetUser(''); }}
                                                                        style={{ flex: 2, minWidth: 140 }}
                                                                    >
                                                                        <option value="">{t('settings.sharing_select_class')}</option>
                                                                        {classes.map((c) => (
                                                                            <option key={c.id} value={c.id}>{c.name}</option>
                                                                        ))}
                                                                    </select>
                                                                    <select
                                                                        value={shareClassTargetUser}
                                                                        onChange={(e) => setShareClassTargetUser(e.target.value)}
                                                                        style={{ flex: 3, minWidth: 160 }}
                                                                        disabled={!shareClassId}
                                                                    >
                                                                        <option value="">{t('settings.sharing_select_colleague')}</option>
                                                                        {allDbUsers
                                                                            .filter((u) => u.id !== dbStatus.userId && !classMembers.some((m) => m.userId === u.id))
                                                                            .map((u) => (
                                                                                <option key={u.id} value={u.id}>
                                                                                    {u.displayName ?? u.email ?? u.id}
                                                                                </option>
                                                                            ))}
                                                                    </select>
                                                                    <select
                                                                        value={shareClassRole}
                                                                        onChange={(e) => setShareClassRole(e.target.value as 'viewer' | 'editor')}
                                                                        style={{ width: 110 }}
                                                                        disabled={!shareClassId}
                                                                    >
                                                                        <option value="viewer">{t('settings.sharing_role_viewer')}</option>
                                                                        <option value="editor">{t('settings.sharing_role_editor')}</option>
                                                                    </select>
                                                                    <button
                                                                        className="btn btn-primary btn-sm"
                                                                        disabled={!shareClassId || !shareClassTargetUser}
                                                                        onClick={async () => {
                                                                            const result = await storageSync.adapter.addClassMember(shareClassId, shareClassTargetUser, shareClassRole);
                                                                            if (result.success) {
                                                                                showToast(t('settings.sharing_success'), 'success');
                                                                                setShareClassTargetUser('');
                                                                                const updated = await storageSync.adapter.fetchClassMembers(shareClassId);
                                                                                setClassMembers(updated);
                                                                            } else {
                                                                                showToast(t('settings.sharing_failed', { error: result.error }), 'error');
                                                                            }
                                                                        }}
                                                                    >
                                                                        {t('settings.sharing_btn_share')}
                                                                    </button>
                                                                </div>
                                                                {shareClassId && (
                                                                    <div>
                                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>{t('settings.sharing_class_members')}</div>
                                                                        {loadingClassMembers ? (
                                                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>…</p>
                                                                        ) : classMembers.length === 0 ? (
                                                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('settings.sharing_no_members')}</p>
                                                                        ) : (
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                                {classMembers.map((m) => (
                                                                                    <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-elevated)', borderRadius: 6, border: '1px solid var(--border)' }}>
                                                                                        <User size={12} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                                                                        <span style={{ flex: 1, fontSize: '0.82rem' }}>{m.displayName ?? m.email ?? m.userId}</span>
                                                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.role === 'editor' ? t('settings.sharing_role_editor') : t('settings.sharing_role_viewer')}</span>
                                                                                        <button
                                                                                            className="btn btn-ghost btn-icon btn-sm"
                                                                                            title={t('settings.sharing_btn_remove')}
                                                                                            onClick={async () => {
                                                                                                const result = await storageSync.adapter.removeClassMember(shareClassId, m.userId);
                                                                                                if (result.success) {
                                                                                                    showToast(t('settings.sharing_removed'), 'success');
                                                                                                    setClassMembers((prev) => prev.filter((x) => x.userId !== m.userId));
                                                                                                }
                                                                                            }}
                                                                                        >
                                                                                            <UserMinus size={13} aria-hidden="true" />
                                                                                        </button>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Admin: user management */}
                                            {isAdmin && (
                                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 8,
                                                            marginBottom: 10,
                                                        }}
                                                    >
                                                        <Shield
                                                            size={14}
                                                            style={{ color: 'var(--accent)' }}
                                                            aria-hidden="true"
                                                        />
                                                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                                            User management
                                                        </span>
                                                        <button
                                                            className="btn btn-ghost btn-icon btn-sm"
                                                            title="Refresh user list"
                                                            disabled={loadingUsers}
                                                            onClick={async () => {
                                                                setLoadingUsers(true);
                                                                const users = await fetchAllUsers();
                                                                setAllDbUsers(users);
                                                                const roles: Record<
                                                                    string,
                                                                    'admin' | 'user' | 'student'
                                                                > = {};
                                                                users.forEach((u) => {
                                                                    roles[u.id] = u.role;
                                                                });
                                                                setUserRoleChanges(roles);
                                                                setLoadingUsers(false);
                                                            }}
                                                        >
                                                            <RefreshCw size={12} aria-hidden="true" />
                                                        </button>
                                                    </div>
                                                    {loadingUsers ? (
                                                        <p className="text-muted text-sm" style={{ margin: 0 }}>
                                                            Loading users…
                                                        </p>
                                                    ) : allDbUsers.length === 0 ? (
                                                        <p className="text-muted text-sm" style={{ margin: 0 }}>
                                                            No users found.
                                                        </p>
                                                    ) : (
                                                        <div
                                                            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                                                        >
                                                            {allDbUsers.map((u) => {
                                                                const isMe = u.id === dbStatus.userId;
                                                                const isSaving = savingRoles[u.id];
                                                                const pendingRole = userRoleChanges[u.id] ?? u.role;
                                                                const changed = pendingRole !== u.role;
                                                                return (
                                                                    <div
                                                                        key={u.id}
                                                                        style={{
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: 8,
                                                                            background: 'var(--bg-elevated)',
                                                                            borderRadius: 6,
                                                                            padding: '8px 10px',
                                                                        }}
                                                                    >
                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                            <div
                                                                                style={{
                                                                                    fontSize: '0.85rem',
                                                                                    fontWeight: u.displayName
                                                                                        ? 600
                                                                                        : 400,
                                                                                    color: u.displayName
                                                                                        ? undefined
                                                                                        : 'var(--text-muted)',
                                                                                    overflow: 'hidden',
                                                                                    textOverflow: 'ellipsis',
                                                                                    whiteSpace: 'nowrap',
                                                                                }}
                                                                            >
                                                                                {u.displayName || 'Anonymous'}
                                                                                {isMe && (
                                                                                    <span
                                                                                        style={{
                                                                                            marginLeft: 6,
                                                                                            fontSize: '0.7rem',
                                                                                            color: 'var(--accent)',
                                                                                            fontWeight: 400,
                                                                                        }}
                                                                                    >
                                                                                        (you)
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            {u.email && (
                                                                                <div
                                                                                    style={{
                                                                                        fontSize: '0.75rem',
                                                                                        color: 'var(--text-muted)',
                                                                                        overflow: 'hidden',
                                                                                        textOverflow: 'ellipsis',
                                                                                        whiteSpace: 'nowrap',
                                                                                    }}
                                                                                >
                                                                                    {u.email}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <select
                                                                            value={pendingRole}
                                                                            disabled={isMe || isSaving}
                                                                            title={
                                                                                isMe
                                                                                    ? 'Cannot change your own role'
                                                                                    : undefined
                                                                            }
                                                                            onChange={(e) =>
                                                                                setUserRoleChanges((prev) => ({
                                                                                    ...prev,
                                                                                    [u.id]: e.target.value as
                                                                                        | 'admin'
                                                                                        | 'user'
                                                                                        | 'student',
                                                                                }))
                                                                            }
                                                                            style={{ width: 110, fontSize: '0.8rem' }}
                                                                        >
                                                                            <option value="admin">Administrator</option>
                                                                            <option value="user">Teacher</option>
                                                                            <option value="student">Student</option>
                                                                        </select>
                                                                        {!isMe && (
                                                                            <button
                                                                                className="btn btn-primary btn-sm"
                                                                                disabled={!changed || isSaving}
                                                                                onClick={async () => {
                                                                                    setSavingRoles((prev) => ({
                                                                                        ...prev,
                                                                                        [u.id]: true,
                                                                                    }));
                                                                                    const result = await updateUserRole(
                                                                                        u.id,
                                                                                        pendingRole
                                                                                    );
                                                                                    setSavingRoles((prev) => ({
                                                                                        ...prev,
                                                                                        [u.id]: false,
                                                                                    }));
                                                                                    if (result.success) {
                                                                                        setAllDbUsers((prev) =>
                                                                                            prev.map((x) =>
                                                                                                x.id === u.id
                                                                                                    ? {
                                                                                                          ...x,
                                                                                                          role: pendingRole,
                                                                                                      }
                                                                                                    : x
                                                                                            )
                                                                                        );
                                                                                        showToast(
                                                                                            'Role updated',
                                                                                            'success'
                                                                                        );
                                                                                    } else {
                                                                                        showToast(
                                                                                            `Error: ${result.error}`,
                                                                                            'error'
                                                                                        );
                                                                                    }
                                                                                }}
                                                                            >
                                                                                {isSaving ? 'Saving…' : 'Save'}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    style={{ color: 'var(--red)', fontSize: '0.8rem' }}
                                                    onClick={async () => {
                                                        if (
                                                            !confirm(
                                                                'This will permanently delete ALL your data from the database. Your local data is not affected. Continue?'
                                                            )
                                                        )
                                                            return;
                                                        const result = await storageSync.adapter.deleteAllMyData();
                                                        showToast(
                                                            result.success
                                                                ? 'All database data deleted'
                                                                : `Error: ${result.error}`,
                                                            result.success ? 'success' : 'error'
                                                        );
                                                    }}
                                                >
                                                    <Trash2 size={13} aria-hidden="true" /> Delete all my database data
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                            <p className="text-muted text-sm" style={{ margin: 0 }}>
                                                Sign in to sync your data across devices and share with colleagues.
                                            </p>

                                            <LoginButtons
                                                supabaseReady={supabaseReady}
                                                onNeedConfig={() => setShowAdvancedConnect(true)}
                                                onEmailSuccess={() =>
                                                    showToast('Signed in — reconnect to sync', 'success')
                                                }
                                            />

                                            {/* Advanced / self-hosted */}
                                            <div>
                                                <button
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                        background: 'none',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        color: 'var(--text-muted)',
                                                        fontSize: '0.8rem',
                                                        padding: '2px 0',
                                                    }}
                                                    onClick={() => setShowAdvancedConnect((o) => !o)}
                                                >
                                                    {showAdvancedConnect ? (
                                                        <ChevronUp size={13} />
                                                    ) : (
                                                        <ChevronDown size={13} />
                                                    )}
                                                    Self-hosted / advanced (manual connection)
                                                </button>
                                                {showAdvancedConnect && (
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: 10,
                                                            marginTop: 10,
                                                        }}
                                                    >
                                                        <p className="text-muted text-sm" style={{ margin: 0 }}>
                                                            Run <code>supabase start</code> locally or use a custom
                                                            project at{' '}
                                                            <a
                                                                href="https://supabase.com"
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                style={{ color: 'var(--accent)' }}
                                                            >
                                                                supabase.com <ExternalLink size={10} />
                                                            </a>
                                                            .
                                                        </p>
                                                        <div className="form-group">
                                                            <label>Supabase URL</label>
                                                            <input
                                                                type="text"
                                                                value={dbUrl}
                                                                onChange={(e) => setDbUrl(e.target.value)}
                                                                placeholder="https://your-project.supabase.co"
                                                            />
                                                        </div>
                                                        <div className="form-group">
                                                            <label>Anon key</label>
                                                            <input
                                                                type="password"
                                                                value={dbKey}
                                                                onChange={(e) => setDbKey(e.target.value)}
                                                                placeholder="eyJhbGciOi…"
                                                                autoComplete="off"
                                                            />
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 8 }}>
                                                            <button
                                                                className="btn btn-secondary btn-sm"
                                                                disabled={!dbUrl || !dbKey || dbConnecting}
                                                                onClick={async () => {
                                                                    setDbConnecting(true);
                                                                    const ok = await connectForOAuth({
                                                                        supabaseUrl: dbUrl,
                                                                        supabaseAnonKey: dbKey,
                                                                    });
                                                                    setDbConnecting(false);
                                                                    if (ok) {
                                                                        setSupabaseReady(true);
                                                                        setShowAdvancedConnect(false);
                                                                        showToast(
                                                                            'Supabase configured — sign in above',
                                                                            'success'
                                                                        );
                                                                    } else
                                                                        showToast(
                                                                            'Connection failed — check URL and key',
                                                                            'error'
                                                                        );
                                                                }}
                                                            >
                                                                {dbConnecting ? (
                                                                    <>
                                                                        <RefreshCw size={13} className="spin" />{' '}
                                                                        Connecting…
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Database size={13} /> Set Supabase instance
                                                                    </>
                                                                )}
                                                            </button>
                                                            <button
                                                                className="btn btn-primary btn-sm"
                                                                disabled={!dbUrl || !dbKey || dbConnecting}
                                                                onClick={async () => {
                                                                    setDbConnecting(true);
                                                                    const ok = await connectDatabase({
                                                                        supabaseUrl: dbUrl,
                                                                        supabaseAnonKey: dbKey,
                                                                    });
                                                                    setDbConnecting(false);
                                                                    showToast(
                                                                        ok
                                                                            ? 'Connected to database'
                                                                            : 'Connection failed — check URL and key',
                                                                        ok ? 'success' : 'error'
                                                                    );
                                                                }}
                                                            >
                                                                {dbConnecting ? (
                                                                    <>
                                                                        <RefreshCw size={13} className="spin" />{' '}
                                                                        Connecting…
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Database size={13} /> Connect &amp; Sync
                                                                        (anonymous)
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
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
                                        {(['admin', 'user', 'student'] as UserRole[]).map((r) => (
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
                                                    {ROLE_META[r].icon} {ROLE_META[r].label}
                                                </span>
                                                <p className="text-muted text-sm" style={{ margin: 0 }}>
                                                    {ROLE_META[r].description}
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
            {showTemplateUpload && (
                <TemplateUploadModal
                    onClose={() => setShowTemplateUpload(false)}
                    onSave={(tmpl) => {
                        addExportTemplate(tmpl);
                        setShowTemplateUpload(false);
                    }}
                />
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
                            <button className="btn btn-primary" onClick={confirmPinAndSwitch}>
                                <Shield size={14} aria-hidden="true" /> Confirm
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
