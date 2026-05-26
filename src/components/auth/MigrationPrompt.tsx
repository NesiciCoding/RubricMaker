import React, { useState } from 'react';
import { Upload, X, Database, Loader2 } from 'lucide-react';
import Modal from '../Modal';
import { useApp } from '../../context/AppContext';

export default function MigrationPrompt() {
    const { rubrics, students, classes, showMigrationPrompt, dismissMigrationPrompt } = useApp();
    const [uploading, setUploading] = useState(false);

    if (!showMigrationPrompt) return null;

    const counts = [
        rubrics.length > 0 && `${rubrics.length} rubric${rubrics.length !== 1 ? 's' : ''}`,
        students.length > 0 && `${students.length} student${students.length !== 1 ? 's' : ''}`,
        classes.length > 0 && `${classes.length} class${classes.length !== 1 ? 'es' : ''}`,
    ].filter(Boolean) as string[];

    async function handleUpload() {
        setUploading(true);
        await dismissMigrationPrompt(true);
        setUploading(false);
    }

    return (
        <Modal titleId="migration-title" onClose={() => dismissMigrationPrompt(false)} maxWidth={480}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <h2 id="migration-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                    Upload local data to your account?
                </h2>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ background: '#eff6ff', borderRadius: 10, padding: 10, flexShrink: 0 }}>
                        <Database size={22} style={{ color: '#3b82f6' }} />
                    </div>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>
                            We found local data in your browser:{' '}
                            <strong>{counts.join(', ')}</strong>.
                        </p>
                        <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>
                            Would you like to upload it to your account so it's available
                            across devices? This won't delete anything locally.
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" disabled={uploading}
                        onClick={() => dismissMigrationPrompt(false)}>
                        <X size={14} /> Skip for now
                    </button>
                    <button className="btn btn-primary btn-sm" disabled={uploading}
                        onClick={handleUpload}>
                        {uploading
                            ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Uploading…</>
                            : <><Upload size={14} /> Upload to account</>
                        }
                    </button>
                </div>
            </div>
        </Modal>
    );
}
