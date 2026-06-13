import React, { useState, useCallback, useMemo } from 'react';
import { X, Copy, Check, ClipboardCheck, Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import { useApp } from '../../context/AppContext';
import { useDbStatus } from '../../hooks/useDbStatus';
import { loadSupabaseConfig } from '../../services/database';
import { encodeTestAssignment } from '../../utils/testShareCode';
import { nanoid } from '../../utils/nanoid';
import type { Test, TestAssignmentPayload } from '../../types';

interface Props {
    test: Test;
    onClose: () => void;
}

export default function TestAssignmentModal({ test, onClose }: Props) {
    const { t } = useTranslation();
    const { students, classes, settings } = useApp();
    const dbStatus = useDbStatus();
    const config = loadSupabaseConfig();

    const [classId, setClassId] = useState(settings.activeClassId ?? classes[0]?.id ?? '');
    const [expiresAt, setExpiresAt] = useState('');
    const [embedDb, setEmbedDb] = useState(dbStatus.isConnected);
    const [copiedStudentId, setCopiedStudentId] = useState<string | null>(null);
    const [copiedAll, setCopiedAll] = useState(false);

    const teacherKey = useMemo(() => nanoid(), []);

    const classStudents = useMemo(
        () => students.filter((s) => (classId ? s.classId === classId : true)),
        [students, classId]
    );

    const buildAssignment = useCallback(
        (studentId: string): TestAssignmentPayload => {
            const base: TestAssignmentPayload = {
                testId: test.id,
                studentId,
                teacherKey,
                requireSEB: test.requireSEB,
                durationMinutes: test.durationMinutes,
                createdAt: new Date().toISOString(),
                expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
            };
            if (embedDb && dbStatus.isConnected && config) {
                base.supabaseUrl = config.supabaseUrl;
                base.supabaseAnonKey = config.supabaseAnonKey;
            }
            return base;
        },
        [test, teacherKey, expiresAt, embedDb, dbStatus.isConnected, config]
    );

    function buildUrl(studentId: string): string {
        const code = encodeTestAssignment(buildAssignment(studentId));
        return `${window.location.origin}${window.location.pathname}#/test/${code}`;
    }

    function handleCopyOne(studentId: string) {
        navigator.clipboard.writeText(buildUrl(studentId)).then(() => {
            setCopiedStudentId(studentId);
            setTimeout(() => setCopiedStudentId(null), 2500);
        });
    }

    function handleCopyAll() {
        const text = classStudents.map((s) => `${s.name}: ${buildUrl(s.id)}`).join('\n');
        navigator.clipboard.writeText(text).then(() => {
            setCopiedAll(true);
            setTimeout(() => setCopiedAll(false), 2500);
        });
    }

    return (
        <Modal titleId="test-assignment-title" onClose={onClose} maxWidth={620}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ClipboardCheck size={18} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                    <h2 id="test-assignment-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                        {t('tests.assignment_modal_title', { name: test.name })}
                    </h2>
                </div>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label={t('common.close')}>
                    <X size={16} />
                </button>
            </div>

            <div
                style={{
                    padding: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    maxHeight: '70vh',
                    overflowY: 'auto',
                }}
            >
                {/* Class picker */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="ta-class">{t('tests.assignment_class_label')}</label>
                    <select id="ta-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
                        {classes.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Expiry */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="ta-expires-at">
                        {t('tests.assignment_deadline_label')}{' '}
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                            ({t('essay_assignment.deadline_help')})
                        </span>
                    </label>
                    <input
                        id="ta-expires-at"
                        type="datetime-local"
                        value={expiresAt}
                        onChange={(e) => setExpiresAt(e.target.value)}
                        style={{ width: '100%' }}
                    />
                </div>

                {/* DB integration toggle */}
                {dbStatus.isConnected && (
                    <div
                        style={{
                            background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                            borderRadius: 8,
                            padding: '10px 14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}
                    >
                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={embedDb}
                                onChange={(e) => setEmbedDb(e.target.checked)}
                                style={{ accentColor: 'var(--accent)' }}
                            />
                            <Database size={13} style={{ color: 'var(--accent)' }} />
                            {t('essay_assignment.db_embed_label')}
                        </label>
                        {embedDb && (
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                {t('essay_assignment.db_embed_help')}
                            </p>
                        )}
                    </div>
                )}

                {/* Student links */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                        }}
                    >
                        <label style={{ marginBottom: 0 }}>{t('tests.assignment_links_label')}</label>
                        {classStudents.length > 1 && (
                            <button className="btn btn-secondary btn-sm" onClick={handleCopyAll}>
                                {copiedAll ? <Check size={14} /> : <Copy size={14} />}
                                {copiedAll
                                    ? t('essay_assignment.copied')
                                    : t('tests.copy_all_links', { count: classStudents.length })}
                            </button>
                        )}
                    </div>
                    {classStudents.length === 0 ? (
                        <p className="text-muted text-sm">{t('comparativeGrading.no_classes')}</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {classStudents.map((s) => (
                                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ flexShrink: 0, minWidth: 100, fontSize: '0.85rem' }}>{s.name}</span>
                                    <input
                                        readOnly
                                        value={buildUrl(s.id)}
                                        aria-label={t('tests.assignment_link_for', { name: s.name })}
                                        style={{
                                            flex: 1,
                                            fontFamily: 'monospace',
                                            fontSize: '0.75rem',
                                            color: 'var(--text-muted)',
                                        }}
                                    />
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        style={{ flexShrink: 0 }}
                                        onClick={() => handleCopyOne(s.id)}
                                    >
                                        {copiedStudentId === s.id ? <Check size={14} /> : <Copy size={14} />}
                                        {copiedStudentId === s.id
                                            ? t('essay_assignment.copied')
                                            : t('essay_assignment.copy')}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div
                style={{
                    padding: '14px 20px',
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                }}
            >
                <button className="btn btn-secondary btn-sm" onClick={onClose}>
                    {t('common.close')}
                </button>
            </div>
        </Modal>
    );
}
