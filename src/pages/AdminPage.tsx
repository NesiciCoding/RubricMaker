import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, School, Database, Clock, Loader, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import type { DbUser } from '../services/database/types';
import type { School as SchoolType } from '../types';

type Tab = 'users' | 'schools' | 'data' | 'retention';

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
        fetchAllUsers().then((u) => { setUsers(u); setLoading(false); });
    }, [fetchAllUsers]);

    async function handleRoleChange(userId: string, newRole: 'admin' | 'user' | 'student') {
        setSaving(userId);
        const result = await updateUserRole(userId, newRole);
        if (result.success) {
            setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
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
                            <th key={k} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {t(`admin.${k}`)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {users.map((u) => (
                        <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 12px', fontSize: '0.875rem', color: 'var(--text)' }}>{u.email ?? '—'}</td>
                            <td style={{ padding: '10px 12px', fontSize: '0.875rem', color: 'var(--text)' }}>{u.displayName ?? '—'}</td>
                            <td style={{ padding: '10px 12px' }}>
                                {saving === u.id ? (
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('admin.role_saving')}</span>
                                ) : (
                                    <select
                                        className="input"
                                        style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                                        value={u.role}
                                        disabled={u.id === currentUserId}
                                        onChange={(e) => handleRoleChange(u.id, e.target.value as 'admin' | 'user' | 'student')}
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

    useEffect(() => { load(); }, [load]);

    async function handleCreate() {
        if (!newName.trim()) return;
        setCreating(true);
        const s = await createSchool(newName.trim(), newRetention);
        if (s) { setNewName(''); setNewRetention(3); await load(); }
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
        if (expandedSchool === schoolId) { setExpandedSchool(null); return; }
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
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                        {t('admin.school_name_label')}
                    </label>
                    <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)}
                        placeholder={t('admin.school_name_placeholder')} />
                </div>
                <div style={{ flex: '0 0 120px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                        {t('admin.retention_label')}
                    </label>
                    <input className="input" type="number" min={1} max={20} value={newRetention}
                        onChange={(e) => setNewRetention(Number(e.target.value))} />
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
            {!loading && schools.length === 0 && <p style={{ color: 'var(--text-muted)' }}>{t('admin.schools_empty')}</p>}

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
                                onChange={(e) => setEditRetention((prev) => ({ ...prev, [s.id]: Number(e.target.value) }))}
                                title={t('admin.retention_label')}
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('admin.retention_label').split(' ').pop()}</span>
                            <button className="btn btn-secondary btn-sm" onClick={() => handleUpdateRetention(s.id)}>
                                {t('admin.btn_save')}
                            </button>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleExpand(s.id)}
                                aria-label={expandedSchool === s.id ? t('admin.btn_collapse_members') : t('admin.btn_expand_members')}
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
                            <p style={{ margin: '12px 0 8px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                {t('admin.members_title', { school: s.name })}
                            </p>
                            {!members[s.id] && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('admin.members_loading')}</p>}
                            {members[s.id]?.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('admin.members_empty')}</p>}
                            {members[s.id]?.map((m) => (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                                    <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text)' }}>{m.email ?? m.id}</span>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{m.role}</span>
                                    <button className="btn btn-secondary btn-sm" onClick={() => handleRemoveMember(s.id, m.id)}>
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
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 500, color: 'var(--text)', fontSize: '0.875rem' }}>{s.name}</span>
                        {s.email && <span style={{ marginLeft: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.email}</span>}
                    </div>
                    {s.anonymizedAt ? (
                        <span style={{ fontSize: '0.75rem', color: '#64748b', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px' }}>
                            {t('admin.anonymized_badge')}
                        </span>
                    ) : (
                        <button className="btn btn-secondary btn-sm" style={{ color: '#dc2626' }} onClick={() => handleAnonymize(s.id)}>
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
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 8 }}>{t('admin.retention_per_school')}</p>
        </div>
    );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function AdminPage() {
    const { t } = useTranslation();
    const [tab, setTab] = useState<Tab>('users');

    const tabs: { id: Tab; label: string; Icon: React.ElementType }[] = [
        { id: 'users', label: t('admin.tab_users'), Icon: Users },
        { id: 'schools', label: t('admin.tab_schools'), Icon: School },
        { id: 'data', label: t('admin.tab_data'), Icon: Database },
        { id: 'retention', label: t('admin.tab_retention'), Icon: Clock },
    ];

    return (
        <div className="page-container">
            <Topbar title={t('admin.title')} />

            <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
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
            {tab === 'data' && <DataTab />}
            {tab === 'retention' && <RetentionTab />}
        </div>
    );
}
