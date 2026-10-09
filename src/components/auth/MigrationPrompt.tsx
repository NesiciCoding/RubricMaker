import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, X, Database, Loader2, AlertCircle } from 'lucide-react';
import Modal from '../ui/Modal';
import { useAuthoring, useClasses, usePlatform, useStudents } from '../../context/AppContext';

export default function MigrationPrompt() {
    const { t } = useTranslation();
    const { students } = useStudents();
    const { classes } = useClasses();

    const { rubrics } = useAuthoring();
    const { showMigrationPrompt, dismissMigrationPrompt } = usePlatform();

    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    if (!showMigrationPrompt) return null;

    const counts = [
        rubrics.length > 0 && t('migration.count_rubrics', { n: rubrics.length }),
        students.length > 0 && t('migration.count_students', { n: students.length }),
        classes.length > 0 && t('migration.count_classes', { n: classes.length }),
    ].filter(Boolean) as string[];

    async function handleUpload() {
        setUploading(true);
        setUploadError(null);
        try {
            const result = await dismissMigrationPrompt(true);
            if (!result.success) setUploadError(result.error || t('common.unknown_error'));
        } finally {
            setUploading(false);
        }
    }

    function handleSkip() {
        if (!uploading) void dismissMigrationPrompt(false);
    }

    return (
        <Modal titleId="migration-title" onClose={handleSkip} maxWidth={480}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <h2 id="migration-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                    {t('migration.title')}
                </h2>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div
                        style={{
                            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                            borderRadius: 10,
                            padding: 10,
                            flexShrink: 0,
                        }}
                    >
                        <Database size={22} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                    </div>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>
                            {t('migration.found_local')} <strong>{counts.join(', ')}</strong>
                        </p>
                        <p
                            style={{
                                margin: '8px 0 0',
                                fontSize: '0.85rem',
                                color: 'var(--text-muted)',
                                lineHeight: 1.5,
                            }}
                        >
                            {t('migration.explain')}
                        </p>
                    </div>
                </div>

                {uploadError && (
                    <div
                        role="alert"
                        style={{
                            display: 'flex',
                            gap: 8,
                            alignItems: 'flex-start',
                            padding: '10px 12px',
                            borderRadius: 8,
                            background: 'color-mix(in srgb, var(--red) 10%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)',
                            fontSize: '0.85rem',
                            color: 'var(--text)',
                        }}
                    >
                        <AlertCircle size={16} style={{ color: 'var(--red)', flexShrink: 0 }} aria-hidden="true" />
                        <div>
                            <div>{t('migration.upload_failed')}</div>
                            <div style={{ color: 'var(--text-muted)', marginTop: 4, overflowWrap: 'anywhere' }}>
                                {uploadError}
                            </div>
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost btn-sm" disabled={uploading} onClick={handleSkip}>
                        <X size={14} aria-hidden="true" /> {t('migration.skip')}
                    </button>
                    <button className="btn btn-primary btn-sm" disabled={uploading} onClick={handleUpload}>
                        {uploading ? (
                            <>
                                <Loader2
                                    size={14}
                                    style={{ animation: 'spin 1s linear infinite' }}
                                    aria-hidden="true"
                                />{' '}
                                {t('migration.uploading')}
                            </>
                        ) : (
                            <>
                                <Upload size={14} aria-hidden="true" />{' '}
                                {uploadError ? t('migration.retry') : t('migration.upload')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
