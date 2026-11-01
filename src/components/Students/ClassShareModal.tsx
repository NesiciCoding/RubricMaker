import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users2, UserMinus, X } from 'lucide-react';
import Modal from '../ui/Modal';
import { InlineSkeleton } from '../ui/Skeleton';
import { storageSync } from '../../services/database';
import { useDbStatus } from '../../hooks/useDbStatus';
import type { Class, ClassMember } from '../../types';

interface Props {
    classItem: Class;
    onClose: () => void;
    returnFocusTo?: HTMLElement | null;
}

type Status =
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'self' }
    | { kind: 'success' | 'notfound' | 'error'; message: string };

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function ClassShareModal({ classItem, onClose, returnFocusTo }: Props) {
    const { t } = useTranslation();
    const dbStatus = useDbStatus();
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<ClassMember['role']>('viewer');
    const [status, setStatus] = useState<Status>({ kind: 'idle' });
    const [members, setMembers] = useState<ClassMember[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [pendingMemberIds, setPendingMemberIds] = useState<ReadonlySet<string>>(new Set());

    useEffect(() => {
        if (!dbStatus.isConnected) return;
        let cancelled = false;
        setLoadingMembers(true);
        storageSync.adapter
            .fetchClassMembers(classItem.id)
            .then((list) => {
                if (!cancelled) setMembers(list);
            })
            .catch((e: unknown) => {
                if (!cancelled) setStatus({ kind: 'error', message: errorMessage(e) });
            })
            .finally(() => {
                if (!cancelled) setLoadingMembers(false);
            });
        return () => {
            cancelled = true;
        };
    }, [classItem.id, dbStatus.isConnected]);

    // class_members RLS only lets a non-owner read their own row, so seeing yourself in the
    // list means this class was shared with you and the owner alone manages access.
    const sharedWithMe = !!dbStatus.userId && members.some((m) => m.userId === dbStatus.userId);

    async function handleShare() {
        const trimmed = email.trim();
        if (!trimmed) return;
        setStatus({ kind: 'loading' });
        try {
            const result = await storageSync.adapter.addClassMemberByEmail(classItem.id, trimmed, role);
            if (result.success) {
                setStatus({ kind: 'success', message: trimmed });
                setEmail('');
                setMembers(await storageSync.adapter.fetchClassMembers(classItem.id));
            } else if (result.notFound) {
                setStatus({ kind: 'notfound', message: trimmed });
            } else if (result.isSelf) {
                setStatus({ kind: 'self' });
            } else {
                setStatus({ kind: 'error', message: result.error ?? '' });
            }
        } catch (e) {
            setStatus({ kind: 'error', message: errorMessage(e) });
        }
    }

    // One mutation per member at a time: a role upsert finishing after a removal would re-grant access.
    async function mutateMember(
        member: ClassMember,
        run: () => Promise<{ success: boolean; error?: string }>,
        onSuccess: () => void
    ) {
        if (pendingMemberIds.has(member.userId)) return;
        setPendingMemberIds((prev) => new Set(prev).add(member.userId));
        try {
            const result = await run();
            if (result.success) onSuccess();
            else setStatus({ kind: 'error', message: result.error ?? '' });
        } catch (e) {
            setStatus({ kind: 'error', message: errorMessage(e) });
        } finally {
            setPendingMemberIds((prev) => {
                const next = new Set(prev);
                next.delete(member.userId);
                return next;
            });
        }
    }

    function handleRoleChange(member: ClassMember, next: ClassMember['role']) {
        return mutateMember(
            member,
            () => storageSync.adapter.addClassMember(classItem.id, member.userId, next),
            () => setMembers((prev) => prev.map((m) => (m.userId === member.userId ? { ...m, role: next } : m)))
        );
    }

    function handleRemove(member: ClassMember) {
        return mutateMember(
            member,
            () => storageSync.adapter.removeClassMember(classItem.id, member.userId),
            () => {
                setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
                setStatus({ kind: 'idle' });
            }
        );
    }

    return (
        <Modal titleId="class-share-title" onClose={onClose} maxWidth={500} returnFocusTo={returnFocusTo}>
            <div className="modal-header">
                <h3 id="class-share-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Users2 size={16} aria-hidden="true" /> {t('classShare.title')}
                </h3>
                <button className="btn btn-ghost btn-icon" aria-label={t('common.close')} onClick={onClose}>
                    <X size={16} aria-hidden="true" />
                </button>
            </div>
            <div className="modal-body">
                <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
                    {t('classShare.description', { className: classItem.name })}
                </p>

                {!dbStatus.isConnected ? (
                    <p className="text-sm" role="status" style={{ color: 'var(--text-muted)' }}>
                        {t('classShare.requires_cloud')}
                    </p>
                ) : sharedWithMe ? (
                    <p className="text-sm" role="status" style={{ color: 'var(--text-muted)' }}>
                        {t('classShare.shared_with_you')}
                    </p>
                ) : (
                    <>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                            <input
                                type="email"
                                aria-label={t('classShare.email_label')}
                                placeholder={t('classShare.email_placeholder')}
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    setStatus({ kind: 'idle' });
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') void handleShare();
                                }}
                                style={{ flex: 1, minWidth: 180 }}
                                autoFocus
                            />
                            <select
                                aria-label={t('classShare.role_label')}
                                value={role}
                                onChange={(e) => setRole(e.target.value as ClassMember['role'])}
                            >
                                <option value="viewer">{t('classShare.role_viewer')}</option>
                                <option value="editor">{t('classShare.role_editor')}</option>
                            </select>
                            <button
                                className="btn btn-primary"
                                disabled={!email.trim() || status.kind === 'loading'}
                                onClick={() => void handleShare()}
                            >
                                {t('classShare.share_btn')}
                            </button>
                        </div>
                        <p className="text-xs text-muted" style={{ marginBottom: 12 }}>
                            {t('classShare.role_hint')}
                        </p>
                    </>
                )}

                <div aria-live="polite">
                    {status.kind === 'success' && (
                        <p style={{ color: 'var(--green-text)', fontSize: '0.85rem', marginBottom: 8 }}>
                            {t('classShare.success', { email: status.message })}
                        </p>
                    )}
                    {status.kind === 'notfound' && (
                        <p style={{ color: 'var(--red-text)', fontSize: '0.85rem', marginBottom: 8 }}>
                            {t('classShare.not_found', { email: status.message })}
                        </p>
                    )}
                    {status.kind === 'self' && (
                        <p style={{ color: 'var(--red-text)', fontSize: '0.85rem', marginBottom: 8 }}>
                            {t('classShare.cannot_share_self')}
                        </p>
                    )}
                    {status.kind === 'error' && (
                        <p style={{ color: 'var(--red-text)', fontSize: '0.85rem', marginBottom: 8 }}>
                            {t('classShare.failed', { error: status.message })}
                        </p>
                    )}
                </div>

                {dbStatus.isConnected && !sharedWithMe && (
                    <div>
                        <p
                            className="text-xs text-muted"
                            style={{ marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}
                        >
                            {t('classShare.members_title')}
                        </p>
                        {loadingMembers ? (
                            <InlineSkeleton rows={2} label={t('classShare.loading_members')} />
                        ) : members.length === 0 ? (
                            <p className="text-sm text-muted">{t('classShare.no_members')}</p>
                        ) : (
                            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                {members.map((m) => {
                                    const label = m.displayName ?? m.email ?? m.userId;
                                    const pending = pendingMemberIds.has(m.userId);
                                    return (
                                        <li
                                            key={m.userId}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                padding: '6px 0',
                                                borderBottom: '1px solid var(--border)',
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0, fontSize: '0.875rem' }}>
                                                <div>{label}</div>
                                                {m.displayName && m.email && (
                                                    <div className="text-xs text-muted">{m.email}</div>
                                                )}
                                            </div>
                                            <select
                                                aria-label={t('classShare.role_for', { name: label })}
                                                value={m.role}
                                                disabled={pending}
                                                onChange={(e) =>
                                                    void handleRoleChange(m, e.target.value as ClassMember['role'])
                                                }
                                            >
                                                <option value="viewer">{t('classShare.role_viewer')}</option>
                                                <option value="editor">{t('classShare.role_editor')}</option>
                                            </select>
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                aria-label={t('classShare.remove', { name: label })}
                                                title={t('classShare.remove', { name: label })}
                                                style={{ color: 'var(--red-text)' }}
                                                disabled={pending}
                                                onClick={() => void handleRemove(m)}
                                            >
                                                <UserMinus size={14} aria-hidden="true" />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                )}
            </div>
            <div className="modal-footer">
                <button className="btn btn-secondary" onClick={onClose}>
                    {t('common.close')}
                </button>
            </div>
        </Modal>
    );
}
