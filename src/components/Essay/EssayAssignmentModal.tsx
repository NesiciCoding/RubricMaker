import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { X, Copy, Download, Check, FileText, Database, AlertCircle, Radio } from 'lucide-react';
import { saveAs } from 'file-saver';
import { useTranslation } from 'react-i18next';
import { encodeEssayAssignment } from '../../utils/essayShareCode';
import { nanoid } from '../../utils/nanoid';
import Modal from '../ui/Modal';
import type { EssayAssignment } from '../../types';
import { useDbStatus } from '../../hooks/useDbStatus';
import { loadSupabaseConfig } from '../../services/database';

interface Props {
    rubricId: string;
    rubricName: string;
    studentId: string;
    studentName: string;
    onClose: () => void;
    onOpenSlipSheet: (assignment: EssayAssignment, classStudents: { id: string; name: string }[]) => void;
    onSaveAssignment?: (assignment: EssayAssignment) => Promise<{ success: boolean; error?: string }>;
    classStudents: { id: string; name: string }[];
}

export default function EssayAssignmentModal({
    rubricId,
    rubricName,
    studentId,
    studentName,
    onClose,
    onOpenSlipSheet,
    onSaveAssignment,
    classStudents,
}: Props) {
    const { t } = useTranslation();
    const dbStatus = useDbStatus();
    const config = loadSupabaseConfig();

    const [title, setTitle] = useState(rubricName);
    const [prompt, setPrompt] = useState('');
    const [minWords, setMinWords] = useState('');
    const [maxWords, setMaxWords] = useState('');
    const [timeLimitMinutes, setTimeLimitMinutes] = useState('');
    const [requireSEB, setRequireSEB] = useState(false);
    const [readOnlyAfterSubmit, setReadOnlyAfterSubmit] = useState(true);
    const [expiresAt, setExpiresAt] = useState('');
    const [embedDb, setEmbedDb] = useState(dbStatus.isConnected); // on by default when connected
    const [copied, setCopied] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [saving, setSaving] = useState(false);

    const teacherKey = React.useMemo(() => nanoid(), []);

    const buildAssignment = useCallback(
        (sid: string): EssayAssignment => {
            const base: EssayAssignment = {
                rubricId,
                studentId: sid,
                teacherKey,
                title,
                prompt: prompt || undefined,
                minWords: minWords ? parseInt(minWords, 10) : undefined,
                maxWords: maxWords ? parseInt(maxWords, 10) : undefined,
                timeLimitMinutes: timeLimitMinutes ? parseInt(timeLimitMinutes, 10) : undefined,
                requireSEB,
                readOnlyAfterSubmit,
                createdAt: new Date().toISOString(),
                expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
            };
            // Embed Supabase credentials so the student page can submit directly to the DB
            if (embedDb && dbStatus.isConnected && config) {
                base.supabaseUrl = config.supabaseUrl;
                base.supabaseAnonKey = config.supabaseAnonKey;
            }
            return base;
        },
        [
            rubricId,
            teacherKey,
            title,
            prompt,
            minWords,
            maxWords,
            timeLimitMinutes,
            requireSEB,
            readOnlyAfterSubmit,
            expiresAt,
            embedDb,
            dbStatus.isConnected,
            config,
        ]
    );

    const essayUrl = `${window.location.origin}${window.location.pathname}#/essay/${encodeEssayAssignment(buildAssignment(studentId))}`;

    const handleCopyLink = useCallback(() => {
        navigator.clipboard.writeText(essayUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        });
    }, [essayUrl]);

    const handleSaveToDb = useCallback(async () => {
        if (!onSaveAssignment) return;
        setSaving(true);
        setSaveError('');
        try {
            const assignment = buildAssignment(studentId);
            const result = await onSaveAssignment(assignment);
            if (result.success) {
                setSaved(true);
            } else {
                setSaveError(result.error ?? t('essay_assignment.save_error_fallback'));
            }
        } catch {
            setSaveError(t('essay_assignment.save_error_fallback'));
        } finally {
            setSaving(false);
        }
    }, [onSaveAssignment, buildAssignment, studentId, t]);

    const handleDownloadSEB = useCallback(() => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>startURL</key>
\t<string>${essayUrl}</string>
\t<key>allowQuit</key>
\t<false/>
\t<key>quitURL</key>
\t<string>${window.location.origin}/#/seb-done</string>
\t<key>quitURLConfirm</key>
\t<false/>
\t<key>browserWindowAllowAddressBar</key>
\t<false/>
\t<key>URLFilterEnable</key>
\t<true/>
\t<key>URLFilterRules</key>
\t<array>
\t\t<dict>
\t\t\t<key>action</key>
\t\t\t<integer>1</integer>
\t\t\t<key>active</key>
\t\t\t<true/>
\t\t\t<key>expression</key>
\t\t\t<string>${window.location.origin}.*</string>
\t\t\t<key>regex</key>
\t\t\t<false/>
\t\t</dict>
\t</array>
</dict>
</plist>`;
        const blob = new Blob([xml], { type: 'application/xml' });
        saveAs(blob, `essay-${studentName.replace(/\s+/g, '-').toLowerCase()}.seb`);
    }, [essayUrl, studentName]);

    const handlePrintSlips = useCallback(() => {
        const assignment = buildAssignment(studentId);
        onOpenSlipSheet(assignment, classStudents);
        onClose();
    }, [buildAssignment, studentId, classStudents, onOpenSlipSheet, onClose]);

    return (
        <Modal titleId="essay-assignment-title" onClose={onClose} maxWidth={560}>
            {/* Header */}
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
                    <FileText size={18} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                    <h2 id="essay-assignment-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                        {t('essay_assignment.modal_title', { name: studentName })}
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
                {/* Title */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="ea-title">{t('essay_assignment.title_label')}</label>
                    <input
                        id="ea-title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={t('essay_assignment.title_placeholder')}
                    />
                </div>

                {/* Prompt */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="ea-prompt">
                        {t('essay_assignment.prompt_label')}{' '}
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                            ({t('essay_assignment.optional')})
                        </span>
                    </label>
                    <textarea
                        id="ea-prompt"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={3}
                        placeholder={t('essay_assignment.prompt_placeholder')}
                        style={{ resize: 'vertical' }}
                    />
                </div>

                {/* Word limits + time */}
                <div style={{ display: 'flex', gap: 12 }}>
                    <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                        <label htmlFor="ea-min-words">
                            {t('essay_assignment.min_words_label')}{' '}
                            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                                ({t('essay_assignment.opt')})
                            </span>
                        </label>
                        <input
                            id="ea-min-words"
                            type="number"
                            min={0}
                            value={minWords}
                            onChange={(e) => setMinWords(e.target.value)}
                            placeholder={t('essay_assignment.number_placeholder')}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                        <label htmlFor="ea-max-words">
                            {t('essay_assignment.max_words_label')}{' '}
                            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                                ({t('essay_assignment.opt')})
                            </span>
                        </label>
                        <input
                            id="ea-max-words"
                            type="number"
                            min={0}
                            value={maxWords}
                            onChange={(e) => setMaxWords(e.target.value)}
                            placeholder={t('essay_assignment.number_placeholder')}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                        <label htmlFor="ea-time-limit">
                            {t('essay_assignment.time_limit_label')}{' '}
                            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                                ({t('essay_assignment.opt')})
                            </span>
                        </label>
                        <input
                            id="ea-time-limit"
                            type="number"
                            min={1}
                            value={timeLimitMinutes}
                            onChange={(e) => setTimeLimitMinutes(e.target.value)}
                            placeholder={t('essay_assignment.number_placeholder')}
                        />
                    </div>
                </div>

                {/* Toggles */}
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    <label
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={requireSEB}
                            onChange={(e) => setRequireSEB(e.target.checked)}
                            style={{ accentColor: 'var(--accent)' }}
                        />
                        {t('essay_assignment.require_seb_label')}
                    </label>
                    <label
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={readOnlyAfterSubmit}
                            onChange={(e) => setReadOnlyAfterSubmit(e.target.checked)}
                            style={{ accentColor: 'var(--accent)' }}
                        />
                        {t('essay_assignment.lock_after_submit_label')}
                    </label>
                </div>

                {/* Expiry */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="ea-expires-at">
                        {t('essay_assignment.deadline_label')}{' '}
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                            ({t('essay_assignment.deadline_help')})
                        </span>
                    </label>
                    <input
                        id="ea-expires-at"
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

                {/* Save to DB action */}
                {dbStatus.isConnected && embedDb && onSaveAssignment && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={handleSaveToDb}
                            disabled={saving || saved}
                        >
                            {saved ? (
                                <>
                                    <Check size={13} /> {t('essay_assignment.saved_to_db')}
                                </>
                            ) : saving ? (
                                t('essay_assignment.saving')
                            ) : (
                                <>
                                    <Database size={13} /> {t('essay_assignment.save_to_db')}
                                </>
                            )}
                        </button>
                        {saveError && (
                            <span
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    color: 'var(--red)',
                                    fontSize: '0.8rem',
                                }}
                            >
                                <AlertCircle size={12} /> {saveError}
                            </span>
                        )}
                    </div>
                )}

                {/* Generated URL */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="ea-essay-link">{t('essay_assignment.essay_link_label')}</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            id="ea-essay-link"
                            readOnly
                            value={essayUrl}
                            style={{
                                flex: 1,
                                fontFamily: 'monospace',
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                            }}
                        />
                        <button className="btn btn-secondary btn-sm" onClick={handleCopyLink} style={{ flexShrink: 0 }}>
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? t('essay_assignment.copied') : t('essay_assignment.copy')}
                        </button>
                    </div>
                </div>

                {/* Live monitor — only meaningful once the assignment is saved to the DB */}
                {saved && (
                    <Link to={`/essays/${teacherKey}/monitor`} className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
                        <Radio size={14} /> {t('tests.monitor.action_monitor')}
                    </Link>
                )}
            </div>

            {/* Footer */}
            <div
                style={{
                    padding: '14px 20px',
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    justifyContent: 'flex-end',
                }}
            >
                {classStudents.length > 1 && (
                    <button className="btn btn-secondary btn-sm" onClick={handlePrintSlips}>
                        {t('essay_assignment.print_slips', { count: classStudents.length })}
                    </button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={handleDownloadSEB}>
                    <Download size={14} /> {t('essay_assignment.download_seb')}
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleCopyLink}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? t('essay_assignment.link_copied') : t('essay_assignment.copy_link')}
                </button>
            </div>
        </Modal>
    );
}
