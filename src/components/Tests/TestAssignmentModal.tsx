import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { X, Copy, Check, ClipboardCheck, Database, ExternalLink, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import { useApp } from '../../context/AppContext';
import { useDbStatus } from '../../hooks/useDbStatus';
import { loadSupabaseConfig } from '../../services/database';
import { encodeTestAssignment } from '../../utils/shareCode';
import { nanoid } from '../../utils/nanoid';
import { toLocalDatetimeInput } from '../../utils/dateInput';
import type { Test, TestAssignmentPayload, TestAssignment } from '../../types';

interface Props {
    test: Test;
    onClose: () => void;
}

export default function TestAssignmentModal({ test, onClose }: Props) {
    const { t } = useTranslation();
    const { students, classes, settings, saveTestAssignment } = useApp();
    const dbStatus = useDbStatus();
    const config = loadSupabaseConfig();

    const [classId, setClassId] = useState(settings.activeClassId ?? classes[0]?.id ?? '');
    const [expiresAt, setExpiresAt] = useState(test.dueDate ? toLocalDatetimeInput(test.dueDate) : '');
    const [embedDb, setEmbedDb] = useState(dbStatus.isConnected);
    const [copiedStudentId, setCopiedStudentId] = useState<string | null>(null);
    const [copiedAll, setCopiedAll] = useState(false);
    // Keyed by `${studentId}::${expiresAt}` rather than bare student id, so changing the
    // deadline after an initial auto-save is treated as a new payload and re-saved, instead
    // of silently leaving already-persisted rows stuck on their original (now stale) expiry.
    const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);
    const [saveErrorCount, setSaveErrorCount] = useState(0);

    const savedKeyFor = useCallback((studentId: string) => `${studentId}::${expiresAt}`, [expiresAt]);

    const classStudents = useMemo(
        () => students.filter((s) => (classId ? s.classId === classId : true)),
        [students, classId]
    );

    // One teacherKey per student — test_assignments rows are 1:1 with a single teacherKey
    // server-side (same constraint essay_assignments has), so a whole-class share batch
    // needs a distinct row id per student rather than the single shared key used for the
    // offline/legacy link format. Keyed off the full `students` list (not the class-filtered
    // one) so switching the class dropdown back and forth doesn't regenerate keys for
    // students already saved under their original key — savedKeys tracks per-student save
    // state, and a regenerated key for an already-saved student would silently un-sync the
    // displayed link from what's actually persisted.
    const teacherKeys = useMemo(() => {
        const map: Record<string, string> = {};
        students.forEach((s) => {
            map[s.id] = nanoid();
        });
        return map;
    }, [students]);

    // Saved-progress display must be scoped to the CURRENT class, not the lifetime total
    // across every class visited this session — savedKeys accumulates globally so the
    // save logic can skip already-persisted students on a class revisit, but showing that
    // raw total against the current (possibly smaller) class's count would read as nonsense
    // (e.g. "3/1 saved").
    const classSavedCount = classStudents.filter((s) => savedKeys.has(savedKeyFor(s.id))).length;

    const buildAssignment = useCallback(
        (studentId: string): TestAssignmentPayload => {
            const base: TestAssignmentPayload = {
                testId: test.id,
                studentId,
                teacherKey: teacherKeys[studentId] ?? nanoid(),
                requireSEB: test.requireSEB,
                durationMinutes: test.durationMinutes,
                createdAt: new Date().toISOString(),
                expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
            };
            if (embedDb && dbStatus.isConnected && config) {
                base.supabaseUrl = config.supabaseUrl;
                base.supabaseAnonKey = config.supabaseAnonKey;
            } else {
                base.test = test;
            }
            return base;
        },
        [test, teacherKeys, expiresAt, embedDb, dbStatus.isConnected, config]
    );

    function buildUrl(studentId: string): string {
        const code = encodeTestAssignment(buildAssignment(studentId));
        return `${window.location.origin}${window.location.pathname}#/test/${code}`;
    }

    const handleSaveAllToDb = useCallback(async () => {
        setSaving(true);
        setSaveErrorCount(0);
        try {
            const nowSaved = new Set(savedKeys);
            const pending = classStudents.filter((s) => !nowSaved.has(savedKeyFor(s.id)));
            const results = await Promise.allSettled(
                pending.map((s) =>
                    saveTestAssignment({
                        testId: test.id,
                        studentId: s.id,
                        teacherKey: teacherKeys[s.id],
                        testName: test.name,
                        requireSEB: test.requireSEB,
                        durationMinutes: test.durationMinutes,
                        createdAt: new Date().toISOString(),
                        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
                    } satisfies TestAssignment)
                )
            );
            let errors = 0;
            results.forEach((result, i) => {
                if (result.status === 'fulfilled' && result.value.success) {
                    nowSaved.add(savedKeyFor(pending[i].id));
                } else {
                    errors += 1;
                }
            });
            setSavedKeys(nowSaved);
            setSaveErrorCount(errors);
        } finally {
            setSaving(false);
        }
    }, [classStudents, teacherKeys, test, expiresAt, saveTestAssignment, savedKeys, savedKeyFor]);

    // Auto-save as soon as a DB-mode batch of links becomes shareable, same rationale as
    // EssayAssignmentModal: gating behind a separate button click leaves a window where a
    // teacher could hand out a link before its row exists server-side. Re-runs when
    // expiresAt changes too — savedKeyFor makes that a "new" payload per student, so
    // editing the deadline after the first auto-save doesn't leave stale rows behind.
    useEffect(() => {
        if (embedDb && !saving) {
            void handleSaveAllToDb();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [embedDb, classId, expiresAt]);

    async function handleCopyOne(studentId: string) {
        try {
            await navigator.clipboard.writeText(buildUrl(studentId));
            setCopiedStudentId(studentId);
            setTimeout(() => setCopiedStudentId(null), 2500);
        } catch {
            setCopiedStudentId(null);
        }
    }

    async function handleCopyAll() {
        const text = classStudents.map((s) => `${s.name}: ${buildUrl(s.id)}`).join('\n');
        try {
            await navigator.clipboard.writeText(text);
            setCopiedAll(true);
            setTimeout(() => setCopiedAll(false), 2500);
        } catch {
            setCopiedAll(false);
        }
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
                            <>
                                <p
                                    style={{
                                        margin: 0,
                                        fontSize: '0.8rem',
                                        color: 'var(--text-muted)',
                                        lineHeight: 1.5,
                                    }}
                                >
                                    {t('tests.assignment_db_embed_help')}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={handleSaveAllToDb}
                                        disabled={saving || classSavedCount >= classStudents.length}
                                    >
                                        {classSavedCount >= classStudents.length && classStudents.length > 0 ? (
                                            <>
                                                <Check size={13} /> {t('essay_assignment.saved_to_db')}
                                            </>
                                        ) : saving ? (
                                            t('essay_assignment.saving')
                                        ) : (
                                            <>
                                                <Database size={13} /> {t('tests.assignment_save_all_to_db')}
                                            </>
                                        )}
                                    </button>
                                    {classStudents.length > 0 && (
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                            {t('tests.assignment_saved_count', {
                                                saved: classSavedCount,
                                                total: classStudents.length,
                                            })}
                                        </span>
                                    )}
                                    {saveErrorCount > 0 && (
                                        <span
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 4,
                                                color: 'var(--red)',
                                                fontSize: '0.8rem',
                                            }}
                                        >
                                            <AlertCircle size={12} />
                                            {t('tests.assignment_save_partial_error', { count: saveErrorCount })}
                                        </span>
                                    )}
                                </div>
                            </>
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
                                    {import.meta.env.DEV && (
                                        <a
                                            className="btn btn-ghost btn-icon btn-sm"
                                            style={{ flexShrink: 0 }}
                                            title={t('tests.dev_open_as_student')}
                                            aria-label={t('tests.dev_open_as_student')}
                                            href={buildUrl(s.id)}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            <ExternalLink size={14} />
                                        </a>
                                    )}
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
