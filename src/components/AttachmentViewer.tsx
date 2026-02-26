import React, { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { Download, FileText, ImageIcon, Loader } from 'lucide-react';
import { Attachment } from '../types';

interface Props {
    attachment: Attachment;
}

export default function AttachmentViewer({ attachment }: Props) {
    const docxRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const isImage = attachment.mimeType.startsWith('image/');
    const isPdf = attachment.mimeType === 'application/pdf';
    const isDocx = attachment.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || attachment.name.endsWith('.docx');

    useEffect(() => {
        if (!isDocx || !attachment.dataUrl || !docxRef.current) return;

        const loadDocx = async () => {
            setLoading(true);
            try {
                // Convert base64 dataUrl back to Blob for docx-preview
                const res = await fetch(attachment.dataUrl);
                const blob = await res.blob();

                // Clear any existing content
                if (docxRef.current) docxRef.current.innerHTML = '';

                await renderAsync(blob, docxRef.current as HTMLElement, undefined, {
                    className: 'docx-preview-wrapper',
                    inWrapper: true,
                    ignoreWidth: true,
                    ignoreHeight: false,
                    ignoreFonts: false,
                    breakPages: true,
                    useBase64URL: true,
                });
            } catch (err) {
                console.error('Error rendering docx:', err);
                setError('Failed to preview Word document. Please download to view.');
            } finally {
                setLoading(false);
            }
        };

        loadDocx();
    }, [isDocx, attachment.dataUrl]);

    return (
        <div style={{ marginBottom: 12, padding: 12, background: 'var(--bg-body)', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isImage ? <ImageIcon size={16} className="text-blue" /> : <FileText size={16} className="text-purple" />}
                <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem', fontWeight: 600 }} title={attachment.name}>
                    {attachment.name}
                </div>
                <a href={attachment.dataUrl} download={attachment.name} className="btn btn-ghost btn-icon btn-sm" title="Download">
                    <Download size={14} />
                </a>
            </div>

            {isImage && attachment.dataUrl && (
                <div style={{ width: '100%', marginTop: 8 }}>
                    <img src={attachment.dataUrl} style={{ width: '100%', borderRadius: 4, border: '1px solid var(--border)' }} alt={attachment.name} />
                </div>
            )}

            {isPdf && attachment.dataUrl && (
                <div style={{ width: '100%', height: '400px', marginTop: 8 }}>
                    <iframe src={attachment.dataUrl} style={{ width: '100%', height: '100%', borderRadius: 4, border: '1px solid var(--border)' }} title={attachment.name} />
                </div>
            )}

            {isDocx && (
                <div style={{ width: '100%', marginTop: 8, background: '#fff', color: '#000', borderRadius: 4, border: '1px solid var(--border)', overflow: 'hidden' }}>
                    {loading && (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Loader size={20} className="spin" style={{ marginBottom: 8 }} />
                            <div>Loading preview...</div>
                        </div>
                    )}
                    {error && (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--red)' }}>
                            {error}
                        </div>
                    )}
                    <div
                        ref={docxRef}
                        style={{
                            width: '100%',
                            maxHeight: '400px',
                            overflowY: 'auto',
                            backgroundColor: '#f2f2f2' // Classic word viewer background
                        }}
                    />
                </div>
            )}

            {!isImage && !isPdf && !isDocx && (
                <div className="text-xs text-muted" style={{ padding: 8, background: 'var(--bg-elevated)', borderRadius: 4, textAlign: 'center', marginTop: 8 }}>
                    Preview not available. Please download to view.
                </div>
            )}
        </div>
    );
}
