import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import {
    Users,
    School,
    Database,
    Clock,
    Loader,
    Plus,
    Trash2,
    ChevronDown,
    ChevronUp,
    Key,
    Save,
    Upload,
    Download,
    Wifi,
    WifiOff,
    Check,
    Copy,
    Share2,
    User,
    RefreshCw,
    LogIn,
    LogOut,
    ExternalLink,
    AlertCircle,
    UserMinus,
    Plug,
} from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import { useDbStatus } from '../hooks/useDbStatus';
import { loadSupabaseConfig, storageSync } from '../services/database';
import LoginButtons from '../components/auth/LoginButtons';
import type { DbUser } from '../services/database/types';
import type { School as SchoolType, RubricShare, ClassMember } from '../types';

type Tab = 'users' | 'schools' | 'database' | 'integrations' | 'data' | 'retention';

// ─── Users tab ───────────────────────────────────────────────────────────────

function UsersTab() {
    const { t } = useTranslation();
    const { fetchAllUsers, updateUserRole, getCurrentDatabaseUserId } = useApp();
    const { showToast } = useToast();
    const [users, setUsers] = useState<DbUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [currentUserId] = useState<string | null>(() => getCurrentDatabaseUserId());

    useEffect(() => {
        fetchAllUsers().then((u) => {
            setUsers(u);
            setLoading(false);
        });
    }, [fetchAllUsers]);

    async function handleRoleChange(userId: string, newRole: 'admin' | 'user' | 'student') {
        setSaving(userId);
        const result = await updateUserRole(userId, newRole);
        if (result.success) {
            setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
        } else {
            showToast(result.error ?? 'Error', 'error');
        }
        setSaving(null);
    }

    if (loading) return <p style={{ color: 'var(--text-muted)' }}>{t('admin.users_loading')}</p>;
    if (users.length === 0) return <p style={{ color: 'var(--text-muted)' }}>{t('admin.users_empty')}</p>;

    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['col_email', 'col_name', 'col_role'].map((k) => (
                            <th
                                key={k}
                                style={{
                                    padding: '8px 12px',
                                    textAlign: 'left',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    color: 'var(--text-muted)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em',
                                }}
                            >
                                {t(`admin.${k}`)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {users.map((u) => (
                        <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 12px', fontSize: '0.875rem', color: 'var(--text)' }}>
                                {u.email ?? '—'}
                            </td>
                            <td style={{ padding: '10px 12px', fontSize: '0.875rem', color: 'var(--text)' }}>
                                {u.displayName ?? '—'}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                                {saving === u.id ? (
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        {t('admin.role_saving')}
                                    </span>
                                ) : (
                                    <select
                                        className="input"
                                        style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                                        value={u.role}
                                        disabled={u.id === currentUserId}
                                        onChange={(e) =>
                                            handleRoleChange(u.id, e.target.value as 'admin' | 'user' | 'student')
                                        }
                                    >
                                        <option value="admin">{t('admin.role_admin')}</option>
                                        <option value="user">{t('admin.role_user')}</option>
                                        <option value="student">{t('admin.role_student')}</option>
                                    </select>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Schools tab ──────────────────────────────────────────────────────────────

function SchoolsTab() {
    const { t } = useTranslation();
    const { fetchSchools, createSchool, updateSchool, deleteSchool, fetchSchoolMembers, removeSchoolMember } = useApp();
    const [schools, setSchools] = useState<SchoolType[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedSchool, setExpandedSchool] = useState<string | null>(null);
    const [members, setMembers] = useState<Record<string, (DbUser & { joinedAt: string })[]>>({});
    const [newName, setNewName] = useState('');
    const [newRetention, setNewRetention] = useState(3);
    const [creating, setCreating] = useState(false);
    const [editRetention, setEditRetention] = useState<Record<string, number>>({});

    const load = useCallback(async () => {
        const list = await fetchSchools();
        setSchools(list);
        setLoading(false);
    }, [fetchSchools]);

    useEffect(() => {
        load();
    }, [load]);

    async function handleCreate() {
        if (!newName.trim()) return;
        const retention = Math.round(newRetention);
        if (!Number.isFinite(retention) || retention < 1 || retention > 20) return;
        setCreating(true);
        const s = await createSchool(newName.trim(), retention);
        if (s) {
            setNewName('');
            setNewRetention(3);
            await load();
        }
        setCreating(false);
    }

    async function handleUpdateRetention(schoolId: string) {
        const years = editRetention[schoolId];
        if (!years || !Number.isFinite(years) || years < 1 || years > 20) return;
        await updateSchool(schoolId, { retentionYears: Math.round(years) });
        await load();
    }

    async function handleDelete(schoolId: string) {
        if (!window.confirm(t('admin.btn_delete_confirm'))) return;
        await deleteSchool(schoolId);
        await load();
    }

    async function handleExpand(schoolId: string) {
        if (expandedSchool === schoolId) {
            setExpandedSchool(null);
            return;
        }
        setExpandedSchool(schoolId);
        if (!members[schoolId]) {
            const m = await fetchSchoolMembers(schoolId);
            setMembers((prev) => ({ ...prev, [schoolId]: m }));
        }
    }

    async function handleRemoveMember(schoolId: string, profileId: string) {
        await removeSchoolMember(schoolId, profileId);
        const m = await fetchSchoolMembers(schoolId);
        setMembers((prev) => ({ ...prev, [schoolId]: m }));
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Create form */}
            <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                    <label
                        style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            display: 'block',
                            marginBottom: 4,
                        }}
                    >
                        {t('admin.school_name_label')}
                    </label>
                    <input
                        className="input"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder={t('admin.school_name_placeholder')}
                    />
                </div>
                <div style={{ flex: '0 0 120px' }}>
                    <label
                        style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            display: 'block',
                            marginBottom: 4,
                        }}
                    >
                        {t('admin.retention_label')}
                    </label>
                    <input
                        className="input"
                        type="number"
                        min={1}
                        max={20}
                        value={newRetention}
                        onChange={(e) => setNewRetention(Number(e.target.value))}
                    />
                </div>
                <button
                    className="btn btn-primary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={handleCreate}
                    disabled={creating || !newName.trim()}
                >
                    {creating ? <Loader size={13} className="spin" /> : <Plus size={13} />}
                    {creating ? t('admin.btn_creating') : t('admin.btn_create_school')}
                </button>
            </div>

            {loading && <p style={{ color: 'var(--text-muted)' }}>{t('admin.schools_loading')}</p>}
            {!loading && schools.length === 0 && (
                <p style={{ color: 'var(--text-muted)' }}>{t('admin.schools_empty')}</p>
            )}

            {schools.map((s) => (
                <div key={s.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                        <School size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.95rem' }}>{s.name}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                ID: <code style={{ fontFamily: 'monospace' }}>{s.id}</code>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                                className="input"
                                type="number"
                                min={1}
                                max={20}
                                style={{ width: 60, fontSize: '0.8rem', padding: '4px 8px' }}
                                defaultValue={s.retentionYears}
                                onChange={(e) =>
                                    setEditRetention((prev) => ({ ...prev, [s.id]: Number(e.target.value) }))
                                }
                                title={t('admin.retention_label')}
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {t('admin.retention_label').split(' ').pop()}
                            </span>
                            <button className="btn btn-secondary btn-sm" onClick={() => handleUpdateRetention(s.id)}>
                                {t('admin.btn_save')}
                            </button>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleExpand(s.id)}
                                aria-label={
                                    expandedSchool === s.id
                                        ? t('admin.btn_collapse_members')
                                        : t('admin.btn_expand_members')
                                }
                            >
                                {expandedSchool === s.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleDelete(s.id)}
                                aria-label={t('admin.btn_delete')}
                            >
                                <Trash2 size={13} style={{ color: '#dc2626' }} />
                            </button>
                        </div>
                    </div>

                    {expandedSchool === s.id && (
                        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                            <p
                                style={{
                                    margin: '12px 0 8px',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    color: 'var(--text-muted)',
                                }}
                            >
                                {t('admin.members_title', { school: s.name })}
                            </p>
                            {!members[s.id] && (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    {t('admin.members_loading')}
                                </p>
                            )}
                            {members[s.id]?.length === 0 && (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    {t('admin.members_empty')}
                                </p>
                            )}
                            {members[s.id]?.map((m) => (
                                <div
                                    key={m.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        padding: '6px 0',
                                        borderBottom: '1px solid var(--border)',
                                    }}
                                >
                                    <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text)' }}>
                                        {m.email ?? m.id}
                                    </span>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{m.role}</span>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => handleRemoveMember(s.id, m.id)}
                                    >
                                        {t('admin.btn_remove_member')}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

// ─── Database tab ─────────────────────────────────────────────────────────────

function DatabaseTab() {
    const { t } = useTranslation();
    const {
        connectDatabase,
        connectForOAuth,
        signOutFromDatabase,
        pushAllToDatabase,
        pullFromDatabase,
        updateMyProfile,
        fetchAllUsers,
        rubrics,
        classes,
    } = useApp();
    const { showToast } = useToast();
    const dbStatus = useDbStatus();

    const existingConfig = loadSupabaseConfig();
    const [dbUrl, setDbUrl] = useState(
        existingConfig?.supabaseUrl ?? (import.meta.env.VITE_SUPABASE_URL as string) ?? ''
    );
    const [dbKey, setDbKey] = useState(
        existingConfig?.supabaseAnonKey ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? ''
    );
    const [dbConnecting, setDbConnecting] = useState(false);
    const [supabaseReady, setSupabaseReady] = useState(!!existingConfig);
    const [showAdvancedConnect, setShowAdvancedConnect] = useState(!existingConfig);

    const [dbSyncing, setDbSyncing] = useState(false);
    const [displayNameInput, setDisplayNameInput] = useState(dbStatus.currentUser?.displayName ?? '');
    const [savingDisplayName, setSavingDisplayName] = useState(false);
    const [dbEmail, setDbEmail] = useState('');
    const [dbOtp, setDbOtp] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [userIdCopied, setUserIdCopied] = useState(false);

    // Rubric sharing
    const [shareRubricId, setShareRubricId] = useState('');
    const [shareTargetUser, setShareTargetUser] = useState('');
    const [shareMode, setShareMode] = useState<'read' | 'edit'>('read');
    const [rubricShares, setRubricShares] = useState<RubricShare[]>([]);
    const [loadingRubricShares, setLoadingRubricShares] = useState(false);
    const [allDbUsers, setAllDbUsers] = useState<DbUser[]>([]);

    // Class sharing
    const [shareClassId, setShareClassId] = useState('');
    const [shareClassTargetUser, setShareClassTargetUser] = useState('');
    const [shareClassRole, setShareClassRole] = useState<'viewer' | 'editor'>('viewer');
    const [classMembers, setClassMembers] = useState<ClassMember[]>([]);
    const [loadingClassMembers, setLoadingClassMembers] = useState(false);

    useEffect(() => {
        let cancelled = false;
        if (!shareRubricId || !dbStatus.isConnected) {
            setRubricShares([]);
            return;
        }
        setLoadingRubricShares(true);
        storageSync.adapter
            .fetchRubricShares(shareRubricId)
            .then((shares) => {
                if (!cancelled) setRubricShares(shares);
            })
            .finally(() => {
                if (!cancelled) setLoadingRubricShares(false);
            });
        return () => {
            cancelled = true;
        };
    }, [shareRubricId, dbStatus.isConnected]);

    useEffect(() => {
        let cancelled = false;
        if (!shareClassId || !dbStatus.isConnected) {
            setClassMembers([]);
            return;
        }
        setLoadingClassMembers(true);
        storageSync.adapter
            .fetchClassMembers(shareClassId)
            .then((members) => {
                if (!cancelled) setClassMembers(members);
            })
            .finally(() => {
                if (!cancelled) setLoadingClassMembers(false);
            });
        return () => {
            cancelled = true;
        };
    }, [shareClassId, dbStatus.isConnected]);

    useEffect(() => {
        if (!dbStatus.isConnected) return;
        fetchAllUsers()
            .then((users) => setAllDbUsers(users))
            .catch((err) => console.error('Failed to fetch users for sharing:', err));
    }, [dbStatus.isConnected, fetchAllUsers]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>
            {/* ── Connection status ── */}
            <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
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
                                <Wifi size={14} style={{ color: 'var(--green)' }} aria-hidden="true" />
                                <span style={{ color: 'var(--green)' }}>Connected</span>
                            </>
                        ) : (
                            <>
                                <WifiOff size={14} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                                <span style={{ color: 'var(--text-muted)' }}>Not connected</span>
                            </>
                        )}
                    </span>
                </div>

                {dbStatus.isConnected ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Sync info */}
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Your user ID:</span>
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
                        <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '12px 16px' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>Display name</div>
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
                                            result.success ? 'Display name saved' : `Error: ${result.error}`,
                                            result.success ? 'success' : 'error'
                                        );
                                    }}
                                >
                                    <Save size={13} aria-hidden="true" /> {savingDisplayName ? 'Saving…' : 'Save'}
                                </button>
                            </div>
                        </div>

                        {/* Sign in with email (for sharing) */}
                        {!dbStatus.currentUser?.email && (
                            <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '12px 16px' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>
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
                                                const { error } = await storageSync.adapter.signInWithEmail(dbEmail);
                                                if (error) showToast(error, 'error');
                                                else {
                                                    setOtpSent(true);
                                                    showToast('Check your email for a login code', 'success');
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
                                                const { error } = await storageSync.adapter.verifyOtp(dbEmail, dbOtp);
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

                        {/* Push / Pull / Sign out */}
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
                                    if (!confirm('This will overwrite your local data with the database. Continue?'))
                                        return;
                                    setDbSyncing(true);
                                    try {
                                        await pullFromDatabase();
                                    } finally {
                                        setDbSyncing(false);
                                    }
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

                        {/* Sharing — only visible when signed in with a real (email-backed) account */}
                        {dbStatus.currentUser?.email && (
                            <div
                                style={{
                                    borderTop: '1px solid var(--border)',
                                    paddingTop: 16,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 20,
                                }}
                            >
                                {/* Rubric sharing */}
                                <div>
                                    <div
                                        style={{
                                            fontSize: '0.85rem',
                                            fontWeight: 600,
                                            marginBottom: 10,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                        }}
                                    >
                                        <Share2 size={13} aria-hidden="true" />
                                        {t('settings.sharing_rubric_title')}
                                    </div>
                                    {allDbUsers.filter((u) => u.id !== dbStatus.userId).length === 0 ? (
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {t('settings.sharing_no_users')}
                                        </p>
                                    ) : (
                                        <>
                                            <div
                                                style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}
                                            >
                                                <select
                                                    value={shareRubricId}
                                                    onChange={(e) => {
                                                        setShareRubricId(e.target.value);
                                                        setShareTargetUser('');
                                                    }}
                                                    style={{ flex: 2, minWidth: 140 }}
                                                >
                                                    <option value="">{t('settings.sharing_select_rubric')}</option>
                                                    {rubrics.map((r) => (
                                                        <option key={r.id} value={r.id}>
                                                            {r.name}
                                                        </option>
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
                                                        .filter(
                                                            (u) =>
                                                                u.id !== dbStatus.userId &&
                                                                !rubricShares.some((s) => s.userId === u.id)
                                                        )
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
                                                        const result = await storageSync.adapter.shareRubric(
                                                            shareRubricId,
                                                            shareTargetUser,
                                                            shareMode
                                                        );
                                                        if (result.success) {
                                                            showToast(t('settings.sharing_success'), 'success');
                                                            setShareTargetUser('');
                                                            const updated =
                                                                await storageSync.adapter.fetchRubricShares(
                                                                    shareRubricId
                                                                );
                                                            setRubricShares(updated);
                                                        } else {
                                                            showToast(
                                                                t('settings.sharing_failed', { error: result.error }),
                                                                'error'
                                                            );
                                                        }
                                                    }}
                                                >
                                                    {t('settings.sharing_btn_share')}
                                                </button>
                                            </div>
                                            {shareRubricId && (
                                                <div>
                                                    <div
                                                        style={{
                                                            fontSize: '0.75rem',
                                                            color: 'var(--text-muted)',
                                                            marginBottom: 6,
                                                        }}
                                                    >
                                                        {t('settings.sharing_current')}
                                                    </div>
                                                    {loadingRubricShares ? (
                                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                            …
                                                        </p>
                                                    ) : rubricShares.length === 0 ? (
                                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                            {t('settings.sharing_no_shares')}
                                                        </p>
                                                    ) : (
                                                        <div
                                                            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                                                        >
                                                            {rubricShares.map((s) => (
                                                                <div
                                                                    key={s.userId}
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: 8,
                                                                        padding: '6px 10px',
                                                                        background: 'var(--bg-elevated)',
                                                                        borderRadius: 6,
                                                                        border: '1px solid var(--border)',
                                                                    }}
                                                                >
                                                                    <User
                                                                        size={12}
                                                                        aria-hidden="true"
                                                                        style={{
                                                                            color: 'var(--text-muted)',
                                                                            flexShrink: 0,
                                                                        }}
                                                                    />
                                                                    <span style={{ flex: 1, fontSize: '0.82rem' }}>
                                                                        {s.displayName ?? s.email ?? s.userId}
                                                                    </span>
                                                                    <span
                                                                        style={{
                                                                            fontSize: '0.75rem',
                                                                            color: 'var(--text-muted)',
                                                                        }}
                                                                    >
                                                                        {s.mode === 'edit'
                                                                            ? t('settings.sharing_mode_edit')
                                                                            : t('settings.sharing_mode_read')}
                                                                    </span>
                                                                    <button
                                                                        className="btn btn-ghost btn-icon btn-sm"
                                                                        title={t('settings.sharing_btn_remove')}
                                                                        onClick={async () => {
                                                                            const result =
                                                                                await storageSync.adapter.unshareRubric(
                                                                                    shareRubricId,
                                                                                    s.userId
                                                                                );
                                                                            if (result.success) {
                                                                                showToast(
                                                                                    t('settings.sharing_removed'),
                                                                                    'success'
                                                                                );
                                                                                setRubricShares((prev) =>
                                                                                    prev.filter(
                                                                                        (x) => x.userId !== s.userId
                                                                                    )
                                                                                );
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

                                {/* Class sharing */}
                                <div>
                                    <div
                                        style={{
                                            fontSize: '0.85rem',
                                            fontWeight: 600,
                                            marginBottom: 10,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                        }}
                                    >
                                        <Share2 size={13} aria-hidden="true" />
                                        {t('settings.sharing_class_title')}
                                    </div>
                                    {allDbUsers.filter((u) => u.id !== dbStatus.userId).length === 0 ? (
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {t('settings.sharing_no_users')}
                                        </p>
                                    ) : (
                                        <>
                                            <div
                                                style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}
                                            >
                                                <select
                                                    value={shareClassId}
                                                    onChange={(e) => {
                                                        setShareClassId(e.target.value);
                                                        setShareClassTargetUser('');
                                                    }}
                                                    style={{ flex: 2, minWidth: 140 }}
                                                >
                                                    <option value="">{t('settings.sharing_select_class')}</option>
                                                    {classes.map((c) => (
                                                        <option key={c.id} value={c.id}>
                                                            {c.name}
                                                        </option>
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
                                                        .filter(
                                                            (u) =>
                                                                u.id !== dbStatus.userId &&
                                                                !classMembers.some((m) => m.userId === u.id)
                                                        )
                                                        .map((u) => (
                                                            <option key={u.id} value={u.id}>
                                                                {u.displayName ?? u.email ?? u.id}
                                                            </option>
                                                        ))}
                                                </select>
                                                <select
                                                    value={shareClassRole}
                                                    onChange={(e) =>
                                                        setShareClassRole(e.target.value as 'viewer' | 'editor')
                                                    }
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
                                                        const result = await storageSync.adapter.addClassMember(
                                                            shareClassId,
                                                            shareClassTargetUser,
                                                            shareClassRole
                                                        );
                                                        if (result.success) {
                                                            showToast(t('settings.sharing_success'), 'success');
                                                            setShareClassTargetUser('');
                                                            const updated =
                                                                await storageSync.adapter.fetchClassMembers(
                                                                    shareClassId
                                                                );
                                                            setClassMembers(updated);
                                                        } else {
                                                            showToast(
                                                                t('settings.sharing_failed', { error: result.error }),
                                                                'error'
                                                            );
                                                        }
                                                    }}
                                                >
                                                    {t('settings.sharing_btn_share')}
                                                </button>
                                            </div>
                                            {shareClassId && (
                                                <div>
                                                    <div
                                                        style={{
                                                            fontSize: '0.75rem',
                                                            color: 'var(--text-muted)',
                                                            marginBottom: 6,
                                                        }}
                                                    >
                                                        {t('settings.sharing_class_members')}
                                                    </div>
                                                    {loadingClassMembers ? (
                                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                            …
                                                        </p>
                                                    ) : classMembers.length === 0 ? (
                                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                            {t('settings.sharing_no_members')}
                                                        </p>
                                                    ) : (
                                                        <div
                                                            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                                                        >
                                                            {classMembers.map((m) => (
                                                                <div
                                                                    key={m.userId}
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: 8,
                                                                        padding: '6px 10px',
                                                                        background: 'var(--bg-elevated)',
                                                                        borderRadius: 6,
                                                                        border: '1px solid var(--border)',
                                                                    }}
                                                                >
                                                                    <User
                                                                        size={12}
                                                                        aria-hidden="true"
                                                                        style={{
                                                                            color: 'var(--text-muted)',
                                                                            flexShrink: 0,
                                                                        }}
                                                                    />
                                                                    <span style={{ flex: 1, fontSize: '0.82rem' }}>
                                                                        {m.displayName ?? m.email ?? m.userId}
                                                                    </span>
                                                                    <span
                                                                        style={{
                                                                            fontSize: '0.75rem',
                                                                            color: 'var(--text-muted)',
                                                                        }}
                                                                    >
                                                                        {m.role === 'editor'
                                                                            ? t('settings.sharing_role_editor')
                                                                            : t('settings.sharing_role_viewer')}
                                                                    </span>
                                                                    <button
                                                                        className="btn btn-ghost btn-icon btn-sm"
                                                                        title={t('settings.sharing_btn_remove')}
                                                                        onClick={async () => {
                                                                            const result =
                                                                                await storageSync.adapter.removeClassMember(
                                                                                    shareClassId,
                                                                                    m.userId
                                                                                );
                                                                            if (result.success) {
                                                                                showToast(
                                                                                    t('settings.sharing_removed'),
                                                                                    'success'
                                                                                );
                                                                                setClassMembers((prev) =>
                                                                                    prev.filter(
                                                                                        (x) => x.userId !== m.userId
                                                                                    )
                                                                                );
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

                        {/* Danger zone */}
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
                                        result.success ? 'All database data deleted' : `Error: ${result.error}`,
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
                            onEmailSuccess={() => showToast('Signed in — reconnect to sync', 'success')}
                        />
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
                                {showAdvancedConnect ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                Self-hosted / advanced (manual connection)
                            </button>
                            {showAdvancedConnect && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                                    <p className="text-muted text-sm" style={{ margin: 0 }}>
                                        Run <code>supabase start</code> locally or use a custom project at{' '}
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
                                                    showToast('Supabase configured — sign in above', 'success');
                                                } else showToast('Connection failed — check URL and key', 'error');
                                            }}
                                        >
                                            {dbConnecting ? (
                                                <>
                                                    <RefreshCw size={13} className="spin" /> Connecting…
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
                                                    <RefreshCw size={13} className="spin" /> Connecting…
                                                </>
                                            ) : (
                                                <>
                                                    <Database size={13} /> Connect &amp; Sync (anonymous)
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
        </div>
    );
}

// ─── Integrations tab ─────────────────────────────────────────────────────────

function IntegrationsTab() {
    const { t } = useTranslation();
    const { settings, updateSettings } = useApp();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 680 }}>
            {/* Standards Integration */}
            <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                    <Key size={20} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                    <h3 style={{ margin: 0 }}>{t('settings.standards_integration')}</h3>
                </div>
                <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
                    <Trans i18nKey="settings.standards_help_1">
                        To link standards (CCSS, NGSS, etc.) from the <strong>Common Standards Project</strong>, you
                        need a free API key.
                    </Trans>
                </p>
                <div className="form-group">
                    <label htmlFor="admin-standards-key">{t('settings.standards_api_key')}</label>
                    <input
                        id="admin-standards-key"
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
                    <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertCircle size={14} aria-hidden="true" /> {t('settings.standards_setup_instructions')}
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
                            <Trans i18nKey="settings.standards_setup_3" values={{ origin: window.location.origin }}>
                                <strong>Important:</strong> Add this app's URL (<code>{window.location.origin}</code>)
                                to the <strong>Allowed Origins</strong> list on their dashboard, or requests will be
                                blocked by CORS.
                            </Trans>
                        </li>
                    </ol>
                </div>
            </div>

            {/* Cambridge Dictionary API */}
            <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                    <Key size={20} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                    <h3 style={{ margin: 0 }}>{t('settings.cambridge_api_title')}</h3>
                    <span
                        style={{
                            marginLeft: 'auto',
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            fontStyle: 'italic',
                        }}
                    >
                        {t('settings.optional')}
                    </span>
                </div>
                <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
                    {t('settings.cambridge_api_help')}
                </p>
                <div className="form-group">
                    <label htmlFor="admin-cambridge-key">{t('settings.cambridge_api_key')}</label>
                    <input
                        id="admin-cambridge-key"
                        type="password"
                        value={settings.cambridgeApiKey ?? ''}
                        onChange={(e) => updateSettings({ cambridgeApiKey: e.target.value || undefined })}
                        placeholder={t('settings.cambridge_api_placeholder')}
                        autoComplete="off"
                    />
                </div>
                <div
                    style={{
                        marginTop: 12,
                        fontSize: '0.82rem',
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    <ExternalLink size={13} aria-hidden="true" />
                    <span>
                        {t('settings.cambridge_api_register')}{' '}
                        <a href="https://dictionary-api.cambridge.org/" target="_blank" rel="noopener noreferrer">
                            dictionary-api.cambridge.org
                        </a>
                    </span>
                </div>
            </div>
        </div>
    );
}

// ─── Data tab (student anonymization) ────────────────────────────────────────

function DataTab() {
    const { t } = useTranslation();
    const { students, anonymizeStudent } = useApp();

    function handleAnonymize(id: string) {
        if (!window.confirm(t('admin.anonymize_confirm'))) return;
        anonymizeStudent(id);
    }

    if (students.length === 0) return <p style={{ color: 'var(--text-muted)' }}>{t('admin.data_empty')}</p>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {students.map((s) => (
                <div
                    key={s.id}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 0',
                        borderBottom: '1px solid var(--border)',
                    }}
                >
                    <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 500, color: 'var(--text)', fontSize: '0.875rem' }}>{s.name}</span>
                        {s.email && (
                            <span style={{ marginLeft: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {s.email}
                            </span>
                        )}
                    </div>
                    {s.anonymizedAt ? (
                        <span
                            style={{
                                fontSize: '0.75rem',
                                color: '#64748b',
                                background: 'var(--bg-panel)',
                                border: '1px solid var(--border)',
                                borderRadius: 4,
                                padding: '2px 8px',
                            }}
                        >
                            {t('admin.anonymized_badge')}
                        </span>
                    ) : (
                        <button
                            className="btn btn-secondary btn-sm"
                            style={{ color: '#dc2626' }}
                            onClick={() => handleAnonymize(s.id)}
                        >
                            {t('admin.anonymize_btn')}
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}

// ─── Retention tab ────────────────────────────────────────────────────────────

function RetentionTab() {
    const { t } = useTranslation();
    return (
        <div style={{ maxWidth: 560 }}>
            <p style={{ color: 'var(--text)', lineHeight: 1.6 }}>{t('admin.retention_desc')}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 8 }}>
                {t('admin.retention_per_school')}
            </p>
        </div>
    );
}

// ─── Admin page ───────────────────────────────────────────────────────────────

export default function AdminPage() {
    const { t } = useTranslation();
    const [tab, setTab] = useState<Tab>('users');

    const tabs: { id: Tab; label: string; Icon: React.ElementType }[] = [
        { id: 'users', label: t('admin.tab_users'), Icon: Users },
        { id: 'schools', label: t('admin.tab_schools'), Icon: School },
        { id: 'database', label: t('admin.tab_database'), Icon: Database },
        { id: 'integrations', label: t('admin.tab_integrations'), Icon: Plug },
        { id: 'data', label: t('admin.tab_data'), Icon: Clock },
        { id: 'retention', label: t('admin.tab_retention'), Icon: Clock },
    ];

    return (
        <>
            <Topbar title={t('admin.title')} />

            <div className="page-content fade-in">
                <div
                    style={{
                        display: 'flex',
                        gap: 4,
                        marginBottom: 24,
                        borderBottom: '1px solid var(--border)',
                        paddingBottom: 0,
                        flexWrap: 'wrap',
                    }}
                >
                    {tabs.map(({ id, label, Icon }) => (
                        <button
                            key={id}
                            onClick={() => setTab(id)}
                            style={{
                                background: 'none',
                                border: 'none',
                                borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
                                padding: '8px 16px',
                                cursor: 'pointer',
                                fontWeight: tab === id ? 600 : 400,
                                color: tab === id ? 'var(--accent)' : 'var(--text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: '0.9rem',
                                transition: 'color 0.15s',
                            }}
                        >
                            <Icon size={15} />
                            {label}
                        </button>
                    ))}
                </div>

                {tab === 'users' && <UsersTab />}
                {tab === 'schools' && <SchoolsTab />}
                {tab === 'database' && <DatabaseTab />}
                {tab === 'integrations' && <IntegrationsTab />}
                {tab === 'data' && <DataTab />}
                {tab === 'retention' && <RetentionTab />}
            </div>
        </>
    );
}
